import os

from jose import JWTError, jwt

"""Verify Supabase-issued access tokens (Settings → API → JWT Secret)."""

SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")
ALGORITHM = "HS256"


def decode_supabase_jwt(token: str) -> dict | None:
    if not SUPABASE_JWT_SECRET:
        return None
    try:
        return jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=[ALGORITHM],
            audience="authenticated",
        )
    except JWTError:
        return None
