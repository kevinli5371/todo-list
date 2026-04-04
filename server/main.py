import logging
import os
import uuid
from typing import Annotated, Optional

from dotenv import load_dotenv

load_dotenv()

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from auth_utils import decode_supabase_jwt
from db import Profile, Todo, gen_invite_code, get_db, init_db
from schemas import MeResponse, PairRequest, PartnerInfo, TodoCreate, TodoOut, TodoPatch

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(name)s  %(message)s")
logger = logging.getLogger(__name__)

init_db()

app = FastAPI(title="Shared Todo", version="1.0.0")

_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:5174,http://localhost:4173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins.split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer(auto_error=False)


def _ensure_profile(db: Session, user_id: str, email: str) -> Profile:
    p = db.query(Profile).filter(Profile.id == user_id).first()
    if p:
        if email and p.email != email:
            p.email = email
            db.commit()
            db.refresh(p)
        return p
    p = Profile(
        id=user_id,
        email=email or "",
        invite_code=gen_invite_code(db),
        partner_id=None,
    )
    db.add(p)
    try:
        db.commit()
        db.refresh(p)
        return p
    except IntegrityError:
        db.rollback()
        existing = db.query(Profile).filter(Profile.id == user_id).first()
        if existing:
            return existing
        raise


def get_current_profile(
    creds: Annotated[Optional[HTTPAuthorizationCredentials], Depends(security)],
    db: Session = Depends(get_db),
) -> Profile:
    if not creds or creds.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_supabase_jwt(creds.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    sub = payload.get("sub")
    if not sub or not isinstance(sub, str):
        raise HTTPException(status_code=401, detail="Invalid token")
    email = payload.get("email") or ""
    if isinstance(email, str):
        email = email.lower().strip()
    else:
        email = ""
    return _ensure_profile(db, sub, email)


def todo_to_out(row: Todo) -> TodoOut:
    return TodoOut(
        id=row.id,
        owner_id=row.owner_id,
        text=row.text or "",
        x=row.x,
        y=row.y,
        completed=row.completed,
        dueDate=row.due_date,
        repeat=row.repeat,
        timestamp=row.timestamp,
    )


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/me", response_model=MeResponse)
def me(user: Profile = Depends(get_current_profile), db: Session = Depends(get_db)):
    partner = None
    if user.partner_id:
        p = db.query(Profile).filter(Profile.id == user.partner_id).first()
        if p:
            partner = PartnerInfo(id=p.id, email=p.email)
    return MeResponse(
        id=user.id,
        email=user.email,
        invite_code=user.invite_code,
        partner=partner,
    )


@app.post("/api/pair", response_model=MeResponse)
def pair(body: PairRequest, user: Profile = Depends(get_current_profile), db: Session = Depends(get_db)):
    if user.partner_id is not None:
        raise HTTPException(status_code=400, detail="You are already paired with someone")

    code = body.invite_code.strip().upper()
    inviter = db.query(Profile).filter(Profile.invite_code == code).first()
    if not inviter or inviter.id == user.id:
        raise HTTPException(status_code=400, detail="Invalid invite code")
    if inviter.partner_id is not None:
        raise HTTPException(status_code=400, detail="That invite code has already been used")

    user.partner_id = inviter.id
    inviter.partner_id = user.id
    db.commit()
    db.refresh(user)

    p = db.query(Profile).filter(Profile.id == user.partner_id).first()
    partner = PartnerInfo(id=p.id, email=p.email) if p else None
    return MeResponse(
        id=user.id,
        email=user.email,
        invite_code=user.invite_code,
        partner=partner,
    )


@app.get("/api/todos", response_model=list[TodoOut])
def list_todos(
    scope: str,
    user: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
):
    if scope not in ("mine", "partner", "both"):
        raise HTTPException(status_code=400, detail="scope must be mine, partner, or both")

    if scope == "both":
        if user.partner_id:
            rows = (
                db.query(Todo)
                .filter(Todo.owner_id.in_([user.id, user.partner_id]))
                .order_by(Todo.timestamp.desc())
                .all()
            )
        else:
            rows = db.query(Todo).filter(Todo.owner_id == user.id).order_by(Todo.timestamp.desc()).all()
    elif scope == "mine":
        owner_id = user.id
        rows = db.query(Todo).filter(Todo.owner_id == owner_id).order_by(Todo.timestamp.desc()).all()
    else:
        if not user.partner_id:
            raise HTTPException(status_code=400, detail="No partner linked")
        owner_id = user.partner_id
        rows = db.query(Todo).filter(Todo.owner_id == owner_id).order_by(Todo.timestamp.desc()).all()
    return [todo_to_out(t) for t in rows]


@app.post("/api/todos", response_model=TodoOut)
def create_todo(
    body: TodoCreate,
    user: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
):
    tid = str(uuid.uuid4())
    row = Todo(
        id=tid,
        owner_id=user.id,
        text=body.text,
        x=body.x,
        y=body.y,
        completed=body.completed,
        due_date=body.dueDate,
        repeat=body.repeat,
        timestamp=body.timestamp,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return todo_to_out(row)


@app.patch("/api/todos/{todo_id}", response_model=TodoOut)
def patch_todo(
    todo_id: str,
    body: TodoPatch,
    user: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
):
    row = db.query(Todo).filter(Todo.id == todo_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Todo not found")
    if row.owner_id != user.id:
        raise HTTPException(status_code=403, detail="You can only edit your own todos")

    patch = body.model_dump(exclude_unset=True)
    if "text" in patch:
        row.text = patch["text"]
    if "x" in patch:
        row.x = patch["x"]
    if "y" in patch:
        row.y = patch["y"]
    if "completed" in patch:
        row.completed = patch["completed"]
    if "dueDate" in patch:
        row.due_date = patch["dueDate"]
    if "repeat" in patch:
        row.repeat = patch["repeat"]
    if "timestamp" in patch:
        row.timestamp = patch["timestamp"]

    db.commit()
    db.refresh(row)
    return todo_to_out(row)


@app.delete("/api/todos/{todo_id}")
def delete_todo(
    todo_id: str,
    user: Profile = Depends(get_current_profile),
    db: Session = Depends(get_db),
):
    row = db.query(Todo).filter(Todo.id == todo_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Todo not found")
    if row.owner_id != user.id:
        raise HTTPException(status_code=403, detail="You can only delete your own todos")
    db.delete(row)
    db.commit()
    return {"ok": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
