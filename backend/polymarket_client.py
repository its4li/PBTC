"""
کلاینت Polymarket API
بر اساس مستندات: https://docs.polymarket.com/
"""

import requests
import logging
from typing import List, Dict, Optional, Any
from config import Config
from cache import cache

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class PolymarketClient:
    """کلاینت برای ارتباط با API های مختلف Polymarket"""
    
    def __init__(self):
        self.clob_base = Config.CLOB_API_BASE
        self.gamma_base = Config.GAMMA_API_BASE
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "Accept": "application/json"
        })
    
    # =========================================
    #  Gamma API - جستجو و اطلاعات بازارها
    # =========================================
    
    def search_markets(self, query: str, limit: int = 50, offset: int = 0, 
                       active: bool = True, closed: bool = False) -> List[Dict]:
        """
        جستجوی بازارها با استفاده از Gamma API
        """
        try:
            params = {
                "limit": limit,
                "offset": offset,
                "active": str(active).lower(),
                "closed": str(closed).lower(),
            }
            
            # استفاده از endpoint events با فیلتر tag
            url = f"{self.gamma_base}/events"
            params["tag"] = "crypto"  # فیلتر برای کریپتو
            
            response = self.session.get(url, params=params, timeout=15)
            response.raise_for_status()
            events = response.json()
            
            # فیلتر بیت‌کوین
            btc_events = self._filter_bitcoin_events(events)
            
            return btc_events
            
        except requests.exceptions.RequestException as e:
            logger.error(f"Error searching markets: {e}")
            return []
    
    def get_all_bitcoin_markets(self) -> List[Dict]:
        """
        دریافت تمام بازارهای مرتبط با بیت‌کوین
        ترکیب چند روش جستجو
        """
        all_markets = []
        seen_ids = set()
        
        # روش 1: جستجو با Gamma API events
        try:
            for keyword in ["bitcoin", "btc", "Bitcoin", "BTC"]:
                url = f"{self.gamma_base}/events"
                params = {
                    "limit": 100,
                    "active": "true",
                    "closed": "false",
                    "tag": "crypto"
                }
                
                response = self.session.get(url, params=params, timeout=15)
                if response.status_code == 200:
                    events = response.json()
                    for event in events:
                        if self._is_bitcoin_related(event):
                            event_id = event.get("id", "")
                            if event_id not in seen_ids:
                                seen_ids.add(event_id)
                                all_markets.append(event)
        except Exception as e:
            logger.error(f"Error fetching from Gamma events: {e}")
        
        # روش 2: جستجو با Gamma API markets
        try:
            for keyword in ["bitcoin", "btc", "BTC"]:
                url = f"{self.gamma_base}/markets"
                params = {
                    "limit": 100,
                    "active": "true",
                    "closed": "false",
                }
                
                response = self.session.get(url, params=params, timeout=15)
                if response.status_code == 200:
                    markets = response.json()
                    for market in markets:
                        if self._is_bitcoin_related_market(market):
                            market_id = market.get("id", market.get("condition_id", ""))
                            if market_id not in seen_ids:
                                seen_ids.add(market_id)
                                # تبدیل به فرمت یکسان
                                formatted = self._format_market_as_event(market)
                                all_markets.append(formatted)
        except Exception as e:
            logger.error(f"Error fetching from Gamma markets: {e}")
        
        # روش 3: CLOB API
        try:
            url = f"{self.clob_base}/markets"
            params = {"next_cursor": "MA=="}
            
            response = self.session.get(url, params=params, timeout=15)
            if response.status_code == 200:
                data = response.json()
                markets = data.get("data", data) if isinstance(data, dict) else data
                if isinstance(markets, list):
                    for market in markets:
                        if self._is_bitcoin_related_market(market):
                            market_id = market.get("condition_id", market.get("id", ""))
                            if market_id not in seen_ids:
                                seen_ids.add(market_id)
                                formatted = self._format_clob_market(market)
                                all_markets.append(formatted)
        except Exception as e:
            logger.error(f"Error fetching from CLOB: {e}")
        
        # مرتب‌سازی بر اساس حجم معاملات
        all_markets.sort(
            key=lambda x: float(x.get("volume", 0) or 0), 
            reverse=True
        )
        
        return all_markets
    
    def get_market_detail(self, condition_id: str) -> Optional[Dict]:
        """دریافت جزئیات یک بازار خاص"""
        try:
            # Gamma API
            url = f"{self.gamma_base}/markets/{condition_id}"
            response = self.session.get(url, timeout=15)
            if response.status_code == 200:
                return response.json()
            
            # CLOB API fallback
            url = f"{self.clob_base}/markets/{condition_id}"
            response = self.session.get(url, timeout=15)
            if response.status_code == 200:
                return response.json()
                
        except Exception as e:
            logger.error(f"Error getting market detail: {e}")
        
        return None
    
    # =========================================
    #  CLOB API - قیمت‌ها و اوردربوک
    # =========================================
    
    def get_orderbook(self, token_id: str) -> Optional[Dict]:
        """دریافت اوردربوک یک توکن"""
        try:
            url = f"{self.clob_base}/book"
            params = {"token_id": token_id}
            
            response = self.session.get(url, params=params, timeout=15)
            response.raise_for_status()
            return response.json()
            
        except Exception as e:
            logger.error(f"Error getting orderbook: {e}")
            return None
    
    def get_price(self, token_id: str) -> Optional[Dict]:
        """دریافت قیمت فعلی یک توکن"""
        try:
            url = f"{self.clob_base}/price"
            params = {
                "token_id": token_id,
                "side": "buy"
            }
            
            response = self.session.get(url, params=params, timeout=15)
            response.raise_for_status()
            return response.json()
            
        except Exception as e:
            logger.error(f"Error getting price: {e}")
            return None
    
    def get_prices_history(self, token_id: str, interval: str = "1d", 
                           fidelity: int = 60) -> Optional[List]:
        """
        دریافت تاریخچه قیمت
        interval: 1d, 1w, 1m, 3m, all
        fidelity: دقت بر حسب دقیقه
        """
        try:
            url = f"{self.clob_base}/prices-history"
            params = {
                "market": token_id,
                "interval": interval,
                "fidelity": fidelity
            }
            
            response = self.session.get(url, params=params, timeout=15)
            response.raise_for_status()
            data = response.json()
            return data.get("history", data)
            
        except Exception as e:
            logger.error(f"Error getting price history: {e}")
            return None
    
    def get_midpoint(self, token_id: str) -> Optional[Dict]:
        """دریافت قیمت میانه"""
        try:
            url = f"{self.clob_base}/midpoint"
            params = {"token_id": token_id}
            
            response = self.session.get(url, params=params, timeout=15)
            response.raise_for_status()
            return response.json()
            
        except Exception as e:
            logger.error(f"Error getting midpoint: {e}")
            return None
    
    def get_last_trade_price(self, token_id: str) -> Optional[Dict]:
        """دریافت قیمت آخرین معامله"""
        try:
            url = f"{self.clob_base}/last-trade-price"
            params = {"token_id": token_id}
            
            response = self.session.get(url, params=params, timeout=15)
            response.raise_for_status()
            return response.json()
            
        except Exception as e:
            logger.error(f"Error getting last trade price: {e}")
            return None
    
    # =========================================
    #  توابع کمکی
    # =========================================
    
    def _is_bitcoin_related(self, event: Dict) -> bool:
        """بررسی اینکه آیا یک رویداد مرتبط با بیت‌کوین است"""
        searchable_fields = [
            event.get("title", ""),
            event.get("description", ""),
            event.get("slug", ""),
            str(event.get("tags", [])),
        ]
        
        # بررسی بازارهای داخلی رویداد
        markets = event.get("markets", [])
        if isinstance(markets, list):
            for market in markets:
                if isinstance(market, dict):
                    searchable_fields.append(market.get("question", ""))
                    searchable_fields.append(market.get("description", ""))
        
        combined = " ".join(searchable_fields).lower()
        
        btc_terms = ["bitcoin", "btc", "₿"]
        return any(term in combined for term in btc_terms)
    
    def _is_bitcoin_related_market(self, market: Dict) -> bool:
        """بررسی اینکه آیا یک مارکت مرتبط با بیت‌کوین است"""
        searchable_fields = [
            market.get("question", ""),
            market.get("description", ""),
            market.get("market_slug", ""),
            market.get("title", ""),
            str(market.get("tags", [])),
        ]
        
        combined = " ".join(searchable_fields).lower()
        btc_terms = ["bitcoin", "btc", "₿"]
        return any(term in combined for term in btc_terms)
    
    def _filter_bitcoin_events(self, events: List[Dict]) -> List[Dict]:
        """فیلتر رویدادها برای یافتن موارد مرتبط با بیت‌کوین"""
        return [e for e in events if self._is_bitcoin_related(e)]
    
    def _format_market_as_event(self, market: Dict) -> Dict:
        """تبدیل فرمت مارکت به فرمت استاندارد"""
        return {
            "id": market.get("id", market.get("condition_id", "")),
            "title": market.get("question", market.get("title", "")),
            "description": market.get("description", ""),
            "slug": market.get("market_slug", ""),
            "volume": market.get("volume", market.get("volumeNum", 0)),
            "liquidity": market.get("liquidity", market.get("liquidityNum", 0)),
            "start_date": market.get("startDate", market.get("start_date_iso", "")),
            "end_date": market.get("endDate", market.get("end_date_iso", "")),
            "active": market.get("active", True),
            "closed": market.get("closed", False),
            "outcomes": market.get("outcomes", ["Yes", "No"]),
            "outcome_prices": market.get("outcomePrices", market.get("outcome_prices", "")),
            "tokens": market.get("tokens", market.get("clobTokenIds", [])),
            "condition_id": market.get("condition_id", market.get("conditionId", "")),
            "image": market.get("image", market.get("icon", "")),
            "source": "gamma_markets"
        }
    
    def _format_clob_market(self, market: Dict) -> Dict:
        """تبدیل فرمت CLOB به فرمت استاندارد"""
        tokens = market.get("tokens", [])
        token_ids = []
        outcome_prices = []
        outcomes = []
        
        if isinstance(tokens, list):
            for token in tokens:
                if isinstance(token, dict):
                    token_ids.append(token.get("token_id", ""))
                    outcome_prices.append(str(token.get("price", "0")))
                    outcomes.append(token.get("outcome", ""))
        
        return {
            "id": market.get("condition_id", ""),
            "title": market.get("question", market.get("description", "")),
            "description": market.get("description", ""),
            "slug": market.get("market_slug", ""),
            "volume": market.get("volume", 0),
            "liquidity": market.get("liquidity", 0),
            "start_date": market.get("game_start_time", ""),
            "end_date": market.get("end_date_iso", ""),
            "active": market.get("active", True),
            "closed": market.get("closed", False),
            "outcomes": outcomes or market.get("outcomes", ["Yes", "No"]),
            "outcome_prices": outcome_prices,
            "tokens": token_ids,
            "condition_id": market.get("condition_id", ""),
            "image": market.get("icon", ""),
            "source": "clob"
        }
    
    def get_dashboard_data(self) -> Dict[str, Any]:
        """
        دریافت تمام داده‌های مورد نیاز داشبورد
        """
        markets = self.get_all_bitcoin_markets()
        
        # دسته‌بندی
        active_markets = [m for m in markets if m.get("active") and not m.get("closed")]
        closed_markets = [m for m in markets if m.get("closed")]
        
        # آمار کلی
        total_volume = sum(float(m.get("volume", 0) or 0) for m in markets)
        total_liquidity = sum(float(m.get("liquidity", 0) or 0) for m in markets)
        
        # دریافت قیمت برای بازارهای فعال
        for market in active_markets[:20]:  # حداکثر 20 بازار اول
            tokens = market.get("tokens", [])
            prices = []
            
            if isinstance(tokens, list):
                for token_id in tokens[:2]:  # Yes و No
                    if token_id and isinstance(token_id, str) and len(token_id) > 10:
                        price_data = self.get_midpoint(token_id)
                        if price_data:
                            prices.append(price_data.get("mid", 0))
            
            if prices:
                market["live_prices"] = prices
            
            # استفاده از outcome_prices اگر live_prices نداریم
            if not prices and market.get("outcome_prices"):
                op = market["outcome_prices"]
                if isinstance(op, str):
                    try:
                        import json
                        market["live_prices"] = [float(p) for p in json.loads(op)]
                    except:
                        pass
                elif isinstance(op, list):
                    market["live_prices"] = [float(p) for p in op if p]
        
        return {
            "summary": {
                "total_markets": len(markets),
                "active_markets": len(active_markets),
                "closed_markets": len(closed_markets),
                "total_volume": round(total_volume, 2),
                "total_liquidity": round(total_liquidity, 2),
            },
            "active_markets": active_markets,
            "closed_markets": closed_markets[:10],  # 10 بازار بسته اخیر
            "top_by_volume": sorted(active_markets, 
                                     key=lambda x: float(x.get("volume", 0) or 0), 
                                     reverse=True)[:10],
        }
