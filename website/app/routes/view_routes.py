# -*- coding: utf-8 -*-
"""
View Router for PAYOMBØYZ Crypto Executive Vault.
Serves HTML templates with Jinja2 and enforces authentication.
"""

from __future__ import annotations
from fastapi import APIRouter, Request, Depends, HTTPException, status
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from app.config import TEMPLATES_DIR, SESSION_COOKIE_NAME
from app.core.security import SecurityEngine
from app.core.middleware import get_client_ip, get_current_user

router = APIRouter(include_in_schema=False)
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

@router.get("/", response_class=HTMLResponse)
async def root_redirect(request: Request):
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if token:
        payload = SecurityEngine.verify_session_token(token, get_client_ip(request), request.headers.get("User-Agent", ""))
        if payload and payload.get("rol") == "owner":
            return RedirectResponse(url="/dash", status_code=302)
    return RedirectResponse(url="/login", status_code=302)

@router.get("/login", response_class=HTMLResponse)
async def render_login_page(request: Request):
    return templates.TemplateResponse(request=request, name="login.html", context={
        "title": "เข้าสู่ระบบ PAYOMBØYZ Crypto Executive Vault"
    })

@router.get("/dash", response_class=HTMLResponse)
@router.get("/crypto", response_class=HTMLResponse)
async def render_crypto_dashboard(request: Request):
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        return RedirectResponse(url="/login?expired=1", status_code=302)
    payload = SecurityEngine.verify_session_token(token, get_client_ip(request), request.headers.get("User-Agent", ""))
    if not payload or payload.get("rol") != "owner":
        return RedirectResponse(url="/login?unauthorized=1", status_code=302)
    return templates.TemplateResponse(request=request, name="crypto_dashboard.html", context={
        "title": "PAYOMBØYZ Crypto Executive Vault — ศูนย์บัญชาการคริปโต",
        "username": payload["usr"],
        "role": payload["rol"]
    })
