import os
import secrets
from urllib.parse import quote_plus

from sqlalchemy import Boolean, Column, Float, ForeignKey, String, Text, create_engine
from sqlalchemy.orm import Session, declarative_base, relationship, sessionmaker

Base = declarative_base()


def _normalize_database_url(raw: str) -> str:
    """Use psycopg3 with Supabase / Postgres; keep sqlite URLs unchanged."""
    u = raw.strip().strip('"').strip("'")
    if u.startswith("sqlite"):
        return u
    if u.startswith("postgres://"):
        u = "postgresql://" + u[len("postgres://") :]
    if u.startswith("postgresql://"):
        scheme, rest = u.split("://", 1)
        if "+" not in scheme:
            return f"postgresql+psycopg://{rest}"
    return u


def _database_url_from_supabase_env() -> str | None:
    """
    Build Postgres URL with URL-encoded credentials.
    Use this when your DB password contains @ ] : # ? etc. — a single DATABASE_URL breaks parsing.
    """
    host = (os.getenv("SUPABASE_DB_HOST") or os.getenv("DB_HOST") or "").strip()
    if not host:
        return None
    user = (os.getenv("SUPABASE_DB_USER") or os.getenv("DB_USER") or "postgres").strip()
    password = os.getenv("SUPABASE_DB_PASSWORD") or os.getenv("DB_PASSWORD") or ""
    port = (os.getenv("SUPABASE_DB_PORT") or os.getenv("DB_PORT") or "5432").strip()
    name = (os.getenv("SUPABASE_DB_NAME") or os.getenv("DB_NAME") or "postgres").strip()
    sslmode = (os.getenv("DB_SSLMODE") or "require").strip()
    u = quote_plus(user, safe="")
    p = quote_plus(password, safe="")
    q = f"?sslmode={quote_plus(sslmode, safe='')}" if sslmode else ""
    return f"postgresql+psycopg://{u}:{p}@{host}:{port}/{name}{q}"


def _resolved_database_url() -> str:
    from_env = _database_url_from_supabase_env()
    if from_env:
        return from_env
    explicit = (os.getenv("DATABASE_URL") or "").strip()
    if explicit:
        return _normalize_database_url(explicit)
    return "sqlite:///./shared_todos.db"


DATABASE_URL = _resolved_database_url()

if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_size=int(os.getenv("DB_POOL_SIZE", "5")),
        max_overflow=int(os.getenv("DB_MAX_OVERFLOW", "10")),
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Profile(Base):
    """App profile keyed by Supabase auth.users.id (UUID)."""

    __tablename__ = "profiles"

    id = Column(String(36), primary_key=True)
    email = Column(String(320), index=True, nullable=False, default="")
    username = Column(String(64), unique=True, nullable=True)
    invite_code = Column(String(32), unique=True, index=True, nullable=False)
    partner_id = Column(String(36), ForeignKey("profiles.id"), nullable=True)

    partner = relationship("Profile", remote_side=[id], foreign_keys=[partner_id], uselist=False)


class Todo(Base):
    __tablename__ = "todos"

    id = Column(String(36), primary_key=True)
    owner_id = Column(String(36), ForeignKey("profiles.id"), nullable=False, index=True)
    text = Column(Text, default="")
    x = Column(Float, default=0.0)
    y = Column(Float, default=0.0)
    completed = Column(Boolean, default=False)
    due_date = Column(Text, nullable=True)
    repeat = Column(String(64), nullable=True)
    timestamp = Column(Text, nullable=False)


def init_db():
    Base.metadata.create_all(bind=engine)


def gen_invite_code(db: Session) -> str:
    for _ in range(20):
        code = secrets.token_hex(4).upper()
        if not db.query(Profile.id).filter(Profile.invite_code == code).first():
            return code
    raise RuntimeError("Could not generate unique invite code")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
