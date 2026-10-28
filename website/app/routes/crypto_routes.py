# -*- coding: utf-8 -*-
"""
Crypto Executive Intelligence Router for SC-HUB Web Core.
Strictly Read-Only Endpoints protected by require_owner authentication.
No transaction-executing or private-key-exposing endpoints exist here.
"""

from __future__ import annotations
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response

from app.core.middleware import require_owner
from app.services.crypto_service import CryptoService

router = APIRouter(prefix="/api/owner/crypto", tags=["Owner Crypto Intelligence"])

@router.get("/metrics")
async def get_crypto_metrics(
    range: str = Query("all", pattern="^(1d|7d|30d|all)$"),
    current_user: dict = Depends(require_owner)
):
    """Fetches high-level financial KPIs (Volume, Profit Margin, Outflow, Success Rate)."""
    try:
        data = CryptoService.get_executive_metrics(range_preset=range)
        return {"success": True, "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch crypto metrics: {str(e)}")

@router.get("/wallets")
async def get_crypto_wallets(
    refresh: bool = False,
    current_user: dict = Depends(require_owner)
):
    """Fetches multi-chain Hot Wallet balances, gas reserves, and public addresses for copying."""
    try:
        data = CryptoService.get_hot_wallets_status(force_refresh=refresh)
        return {"success": True, "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch wallet balances: {str(e)}")

@router.get("/rates")
async def get_crypto_rates(
    refresh: bool = False,
    current_user: dict = Depends(require_owner)
):
    """Fetches live market rates, margin spreads, and customer effective exchange rates."""
    try:
        data = CryptoService.get_live_rates(force_refresh=refresh)
        return {"success": True, "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch crypto rates: {str(e)}")

@router.get("/orders")
async def get_crypto_orders(
    limit: int = Query(25, ge=1, le=100),
    offset: int = Query(0, ge=0),
    status: Optional[str] = None,
    asset: Optional[str] = None,
    search: Optional[str] = None,
    current_user: dict = Depends(require_owner)
):
    """Fetches paginated transaction ledger with search and filtering capabilities."""
    try:
        data = CryptoService.get_orders(
            limit=limit,
            offset=offset,
            status=status,
            asset=asset,
            search=search
        )
        return {"success": True, "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch order ledger: {str(e)}")
