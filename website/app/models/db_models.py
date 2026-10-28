# -*- coding: utf-8 -*-
"""
Database Access Layer for Crypto Executive Vault.
Executes parameterized SQLite queries against crypto_vault.sqlite3 for authentication and audit logs.
"""

from __future__ import annotations
import sqlite3
import time
from typing import Dict, List, Optional, Any, Tuple
from pathlib import Path

from app.config import AUTH_DB_PATH

def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(AUTH_DB_PATH), timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn

def init_auth_db():
    with get_db_connection() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS web_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'owner',
            static_2fa_pin TEXT NOT NULL DEFAULT '313326',
            totp_secret TEXT,
            use_authenticator BOOLEAN NOT NULL DEFAULT 0,
            failed_attempts INTEGER NOT NULL DEFAULT 0,
            locked_until REAL NOT NULL DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS security_audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type TEXT NOT NULL,
            ip_address TEXT NOT NULL,
            user_agent TEXT,
            details TEXT,
            severity TEXT NOT NULL DEFAULT 'INFO',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS ip_blacklist (
            ip_address TEXT PRIMARY KEY,
            reason TEXT,
            user_agent TEXT,
            blocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """)

        # Seed default owner user if not exists (Argon2id hash for Sc@313326)
        # $argon2id$v=19$m=65536,t=3,p=4$2q1B5t9m8L0k$wQ9...
        from app.core.security import SecurityEngine
        cur = conn.cursor()
        cur.execute("SELECT id FROM web_users WHERE username = 'scadmin'")
        if not cur.fetchone():
            default_hash = SecurityEngine.hash_password("Sc@313326")
            conn.execute("""
            INSERT INTO web_users (username, password_hash, role, static_2fa_pin, use_authenticator)
            VALUES (?, ?, 'owner', '313326', 0)
            """, ("scadmin", default_hash))
            conn.commit()

class WebDatabase:
    @staticmethod
    def get_user_by_username(username: str) -> Optional[Dict[str, Any]]:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT * FROM web_users WHERE username = ?", (username,))
            row = cur.fetchone()
            return dict(row) if row else None

    @staticmethod
    def get_user_by_id(user_id: int) -> Optional[Dict[str, Any]]:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT * FROM web_users WHERE id = ?", (user_id,))
            row = cur.fetchone()
            return dict(row) if row else None

    @staticmethod
    def record_login_failure(username: str, max_attempts: int, lockout_seconds: int) -> Tuple[int, bool]:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT failed_attempts FROM web_users WHERE username = ?", (username,))
            row = cur.fetchone()
            if not row:
                return 0, False
            attempts = row["failed_attempts"] + 1
            is_locked = False
            lockout_until = 0.0
            if attempts >= max_attempts:
                is_locked = True
                lockout_until = time.time() + lockout_seconds
            conn.execute("""
            UPDATE web_users 
            SET failed_attempts = ?, locked_until = ? 
            WHERE username = ?
            """, (attempts, lockout_until, username))
            conn.commit()
            return attempts, is_locked

    @staticmethod
    def reset_login_attempts(username: str, ip_address: str):
        with get_db_connection() as conn:
            conn.execute("""
            UPDATE web_users 
            SET failed_attempts = 0, locked_until = 0, last_login = CURRENT_TIMESTAMP 
            WHERE username = ?
            """, (username,))
            conn.commit()

    @staticmethod
    def update_password(username: str, new_hash: str):
        with get_db_connection() as conn:
            conn.execute("UPDATE web_users SET password_hash = ? WHERE username = ?", (new_hash, username))
            conn.commit()

    @staticmethod
    def is_ip_blocked(ip: str) -> bool:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT ip_address FROM ip_blacklist WHERE ip_address = ?", (ip,))
            return cur.fetchone() is not None

    @staticmethod
    def block_ip(ip: str, reason: str, user_agent: str = ""):
        with get_db_connection() as conn:
            conn.execute("""
            INSERT OR REPLACE INTO ip_blacklist (ip_address, reason, user_agent)
            VALUES (?, ?, ?)
            """, (ip, reason, user_agent))
            conn.commit()

    @staticmethod
    def log_security_event(event_type: str, ip: str, user_agent: str, details: str, severity: str = "INFO"):
        with get_db_connection() as conn:
            conn.execute("""
            INSERT INTO security_audit_logs (event_type, ip_address, user_agent, details, severity)
            VALUES (?, ?, ?, ?, ?)
            """, (event_type, ip, user_agent, details, severity))
            conn.commit()
