# -*- coding: utf-8 -*-
"""
Configuration module for PAYOMBØYZ Crypto Executive Vault.
Independent Web Service running on port 8090.
"""

from __future__ import annotations
import os
from pathlib import Path

# Paths
APP_DIR = Path(__file__).resolve().parent
WEBSITE_DIR = APP_DIR.parent
CRYPTO_DIR = WEBSITE_DIR.parent

# Database Paths
CRYPTO_DB_PATH = CRYPTO_DIR / "prisma" / "data" / "exchange.sqlite3"
AUTH_DB_PATH = WEBSITE_DIR / "crypto_vault.sqlite3"
STATIC_DIR = WEBSITE_DIR / "static"
TEMPLATES_DIR = WEBSITE_DIR / "templates"

# Web Server Bindings (Dedicated Crypto Port 8090)
WEB_HOST = os.getenv("CRYPTO_WEB_HOST", "127.0.0.1")
WEB_PORT = int(os.getenv("CRYPTO_WEB_PORT", "8090"))

# Security & Session Settings
SECRET_KEY = os.getenv("CRYPTO_VAULT_JWT_SECRET", "payomboyz_crypto_vault_secure_token_5819382103847192")
JWT_SECRET_KEY = SECRET_KEY
HMAC_SECRET_KEY = os.getenv("CRYPTO_VAULT_HMAC_SECRET", "PAYOMB0YZ_CRYPTO_VAULT_KEY")
HMAC_TOLERANCE_SECONDS = 300
SESSION_COOKIE_NAME = "pbz_crypto_vault_sess"
SESSION_LIFETIME_HOURS = 12
SESSION_EXPIRY_SECONDS = 43200
MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_DURATION_SECONDS = 900
HONEYTOKEN_ENDPOINTS = ["/api/v1/dump_all_slips", "/api/v1/export_private_keys", "/admin/db_dump"]
BLOCKED_USER_AGENTS = ["sqlmap", "nikto", "curl", "python-requests"]

# Hot Wallet Configuration (Strict Read-Only)
HOT_WALLET_EVM_PRIMARY = "0xf1F95d0bdD5140e04758294C9614262c8c000183"
HOT_WALLET_EVM_RESERVE = "0xEEa103Fc2f0c03a63C95499609Bf8713B8f81BA2"
HOT_WALLET_TRON = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb"

# RPC Endpoints
BSC_RPC_URL = "https://bsc-dataseed1.binance.org"
POLYGON_RPC_URL = "https://polygon-bor-rpc.publicnode.com"
