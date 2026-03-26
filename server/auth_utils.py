import os
from functools import lru_cache

import httpx
from jose import JWTError, jwt

"""Verify Supabase access tokens using their public JWKS (ES256 asymmetric signing)."""

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip().rstrip("/")


@lru_cache(maxsize=1)
def _get_jwks() -> list[dict]:
    """Fetch and cache Supabase's public signing keys."""
    url = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"
    resp = httpx.get(url, timeout=10)
    resp.raise_for_status()
    return resp.json().get("keys", [])


def decode_supabase_jwt(token: str) -> dict | None:
    if not SUPABASE_URL:
        return None
    try:
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")
        alg = header.get("alg", "ES256")

        keys = _get_jwks()
        key = next(
            (k for k in keys if not kid or k.get("kid") == kid),
            keys[0] if keys else None,
        )
        if not key:
            return None

        return jwt.decode(
            token,
            key,
            algorithms=[alg, "ES256", "RS256", "HS256"],
            audience="authenticated",
        )
    except JWTError:
        return None
    except Exception:
        _get_jwks.cache_clear()
        return None
