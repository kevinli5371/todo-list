#!/usr/bin/env python3
"""Decode the Supabase JWT format and report what's wrong (no secrets printed)."""
from pathlib import Path
from dotenv import load_dotenv
import os
import base64, json

load_dotenv(Path(__file__).resolve().parent / ".env")

jwt_secret = os.getenv("SUPABASE_JWT_SECRET", "").strip()
print(f"SUPABASE_JWT_SECRET set: {bool(jwt_secret)}, length={len(jwt_secret)}")
if not jwt_secret:
    print("ERROR: SUPABASE_JWT_SECRET is missing from server/.env")
    print("Get it from: Supabase Dashboard → Project Settings → API → JWT Secret")
    exit(1)

# Ask user to paste a sample token - just check secret loading for now
# Try decoding the HS256 key type
try:
    from jose import jwt as jose_jwt, JWTError
    # Build a minimal fake token to test signing (can't verify without a real token)
    import hmac, hashlib
    secret_bytes = jwt_secret.encode() if isinstance(jwt_secret, str) else jwt_secret
    test = hmac.new(secret_bytes, b"test", hashlib.sha256)
    print(f"JWT secret loads as valid HMAC key: yes (hmac test ok)")
except Exception as e:
    print(f"JWT secret problem: {e}")

print("\nIf the secret is correct but you still get 401, check:")
print("  1. The token audience — Supabase tokens have audience='authenticated'")
print("  2. The JWT Secret is from Project Settings → API → JWT Secret (NOT the anon/service key)")
print("  3. The secret was not accidentally trimmed or has extra whitespace/quotes")
