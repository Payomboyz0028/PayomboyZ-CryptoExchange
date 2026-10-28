# -*- coding: utf-8 -*-
"""
Crypto Executive Intelligence & Read-Only Service for SC-HUB Web Core.
Connects strictly in Read-Only Mode (mode=ro) to the SQLite exchange database.
Queries blockchain balances via public JSON-RPC without exposing any private keys.
"""

from __future__ import annotations
import os
import json
import time
import sqlite3
import datetime
import urllib.request
from typing import Dict, List, Any, Optional

from app.config import CRYPTO_DB_PATH, CRYPTO_DIR

# EVM Contract Addresses
USDT_BSC_CONTRACT = "0x55d398326f99059fF775485246999027B3197955"
USDT_POLYGON_CONTRACT = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F"

# Public RPC Endpoints
BSC_RPC = "https://bsc-dataseed1.binance.org"
POLYGON_RPC = "https://polygon-bor-rpc.publicnode.com"

# Default Public Addresses (Read-Only reference)
DEFAULT_EVM_PRIMARY = "0xf1F95d0bdD5140e04758294C9614262c8c000183"
DEFAULT_EVM_RESERVE = "0xEEa103Fc2f0c03a63C95499609Bf8713B8f81BA2"

class CryptoService:
    _wallet_cache: Dict[str, Any] = {}
    _wallet_cache_time: float = 0
    _rates_cache: Dict[str, Any] = {}
    _rates_cache_time: float = 0

    @staticmethod
    def get_crypto_db() -> sqlite3.Connection:
        """Opens a strict Read-Only connection to the exchange database."""
        if not CRYPTO_DB_PATH.exists():
            raise FileNotFoundError(f"Crypto database not found at {CRYPTO_DB_PATH}")
        db_uri = f"file:{CRYPTO_DB_PATH.as_posix()}?mode=ro"
        con = sqlite3.connect(db_uri, uri=True, timeout=5.0)
        con.row_factory = sqlite3.Row
        return con

    @staticmethod
    def get_public_addresses() -> Dict[str, str]:
        """Extracts configured public addresses from CryptoPayment/.env without reading private keys."""
        addresses = {
            "evm_primary": DEFAULT_EVM_PRIMARY,
            "evm_reserve": DEFAULT_EVM_RESERVE,
            "tron": "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb",
            "ltc": "N/A (Derived per WIF)"
        }
        env_file = CRYPTO_DIR / ".env"
        if env_file.exists():
            try:
                with open(env_file, "r", encoding="utf-8", errors="ignore") as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("HOT_WALLET_EVM_PRIMARY_ADDRESS="):
                            val = line.split("=", 1)[1].strip().strip('"\'')
                            if val:
                                addresses["evm_primary"] = val
                        elif line.startswith("HOT_WALLET_EVM_RESERVE_ADDRESS="):
                            val = line.split("=", 1)[1].strip().strip('"\'')
                            if val:
                                addresses["evm_reserve"] = val
            except Exception:
                pass
        return addresses

    @staticmethod
    def _query_evm_balance(rpc_url: str, address: str, contract_address: Optional[str] = None, token_decimals: int = 18) -> Dict[str, float]:
        """Performs read-only JSON-RPC queries for native gas & ERC20 token balances."""
        clean_addr = address.strip()
        result = {"native": 0.0, "token": 0.0}

        headers = {"Content-Type": "application/json", "User-Agent": "Mozilla/5.0 SC-HUB"}

        # 1. Native Balance
        try:
            payload = {
                "jsonrpc": "2.0",
                "method": "eth_getBalance",
                "params": [clean_addr, "latest"],
                "id": 1
            }
            req = urllib.request.Request(rpc_url, data=json.dumps(payload).encode(), headers=headers)
            with urllib.request.urlopen(req, timeout=3.5) as resp:
                res = json.loads(resp.read().decode())
                if "result" in res:
                    result["native"] = int(res["result"], 16) / 1e18
        except Exception:
            pass

        # 2. ERC-20 Token Balance
        if contract_address:
            try:
                addr_padded = clean_addr.lower().replace("0x", "").zfill(64)
                data = "0x70a08231" + addr_padded
                payload = {
                    "jsonrpc": "2.0",
                    "method": "eth_call",
                    "params": [{"to": contract_address, "data": data}, "latest"],
                    "id": 2
                }
                req = urllib.request.Request(rpc_url, data=json.dumps(payload).encode(), headers=headers)
                with urllib.request.urlopen(req, timeout=3.5) as resp:
                    res = json.loads(resp.read().decode())
                    if "result" in res and res["result"] != "0x":
                        raw_int = int(res["result"], 16)
                        result["token"] = raw_int / (10 ** token_decimals)
            except Exception:
                pass

        return result

    @staticmethod
    def _query_binance_balance() -> Dict[str, float]:
        """Queries live master balances from Binance SAPI using configured API key & secret."""
        env_file = CRYPTO_DIR / ".env"
        api_key = os.getenv("BINANCE_API_KEY", "")
        api_secret = os.getenv("BINANCE_API_SECRET", "")
        if env_file.exists():
            try:
                with open(env_file, "r", encoding="utf-8", errors="ignore") as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith("BINANCE_API_KEY="):
                            api_key = line.split("=", 1)[1].strip().strip('"\'')
                        elif line.startswith("BINANCE_API_SECRET="):
                            api_secret = line.split("=", 1)[1].strip().strip('"\'')
            except Exception:
                pass

        if not api_key or not api_secret:
            return {}

        try:
            import hmac
            import hashlib
            ts = int(time.time() * 1000)
            query = f"timestamp={ts}"
            sig = hmac.new(api_secret.encode(), query.encode(), hashlib.sha256).hexdigest()
            req = urllib.request.Request(
                f"https://api.binance.com/api/v3/account?{query}&signature={sig}",
                headers={"X-MBX-APIKEY": api_key, "User-Agent": "Mozilla/5.0 SC-HUB"}
            )
            with urllib.request.urlopen(req, timeout=4.0) as resp:
                data = json.loads(resp.read().decode())
                bals = {}
                for b in data.get("balances", []):
                    free_amt = float(b.get("free", 0.0))
                    asset = b.get("asset", "")
                    if free_amt > 0 or asset in ["USDT", "BNB", "LTC", "TRX"]:
                        bals[asset] = free_amt
                return bals
        except Exception:
            return {}

    @classmethod
    def get_hot_wallets_status(cls, force_refresh: bool = False) -> Dict[str, Any]:
        """Fetches multi-chain wallet status with a 15-second cache to prevent RPC rate-limits."""
        now = time.time()
        if not force_refresh and cls._wallet_cache and (now - cls._wallet_cache_time < 15.0):
            return cls._wallet_cache

        addresses = cls.get_public_addresses()
        evm_primary = addresses.get("evm_primary", DEFAULT_EVM_PRIMARY)
        evm_reserve = addresses.get("evm_reserve", DEFAULT_EVM_RESERVE)

        # 1. Binance Master Hub Live Balances
        binance_bals = cls._query_binance_balance()
        binance_usdt = round(binance_bals.get("USDT", 0.0), 2)
        binance_bnb = round(binance_bals.get("BNB", 0.0), 4)
        binance_ltc = round(binance_bals.get("LTC", 0.0), 4)
        binance_trx = round(binance_bals.get("TRX", 0.0), 2)

        # 2. BSC Balances for Reserve Vault (คลังสำรองสำหรับเติมเงิน)
        vault_bsc = cls._query_evm_balance(BSC_RPC, evm_reserve, USDT_BSC_CONTRACT, 18)

        # 3. BSC & Polygon Balances for Primary Relay (กระเป๋าหน้าด่านสำหรับยิงเหรียญ)
        primary_bsc = cls._query_evm_balance(BSC_RPC, evm_primary, USDT_BSC_CONTRACT, 18)
        primary_poly = cls._query_evm_balance(POLYGON_RPC, evm_primary, USDT_POLYGON_CONTRACT, 6)

        # Health status check
        primary_gas_low = primary_bsc["native"] < 0.005
        vault_gas_low = vault_bsc["native"] < 0.001
        poly_gas_low = primary_poly["native"] < 0.5

        wallets_list = []

        # Card 1: Binance Master Multi-Chain Clearing Pool (ศูนย์กลางสภาพคล่องและจ่ายเงินออก)
        wallets_list.append({
            "network": "BINANCE_MASTER",
            "chain": "MULTI_CHAIN",
            "role": "BINANCE_MASTER_HUB",
            "role_title": "👑 คลังสภาพคล่องกลางหลัก (Binance SAPI Master Hub)",
            "name": "Binance Multi-Chain Clearing Pool",
            "address": "Master Account SAPI (BSC / TRON / MATIC / LTC)",
            "address_label": "สถานะการเชื่อมต่อ Binance Clearing House:",
            "explorer_url": "https://binance.com",
            "usdt_balance": binance_usdt,
            "gas_symbol": "BNB",
            "gas_balance": binance_bnb,
            "is_gas_low": False,
            "status": "BINANCE_ONLINE",
            "security_info": "⚡ SAPI Multi-Chain: แลกเปลี่ยนและโอนจ่ายเหรียญอัตโนมัติทุกเชนทันที 24 ชม.",
            "action_hint": "ถือเฉพาะ USDT ไว้ในบัญชีเดียว ระบบจัดการแปลงและโอนออกให้ครบทุกเชนอัตโนมัติ",
            "payout_rails": [
                {"name": "BSC (BEP-20)", "fee": "0.01 USDT", "min": "5.00 USDT", "status": "ONLINE"},
                {"name": "Polygon (MATIC)", "fee": "0.03 USDT", "min": "3.00 USDT", "status": "ONLINE"},
                {"name": "TRON (TRC-20)", "fee": "1.50 USDT", "min": "5.00 USDT", "status": "ONLINE"},
                {"name": "Litecoin (LTC)", "fee": "0.0001 LTC", "min": "0.002 LTC", "status": "ONLINE"}
            ]
        })

        # Card 2: Reserve Cold Vault (คลังสำรองฉุกเฉินบนเชน)
        wallets_list.append({
            "network": "BSC_VAULT",
            "chain": "BSC",
            "role": "RESERVE_VAULT",
            "role_title": "🛡️ คลังสำรองเก็บบนเชน (Cold Emergency Reserve Vault)",
            "name": "คลังสำรองสต็อก USDT (Reserve Vault)",
            "address": evm_reserve,
            "address_label": "เลขกระเป๋าสำหรับเติมเงินสต็อก (USDT-BEP20):",
            "explorer_url": f"https://bscscan.com/address/{evm_reserve}",
            "usdt_balance": round(vault_bsc["token"], 2),
            "gas_symbol": "BNB",
            "gas_balance": round(vault_bsc["native"], 4),
            "is_gas_low": vault_gas_low,
            "status": "VAULT_SECURED",
            "security_info": "🔒 Whitelist Lock: ถอนออกได้เฉพาะกระเป๋า Owner และโอนเติมสต็อกเข้า Binance",
            "action_hint": "กระเป๋าสำรองสำหรับเก็บเงินและเติมสต็อกเข้า Binance เมื่อยอดคงเหลือเริ่มลดลง"
        })

        total_usdt_reserve = round(binance_usdt + vault_bsc["token"], 2)

        data = {
            "timestamp": int(now),
            "wallets": wallets_list,
            "total_usdt_reserve": total_usdt_reserve
        }

        cls._wallet_cache = data
        cls._wallet_cache_time = now
        return data

    @classmethod
    def get_live_rates(cls, force_refresh: bool = False) -> Dict[str, Any]:
        """Fetches live exchange rates and margin spreads (Bitkub / Binance)."""
        now = time.time()
        if not force_refresh and cls._rates_cache and (now - cls._rates_cache_time < 10.0):
            return cls._rates_cache

        usdt_market = 33.80
        ltc_usd = 70.0
        try:
            req = urllib.request.Request("https://api.bitkub.com/api/market/ticker", headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=3.0) as resp:
                res = json.loads(resp.read().decode())
                if "THB_USDT" in res and "last" in res["THB_USDT"]:
                    usdt_market = float(res["THB_USDT"]["last"])
        except Exception:
            pass

        try:
            req = urllib.request.Request("https://api.binance.com/api/v3/ticker/price?symbol=LTCUSDT", headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=3.0) as resp:
                res = json.loads(resp.read().decode())
                if "price" in res:
                    ltc_usd = float(res["price"])
        except Exception:
            pass

        ltc_market = round(ltc_usd * usdt_market, 2)
        margin_usdt = 1.20
        margin_ltc = 50.0

        data = {
            "timestamp": int(now),
            "rates": [
                {
                    "asset": "USDT_BEP20",
                    "network": "BSC",
                    "market_price": round(usdt_market, 2),
                    "margin_thb": margin_usdt,
                    "effective_rate": round(usdt_market + margin_usdt, 2),
                    "network_fee_thb": 10.0,
                    "min_exchange_thb": 50.0
                },
                {
                    "asset": "USDT_TRC20",
                    "network": "TRON",
                    "market_price": round(usdt_market, 2),
                    "margin_thb": margin_usdt,
                    "effective_rate": round(usdt_market + margin_usdt, 2),
                    "network_fee_thb": 35.0,
                    "min_exchange_thb": 100.0
                },
                {
                    "asset": "USDT_POLYGON",
                    "network": "POLYGON",
                    "market_price": round(usdt_market, 2),
                    "margin_thb": margin_usdt,
                    "effective_rate": round(usdt_market + margin_usdt, 2),
                    "network_fee_thb": 5.0,
                    "min_exchange_thb": 50.0
                },
                {
                    "asset": "LTC",
                    "network": "LITECOIN",
                    "market_price": round(ltc_market, 2),
                    "margin_thb": margin_ltc,
                    "effective_rate": round(ltc_market + margin_ltc, 2),
                    "network_fee_thb": 5.0,
                    "min_exchange_thb": 50.0
                }
            ]
        }

        cls._rates_cache = data
        cls._rates_cache_time = now
        return data

    @classmethod
    def get_executive_metrics(cls, range_preset: str = "all") -> Dict[str, Any]:
        """Calculates executive KPI metrics across the requested timeframe."""
        con = cls.get_crypto_db()
        cur = con.cursor()

        now = datetime.datetime.now()
        where_time = ""
        params: List[Any] = []

        if range_preset == "1d":
            start_date = (now - datetime.timedelta(days=1)).isoformat()
            where_time = " AND createdAt >= ?"
            params.append(start_date)
        elif range_preset == "7d":
            start_date = (now - datetime.timedelta(days=7)).isoformat()
            where_time = " AND createdAt >= ?"
            params.append(start_date)
        elif range_preset == "30d":
            start_date = (now - datetime.timedelta(days=30)).isoformat()
            where_time = " AND createdAt >= ?"
            params.append(start_date)

        # 1. Financial Totals for COMPLETED orders
        query_completed = f"""
            SELECT 
                COUNT(*) as count,
                COALESCE(SUM(thbAmountDebit), 0.0) as total_thb,
                COALESCE(SUM(netThbAmount), 0.0) as net_thb,
                COALESCE(SUM(networkFeeThb), 0.0) as network_fee_thb,
                COALESCE(SUM(thbAmountDebit - netThbAmount), 0.0) as gross_margin_thb
            FROM ExchangeOrder
            WHERE status = 'COMPLETED'{where_time}
        """
        cur.execute(query_completed, params)
        comp_row = cur.fetchone()

        # 2. Crypto Outflow by Asset
        query_outflow = f"""
            SELECT asset, COALESCE(SUM(cryptoAmountOut), 0.0) as total_crypto
            FROM ExchangeOrder
            WHERE status = 'COMPLETED'{where_time}
            GROUP BY asset
        """
        cur.execute(query_outflow, params)
        outflow_rows = cur.fetchall()
        crypto_outflow = {row["asset"]: round(row["total_crypto"], 4) for row in outflow_rows}

        # 3. Overall Order Counts (by status)
        query_status = f"""
            SELECT status, COUNT(*) as cnt
            FROM ExchangeOrder
            WHERE 1=1{where_time}
            GROUP BY status
        """
        cur.execute(query_status, params)
        status_rows = cur.fetchall()
        status_counts = {row["status"]: row["cnt"] for row in status_rows}

        total_orders = sum(status_counts.values())
        completed_orders = status_counts.get("COMPLETED", 0)
        failed_orders = status_counts.get("FAILED", 0)
        success_rate = round((completed_orders / total_orders * 100), 1) if total_orders > 0 else 100.0

        # 4. Top-up Stats from VerifiedSlip
        query_topups = "SELECT COUNT(*) as slip_count, COALESCE(SUM(amountThb), 0.0) as total_topup FROM VerifiedSlip"
        cur.execute(query_topups)
        slip_row = cur.fetchone()

        con.close()

        total_thb = round(comp_row["total_thb"], 2)
        gross_margin = round(comp_row["gross_margin_thb"], 2)
        gas_collected = round(comp_row["network_fee_thb"], 2)

        return {
            "range": range_preset,
            "financials": {
                "total_thb_volume": total_thb,
                "gross_margin_profit_thb": gross_margin,
                "gas_fees_collected_thb": gas_collected,
                "completed_orders_count": completed_orders
            },
            "orders_summary": {
                "total_orders": total_orders,
                "completed": completed_orders,
                "failed": failed_orders,
                "queued": status_counts.get("QUEUED_FOR_PAYOUT", 0) + status_counts.get("PROCESSING_PAYOUT", 0),
                "success_rate_pct": success_rate
            },
            "crypto_outflow": crypto_outflow,
            "topup_summary": {
                "slip_count": slip_row["slip_count"],
                "total_topup_thb": round(slip_row["total_topup"], 2)
            }
        }

    @classmethod
    def get_orders(
        cls,
        limit: int = 25,
        offset: int = 0,
        status: Optional[str] = None,
        asset: Optional[str] = None,
        search: Optional[str] = None
    ) -> Dict[str, Any]:
        """Queries orders with search, filter, and pagination support."""
        con = cls.get_crypto_db()
        cur = con.cursor()

        where_clauses = ["1=1"]
        params: List[Any] = []

        if status and status != "ALL":
            where_clauses.append("status = ?")
            params.append(status)

        if asset and asset != "ALL":
            where_clauses.append("asset = ?")
            params.append(asset)

        if search:
            search_clean = f"%{search.strip()}%"
            where_clauses.append("(id LIKE ? OR discordUserId LIKE ? OR recipientAddress LIKE ? OR txHash LIKE ?)")
            params.extend([search_clean, search_clean, search_clean, search_clean])

        where_sql = " AND ".join(where_clauses)

        # Count Total
        cur.execute(f"SELECT COUNT(*) as total FROM ExchangeOrder WHERE {where_sql}", params)
        total_count = cur.fetchone()["total"]

        # Fetch Rows
        query_sql = f"""
            SELECT 
                id, discordUserId, asset, network, recipientAddress,
                thbAmountDebit, networkFeeThb, netThbAmount, marketRate,
                effectiveRate, cryptoAmountOut, status, txHash, explorerUrl,
                errorMessage, createdAt, completedAt
            FROM ExchangeOrder
            WHERE {where_sql}
            ORDER BY createdAt DESC
            LIMIT ? OFFSET ?
        """
        params.extend([limit, offset])
        cur.execute(query_sql, params)
        rows = cur.fetchall()

        orders = []
        for r in rows:
            orders.append({
                "id": r["id"],
                "discord_user_id": r["discordUserId"],
                "asset": r["asset"],
                "network": r["network"],
                "recipient_address": r["recipientAddress"],
                "thb_amount": round(r["thbAmountDebit"], 2),
                "network_fee_thb": round(r["networkFeeThb"], 2),
                "effective_rate": round(r["effectiveRate"], 2),
                "crypto_amount": r["cryptoAmountOut"],
                "status": r["status"],
                "tx_hash": r["txHash"],
                "explorer_url": r["explorerUrl"],
                "error_message": r["errorMessage"],
                "created_at": r["createdAt"],
                "completed_at": r["completedAt"]
            })

        con.close()

        return {
            "total": total_count,
            "limit": limit,
            "offset": offset,
            "orders": orders
        }
