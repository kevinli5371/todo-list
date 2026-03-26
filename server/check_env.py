#!/usr/bin/env python3
"""Print whether .env loads and DB config resolves (no secrets printed)."""
from pathlib import Path
import os
import socket
from dotenv import load_dotenv

HERE = Path(__file__).resolve().parent
# Match typical usage: uvicorn run from server/ directory
load_dotenv(HERE / ".env")

print("=== .env file ===")
env_path = HERE / ".env"
print(f"  Path: {env_path}")
print(f"  Exists: {env_path.exists()}")

raw_db = os.getenv("DATABASE_URL", "").strip()
raw_host = (os.getenv("SUPABASE_DB_HOST") or os.getenv("DB_HOST") or "").strip()
jwt = os.getenv("SUPABASE_JWT_SECRET", "").strip()

print("\n=== Raw env (presence only) ===")
print(f"  DATABASE_URL set: {bool(raw_db)} (length {len(raw_db)})")
print(f"  SUPABASE_DB_HOST / DB_HOST set: {bool(raw_host)}")
if raw_host:
    print(f"    host value: {raw_host!r}")
print(f"  SUPABASE_JWT_SECRET set: {bool(jwt)} (length {len(jwt)})")

# What db.py actually uses
import db as dbmod

print("\n=== Resolved DATABASE_URL (db module) ===")
u = dbmod.DATABASE_URL
print(f"  Starts with sqlite: {u.startswith('sqlite')}")
if not u.startswith("sqlite"):
    # Mask password in display
    for prefix in ("postgresql+psycopg://", "postgresql://"):
        if u.startswith(prefix):
            rest = u[len(prefix) :]
            if "@" in rest:
                userinfo, hostpart = rest.split("@", 1)
                if ":" in userinfo:
                    user, _pw = userinfo.split(":", 1)
                    print(f"  Driver/scheme: {prefix.rstrip('://')}")
                    print(f"  User: {user}")
                    print(f"  Password: {'*' * 8} (present)")
                else:
                    print(f"  Userinfo: {userinfo}")
                # host:port/db
                if "/" in hostpart:
                    host_port, dbname = hostpart.split("/", 1)
                    dbname = dbname.split("?")[0]
                else:
                    host_port, dbname = hostpart, ""
                if ":" in host_port:
                    host, port = host_port.rsplit(":", 1)
                else:
                    host, port = host_port, "(default)"
                print(f"  Host: {host}")
                print(f"  Port: {port}")
                print(f"  Database: {dbname}")
                try:
                    socket.getaddrinfo(
                        host,
                        int(port) if str(port).isdigit() else 5432,
                        type=socket.SOCK_STREAM,
                    )
                    print("  DNS: OK (host resolves)")
                except socket.gaierror as e:
                    print(f"  DNS: FAIL — {e}")
                    if host.startswith("db.") and host.endswith(".supabase.co"):
                        print(
                            "  Hint: Supabase direct DB host is IPv6-only. "
                            "Use Dashboard → Connect → Session pooler URI (IPv4), "
                            "or enable IPv4 add-on. See server/.env.example."
                        )
            break
    else:
        print(f"  (Could not parse for display; len={len(u)})")

print("\nDone.")
