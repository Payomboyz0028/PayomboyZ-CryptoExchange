# -*- coding: utf-8 -*-
"""
Pydantic v2 Request & Response Data Contracts for PAYOMBØYZ Crypto Executive Vault.
"""

from __future__ import annotations
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field

# ── Auth Models ──
class LoginRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6, max_length=100)
    cf_turnstile_token: Optional[str] = None

class Verify2FARequest(BaseModel):
    temp_token: str
    totp_code: str = Field(..., min_length=6, max_length=6)

class AuthResponse(BaseModel):
    success: bool
    requires_2fa: bool = False
    temp_token: Optional[str] = None
    role: Optional[str] = None
    username: Optional[str] = None
    message: str = ""

# ── Crypto Intelligence Models ──
class CryptoMetricFilter(BaseModel):
    range: str = Field("all", pattern="^(1d|7d|30d|all)$")

class HotWalletBalanceInfo(BaseModel):
    network: str
    name: str
    address: str
    explorer_url: str
    usdt_balance: float
    gas_symbol: str
    gas_balance: float
    is_gas_low: bool
    status: str

class CryptoRateItem(BaseModel):
    asset: str
    network: str
    market_price: float
    margin_thb: float
    effective_rate: float
    network_fee_thb: float
    min_exchange_thb: float
