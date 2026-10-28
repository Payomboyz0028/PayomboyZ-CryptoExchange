# -*- coding: utf-8 -*-
"""
6-Layer Security Middleware & Authentication Guards for SC-HUB Web Core.
Protects endpoints against scrapers, honeytoken triggers, replay attacks, and unauthorized roles.
"""

from __future__ import annotations
import time
from typing import Dict, List, Optional
from collections import defaultdict
from fastapi import Request, HTTPException, Depends, status
from fastapi.responses import JSONResponse, Response
from starlette.middleware.base import BaseHTTPMiddleware

from app.config import (
    HONEYTOKEN_ENDPOINTS, BLOCKED_USER_AGENTS, SESSION_COOKIE_NAME
)
from app.core.security import SecurityEngine
from app.models.db_models import WebDatabase

# In-Memory Token Bucket Rate Limiter
_RATE_LIMITS: Dict[str, List[float]] = defaultdict(list)
RATE_LIMIT_WINDOW = 60.0  # 1 minute window
RATE_LIMIT_MAX_REQ = 100  # Max 100 requests per minute

def get_client_ip(request: Request) -> str:
    # 1. Cloudflare connecting IP
    cf_ip = request.headers.get("CF-Connecting-IP")
    if cf_ip:
        return cf_ip.strip()
    # 2. Forwarded For
    x_forwarded = request.headers.get("X-Forwarded-For")
    if x_forwarded:
        return x_forwarded.split(",")[0].strip()
    # 3. Direct client host
    return request.client.host if request.client else "127.0.0.1"

class SecurityFortressMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        client_ip = get_client_ip(request)
        user_agent = request.headers.get("User-Agent", "").lower()
        path = request.url.path

        # ── 1. Check IP Blacklist ──
        if WebDatabase.is_ip_blocked(client_ip):
            WebDatabase.log_security_event("blocked_ip_access_attempt", client_ip, user_agent, path, severity="BLOCKED")
            return JSONResponse(status_code=403, content={"detail": "Forbidden: IP permanently blacklisted."})

        # ── 2. Layer 3: Honeytoken Canary Trap ──
        if path in HONEYTOKEN_ENDPOINTS:
            WebDatabase.block_ip(client_ip, f"Honeytoken trap triggered: {path}", user_agent)
            return JSONResponse(status_code=403, content={"detail": "Forbidden: Access violation recorded."})

        # ── 3. Layer 4: Anti-Bot & AI Crawler Filter ──
        # Don't block static files from normal browsers, but block known automated scrapers
        if not path.startswith("/static"):
            for bad_ua in BLOCKED_USER_AGENTS:
                if bad_ua in user_agent:
                    WebDatabase.log_security_event("bot_blocked", client_ip, user_agent, f"Matched keyword: {bad_ua}", severity="WARNING")
                    return JSONResponse(status_code=403, content={"detail": "Automated access blocked by security gatekeeper."})

        # ── 4. Layer 4: IP Rate Limiting ──
        now = time.time()
        requests_history = [t for t in _RATE_LIMITS[client_ip] if now - t < RATE_LIMIT_WINDOW]
        requests_history.append(now)
        _RATE_LIMITS[client_ip] = requests_history

        if len(requests_history) > RATE_LIMIT_MAX_REQ:
            WebDatabase.log_security_event("rate_limit_exceeded", client_ip, user_agent, f"Requests: {len(requests_history)}", severity="WARNING")
            return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded. Please back off."})

        # ── 5. Layer 3: Sliding HMAC Request Verification for API mutations ──
        if path.startswith("/api/") and request.method in ["POST", "PUT", "DELETE"]:
            # Bypass signature check for initial login and discord webhook bridge
            bypass_paths = ["/api/auth/login", "/api/auth/verify-2fa", "/api/v1/dispatch-logs"]
            if not any(path.startswith(bp) for bp in bypass_paths):
                req_timestamp = request.headers.get("X-Request-Timestamp")
                req_signature = request.headers.get("X-Signature")
                
                if not req_timestamp or not req_signature:
                    WebDatabase.log_security_event("missing_hmac_signature", client_ip, user_agent, path, severity="WARNING")
                    return JSONResponse(status_code=403, content={"detail": "Missing cryptographic request signature."})
                
                body_bytes = await request.body()
                is_valid, err_msg = SecurityEngine.verify_sliding_hmac(body_bytes, req_timestamp, req_signature)
                if not is_valid:
                    WebDatabase.log_security_event("invalid_hmac_signature", client_ip, user_agent, f"{path} -> {err_msg}", severity="WARNING")
                    return JSONResponse(status_code=403, content={"detail": f"Cryptographic integrity failed: {err_msg}"})
                
                async def receive():
                    return {"type": "http.request", "body": body_bytes}
                request = Request(request.scope, receive=receive)

        # ── Execute Request ──
        response = await call_next(request)

        # ── 6. Layer 1 & 2 Security Response Headers ──
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        if path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"

        return response


# ── Layer 6: Session & RBAC Dependency Guards ──
async def get_current_user(request: Request) -> Dict[str, Any]:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    client_ip = get_client_ip(request)
    user_agent = request.headers.get("User-Agent", "")

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or not authenticated."
        )

    payload = SecurityEngine.verify_session_token(token, client_ip, user_agent)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session token invalid, expired, or bound to a different client fingerprint."
        )

    # Double check user exists and not locked
    user = WebDatabase.get_user_by_id(payload["uid"])
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User account not found.")

    if user["role"] not in ["owner", "lead_admin"]:
        # Strict RBAC: General admins are strictly forbidden
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied: Administrative clearance insufficient.")

    return user

async def require_owner(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if current_user.get("role") != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Owner privileges required."
        )
    return current_user

async def require_lead_or_owner(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if current_user.get("role") not in ["owner", "lead_admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: Lead Admin or Owner privileges required."
        )
    return current_user
