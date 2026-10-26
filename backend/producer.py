import time
import random
from datetime import datetime

class MarketDataGenerator:
    def __init__(self, symbol="BTC-USDT", base_price=64250.0):
        self.symbol = symbol
        self.price = base_price
        self.wallets = ["0x71A...3bF", "0x98E...11A", "0x44C...89D", "0x12F...99E"]

    def generate_tick(self):
        delta = random.uniform(-0.0012, 0.0012)
        self.price = round(self.price * (1 + delta), 2)
        volume = round(random.uniform(0.02, 1.45), 4)
        side = random.choice(["BUY", "SELL"])

        return {
            "type": "TICK",
            "symbol": self.symbol,
            "price": self.price,
            "volume": volume,
            "side": side,
            "timestamp": datetime.utcnow().strftime("%H:%M:%S.%f")[:-3]
        }

    def trigger_flash_crash(self):
        drop_pct = random.uniform(0.045, 0.065)
        self.price = round(self.price * (1 - drop_pct), 2)
        return {
            "type": "FLASH_CRASH_DETECTED",
            "symbol": self.symbol,
            "price": self.price,
            "drop_percent": round(drop_pct * 100, 2),
            "z_score": round(random.uniform(3.8, 5.4), 2),
            "timestamp": datetime.utcnow().strftime("%H:%M:%S.%f")[:-3]
        }

    def trigger_whale(self):
        side = random.choice(["BUY", "SELL"])
        vol = round(random.uniform(35.0, 80.0), 2)
        shift = 0.009 if side == "BUY" else -0.009
        self.price = round(self.price * (1 + shift), 2)
        return {
            "type": "WHALE_ALERT",
            "symbol": self.symbol,
            "price": self.price,
            "volume": vol,
            "notional_usd": round(self.price * vol, 2),
            "side": side,
            "timestamp": datetime.utcnow().strftime("%H:%M:%S.%f")[:-3]
        }

    def trigger_wash_trade(self):
        return {
            "type": "WASH_TRADE_DETECTED",
            "symbol": self.symbol,
            "pattern": "CIRCULAR_COLLUSION",
            "wallets": self.wallets,
            "volume": round(random.uniform(18.0, 42.0), 2),
            "confidence_score": 0.96,
            "timestamp": datetime.utcnow().strftime("%H:%M:%S.%f")[:-3]
        }