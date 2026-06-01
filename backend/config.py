import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    # Polymarket API endpoints
    # CLOB API (برای بازارهای فعال و اوردربوک)
    CLOB_API_BASE = "https://clob.polymarket.com"
    
    # Gamma API (برای جستجو و اطلاعات بازارها)
    GAMMA_API_BASE = "https://gamma-api.polymarket.com"
    
    # Strapi API (برای محتوا و رویدادها)
    STRAPI_API_BASE = "https://strapi-matic.polymarket.com"
    
    # کلیدهای API (اختیاری - برای ترید نیاز هست)
    API_KEY = os.getenv("POLYMARKET_API_KEY", "")
    API_SECRET = os.getenv("POLYMARKET_API_SECRET", "")
    API_PASSPHRASE = os.getenv("POLYMARKET_API_PASSPHRASE", "")
    
    # Bitcoin related keywords
    BTC_KEYWORDS = [
        "bitcoin", "btc", "Bitcoin", "BTC",
        "bitcoin price", "btc price",
        "bitcoin etf", "btc etf",
        "bitcoin halving",
        "cryptocurrency",
        "satoshi"
    ]
    
    # Cache settings
    CACHE_TTL = 60  # seconds
    
    # Flask settings
    DEBUG = True
    PORT = 5000
