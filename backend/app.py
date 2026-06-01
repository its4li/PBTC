"""
Flask API Server برای داشبورد Polymarket Bitcoin
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
from polymarket_client import PolymarketClient
from cache import cache
from config import Config
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

client = PolymarketClient()


@app.route("/api/health", methods=["GET"])
def health_check():
    """بررسی سلامت سرور"""
    return jsonify({
        "status": "healthy",
        "service": "Polymarket BTC Dashboard API"
    })


@app.route("/api/dashboard", methods=["GET"])
def get_dashboard():
    """
    دریافت داده‌های اصلی داشبورد
    شامل خلاصه آمار، بازارهای فعال و برتر
    """
    try:
        # بررسی کش
        cached_data = cache.get("dashboard_data")
        if cached_data:
            return jsonify({"success": True, "data": cached_data, "cached": True})
        
        data = client.get_dashboard_data()
        cache.set("dashboard_data", data, ttl=Config.CACHE_TTL)
        
        return jsonify({"success": True, "data": data, "cached": False})
    
    except Exception as e:
        logger.error(f"Dashboard error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/markets", methods=["GET"])
def get_markets():
    """
    دریافت لیست بازارهای بیت‌کوین
    Query params: active, closed, sort_by, limit
    """
    try:
        active = request.args.get("active", "true").lower() == "true"
        closed = request.args.get("closed", "false").lower() == "true"
        sort_by = request.args.get("sort_by", "volume")
        limit = int(request.args.get("limit", 50))
        
        cache_key = f"markets_{active}_{closed}_{sort_by}_{limit}"
        cached = cache.get(cache_key)
        if cached:
            return jsonify({"success": True, "data": cached, "cached": True})
        
        markets = client.get_all_bitcoin_markets()
        
        # فیلتر
        if active and not closed:
            markets = [m for m in markets if m.get("active") and not m.get("closed")]
        elif closed and not active:
            markets = [m for m in markets if m.get("closed")]
        
        # مرتب‌سازی
        if sort_by == "volume":
            markets.sort(key=lambda x: float(x.get("volume", 0) or 0), reverse=True)
        elif sort_by == "liquidity":
            markets.sort(key=lambda x: float(x.get("liquidity", 0) or 0), reverse=True)
        elif sort_by == "newest":
            markets.sort(key=lambda x: x.get("start_date", ""), reverse=True)
        
        markets = markets[:limit]
        
        cache.set(cache_key, markets, ttl=Config.CACHE_TTL)
        
        return jsonify({"success": True, "data": markets, "count": len(markets)})
    
    except Exception as e:
        logger.error(f"Markets error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/market/<condition_id>", methods=["GET"])
def get_market_detail(condition_id):
    """دریافت جزئیات یک بازار خاص"""
    try:
        cached = cache.get(f"market_{condition_id}")
        if cached:
            return jsonify({"success": True, "data": cached, "cached": True})
        
        data = client.get_market_detail(condition_id)
        if data:
            cache.set(f"market_{condition_id}", data, ttl=30)
            return jsonify({"success": True, "data": data})
        
        return jsonify({"success": False, "error": "Market not found"}), 404
    
    except Exception as e:
        logger.error(f"Market detail error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/orderbook/<token_id>", methods=["GET"])
def get_orderbook(token_id):
    """دریافت اوردربوک"""
    try:
        data = client.get_orderbook(token_id)
        if data:
            return jsonify({"success": True, "data": data})
        return jsonify({"success": False, "error": "Orderbook not found"}), 404
    
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/price/<token_id>", methods=["GET"])
def get_price(token_id):
    """دریافت قیمت فعلی"""
    try:
        midpoint = client.get_midpoint(token_id)
        last_trade = client.get_last_trade_price(token_id)
        
        return jsonify({
            "success": True,
            "data": {
                "midpoint": midpoint,
                "last_trade": last_trade
            }
        })
    
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/price-history/<token_id>", methods=["GET"])
def get_price_history(token_id):
    """دریافت تاریخچه قیمت"""
    try:
        interval = request.args.get("interval", "1w")
        fidelity = int(request.args.get("fidelity", 60))
        
        data = client.get_prices_history(token_id, interval, fidelity)
        if data:
            return jsonify({"success": True, "data": data})
        return jsonify({"success": False, "error": "No history found"}), 404
    
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/refresh", methods=["POST"])
def refresh_cache():
    """پاک‌سازی کش و بارگذاری مجدد"""
    try:
        cache.clear()
        return jsonify({"success": True, "message": "Cache cleared"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


if __name__ == "__main__":
    logger.info("🚀 Starting Polymarket BTC Dashboard API...")
    logger.info(f"📡 CLOB API: {Config.CLOB_API_BASE}")
    logger.info(f"📡 Gamma API: {Config.GAMMA_API_BASE}")
    app.run(
        host="0.0.0.0",
        port=Config.PORT,
        debug=Config.DEBUG
    )
