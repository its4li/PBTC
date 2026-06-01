"""سیستم کش ساده برای جلوگیری از درخواست‌های زیاد به API"""

import time
from functools import wraps

class SimpleCache:
    def __init__(self):
        self._cache = {}
    
    def get(self, key):
        if key in self._cache:
            value, expiry = self._cache[key]
            if time.time() < expiry:
                return value
            else:
                del self._cache[key]
        return None
    
    def set(self, key, value, ttl=60):
        self._cache[key] = (value, time.time() + ttl)
    
    def clear(self):
        self._cache.clear()
    
    def cached(self, ttl=60):
        """دکوراتور برای کش کردن نتیجه توابع"""
        def decorator(func):
            @wraps(func)
            def wrapper(*args, **kwargs):
                # ساخت کلید یکتا
                key = f"{func.__name__}:{str(args)}:{str(sorted(kwargs.items()))}"
                result = self.get(key)
                if result is not None:
                    return result
                result = func(*args, **kwargs)
                if result is not None:
                    self.set(key, result, ttl)
                return result
            return wrapper
        return decorator

cache = SimpleCache()
