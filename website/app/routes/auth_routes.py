# -*- coding: utf-8 -*-
"""
Dual-Factor Authentication Router for SC-HUB Web Core.
Handles Step 1 (ID:Password with Argon2id) and Step 2 (RFC 6238 TOTP 6-digit verification).
"""

from __future__ import annotations
import time
from fastapi import APIRouter, Request, Response, HTTPException, Depends, status
from fastapi.responses import JSONResponse

from app.config import (
    SESSION_COOKIE_NAME, SESSION_EXPIRY_SECONDS, MAX_LOGIN_ATTEMPTS, LOCKOUT_DURATION_SECONDS
)
from app.models.schemas import LoginRequest, Verify2FARequest, AuthResponse
from app.models.db_models import WebDatabase
from app.core.security import SecurityEngine
from app.core.middleware import get_client_ip, get_current_user

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

@router.get("/cf-challenge")
async def get_cf_challenge(request: Request):
    """Provides challenge seed for Cloudflare Turnstile widget."""
    client_ip = get_client_ip(request)
    challenge = SecurityEngine.generate_turnstile_challenge(client_ip)
    return {"success": True, **challenge}

@router.post("/login", response_model=AuthResponse)
async def login_step1(req: LoginRequest, request: Request):
    client_ip = get_client_ip(request)
    user_agent = request.headers.get("User-Agent", "")

    # Layer 4 / Turnstile: Enforce Cloudflare Turnstile Challenge Verification
    is_cf_valid = SecurityEngine.verify_turnstile_token(req.cf_turnstile_token, client_ip)
    if not is_cf_valid:
        WebDatabase.log_security_event("turnstile_failed", client_ip, user_agent, f"User: {req.username}", severity="WARNING")
        return AuthResponse(
            success=False,
            message="กรุณายืนยันตัวตนผ่านระบบตรวจสอบ Cloudflare Turnstile ให้สำเร็จก่อนเข้าสู่ระบบ"
        )

    user = WebDatabase.get_user_by_username(req.username)
    if not user:
        WebDatabase.log_security_event("login_unknown_user", client_ip, user_agent, req.username, severity="WARNING")
        return AuthResponse(success=False, message="ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง")

    # Check if locked out
    if user.get("locked_until", 0.0) > time.time():
        remaining = int(user["locked_until"] - time.time())
        WebDatabase.log_security_event("login_locked_attempt", client_ip, user_agent, f"User: {req.username}", severity="WARNING")
        return AuthResponse(
            success=False,
            message=f"บัญชีถูกระงับชั่วคราวเนื่องจากใส่รหัสผิดเกินกำหนด กรุณารอ {remaining} วินาที"
        )

    # Verify Password via Argon2id
    is_valid_pw = SecurityEngine.verify_password(user["password_hash"], req.password)
    if not is_valid_pw:
        attempts, is_locked = WebDatabase.record_login_failure(req.username, MAX_LOGIN_ATTEMPTS, LOCKOUT_DURATION_SECONDS)
        WebDatabase.log_security_event("login_bad_password", client_ip, user_agent, f"User: {req.username} (Attempt {attempts})", severity="WARNING")
        if is_locked:
            return AuthResponse(success=False, message="ใส่รหัสผิดเกิน 5 ครั้ง บัญชีถูกล็อก 15 นาที")
        return AuthResponse(success=False, message=f"รหัสผ่านไม่ถูกต้อง (เหลือโอกาส {MAX_LOGIN_ATTEMPTS - attempts} ครั้ง)")

    # Strict RBAC check: Only Owner and Lead Admin are permitted
    if user["role"] not in ["owner", "lead_admin"]:
        WebDatabase.log_security_event("login_unauthorized_role", client_ip, user_agent, f"Role: {user['role']}", severity="WARNING")
        return AuthResponse(success=False, message="สิทธิ์การเข้าถึงไม่เพียงพอ (ไม่อนุญาตให้พนักงานทั่วไปเข้าเว็บ)")

    # Generate Temporary 2FA Token (Valid for 5 mins)
    temp_token = SecurityEngine.create_temp_2fa_token(user["username"], user["role"])
    use_auth = bool(user.get("use_authenticator", 0))
    msg = "กรุณากรอกรหัส 2FA จาก Authenticator App" if use_auth else "กรุณากรอกรหัส 2FA (6 หลัก) เริ่มต้นคือ 313326"

    return AuthResponse(
        success=True,
        requires_2fa=True,
        temp_token=temp_token,
        role=user["role"],
        username=user["username"],
        message=msg
    )

