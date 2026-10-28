# -*- coding: utf-8 -*-
"""
PAYOMBØYZ Crypto Executive Vault Service.
Standalone FastAPI back-office server for CryptoPayment running on port 8090.
"""

from __future__ import annotations
import sys
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

# Add application root to Python path
APP_DIR = Path(__file__).resolve().parent
WEBSITE_DIR = APP_DIR.parent
if str(WEBSITE_DIR) not in sys.path:
    sys.path.insert(0, str(WEBSITE_DIR))

from app.config import STATIC_DIR, WEB_HOST, WEB_PORT
from app.models.db_models import init_auth_db
from app.core.middleware import SecurityFortressMiddleware
from app.routes.auth_routes import router as auth_router
from app.routes.crypto_routes import router as crypto_router
from app.routes.view_routes import router as view_router

app = FastAPI(
    title="PAYOMBØYZ Crypto Executive Vault",
    description="Dedicated Crypto Back-Office & Financial Intelligence Hub",
    version="2.0.0",
    docs_url=None,
    redoc_url=None
)

# ── 6-Layer Security Middleware ──
app.add_middleware(SecurityFortressMiddleware)

# ── Mount Static Files ──
STATIC_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# ── Include Routers ──
app.include_router(auth_router)
app.include_router(crypto_router)
app.include_router(view_router)

# Fix Windows cp874 terminal encoding
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

@app.on_event("startup")
async def startup_event():
    init_auth_db()
    print("=" * 66)
    print("  💎 PAYOMBØYZ CRYPTO EXECUTIVE VAULT IS ONLINE")
    print("=" * 66)
    print(f"[*] Access URL: http://{WEB_HOST}:{WEB_PORT}/dash")
    print("[*] Security: Zero-Risk Read-Only Vault Architecture")
    print("[*] Port: 8090 (Dedicated Crypto Standalone Server)")
    print("=" * 66)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=WEB_HOST, port=WEB_PORT, reload=True)