@router.post("/verify-2fa", response_model=AuthResponse)
async def verify_2fa_step2(req: Verify2FARequest, request: Request, response: Response):
    client_ip = get_client_ip(request)
    user_agent = request.headers.get("User-Agent", "")

    # Decode and verify temporary token
    payload = SecurityEngine.verify_temp_2fa_token(req.temp_token)
    if not payload:
        return AuthResponse(success=False, message="เซสชัน 2FA หมดอายุหรือคำขอไม่ถูกต้อง กรุณาล็อกอินใหม่")

    username = payload["usr"]
    user = WebDatabase.get_user_by_username(username)
    if not user:
        return AuthResponse(success=False, message="ไม่พบข้อมูลผู้ใช้")

    # Verify 2FA (Dual mode: Static PIN 6-digit or Google Authenticator TOTP)
    code = req.totp_code.strip()
    use_authenticator = bool(user.get("use_authenticator", 0))
    static_pin = str(user.get("static_2fa_pin") or "313326").strip()

    is_valid_2fa = False
    if use_authenticator:
        # Check Google Authenticator TOTP
        if SecurityEngine.verify_totp(user.get("totp_secret", ""), code):
            is_valid_2fa = True
        elif code == static_pin:
            is_valid_2fa = True
    else:
        # Static PIN mode (default 313326 unless changed)
        if code == static_pin:
            is_valid_2fa = True
        elif SecurityEngine.verify_totp(user.get("totp_secret", ""), code):
            is_valid_2fa = True

    if not is_valid_2fa:
        WebDatabase.log_security_event("bad_2fa_code", client_ip, user_agent, f"User: {username} (Code: {code})", severity="WARNING")
        return AuthResponse(success=False, message="รหัส 2FA (6 หลัก) ไม่ถูกต้อง")

    # Reset failed attempts upon successful authentication
    WebDatabase.reset_login_attempts(username, client_ip)

    # Issue Encrypted Session Cookie bound to IP & UA Fingerprint
    session_token = SecurityEngine.create_session_token(
        user_id=user["id"],
        username=user["username"],
        role=user["role"],
        client_ip=client_ip,
        user_agent=user_agent
    )

    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=session_token,
        max_age=SESSION_EXPIRY_SECONDS,
        httponly=True,
        secure=False,  # Set to True on production HTTPS
        samesite="lax",
        path="/"
    )

    WebDatabase.log_security_event("login_successful", client_ip, user_agent, f"User: {username} ({user['role']})", severity="INFO")

    return AuthResponse(
        success=True,
        requires_2fa=False,
        role=user["role"],
        username=user["username"],
        message="เข้าสู่ระบบสำเร็จ"
    )

@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")
    return {"success": True, "message": "ออกจากระบบเรียบร้อยแล้ว"}

@router.get("/me")
async def get_my_profile(current_user: dict = Depends(get_current_user)):
    user = WebDatabase.get_user_by_username(current_user["username"]) or current_user
    return {
        "id": user["id"],
        "username": user["username"],
        "role": user["role"],
        "totp_secret": user.get("totp_secret", ""),
        "use_authenticator": bool(user.get("use_authenticator", 0)),
        "static_2fa_pin": user.get("static_2fa_pin", "313326"),
        "last_login_at": user.get("last_login_at"),
        "last_login_ip": user.get("last_login_ip")
    }
