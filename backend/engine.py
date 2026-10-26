import numpy as np
from collections import deque

class StreamingAnalyticsEngine:
    def __init__(self, window_size=35):
        self.price_window = deque(maxlen=window_size)

    def process_tick(self, tick):
        price = tick["price"]
        self.price_window.append(price)

        z_score = 0.0
        if len(self.price_window) >= 10:
            prices = np.array(self.price_window)
            mean = np.mean(prices)
            std = np.std(prices)
            if std > 0:
                z_score = round(float((price - mean) / std), 2)

        orderbook = self._generate_orderbook(price)

        return {
            "processed_tick": tick,
            "z_score": z_score,
            "orderbook": orderbook,
            "is_anomaly": abs(z_score) >= 3.0
        }

    def _generate_orderbook(self, mid_price):
        bids = []
        asks = []
        for i in range(1, 6):
            spread = i * 0.75
            bids.append({
                "price": round(mid_price - spread, 2),
                "size": round(float(np.random.uniform(0.4, 3.2)), 3)
            })
            asks.append({
                "price": round(mid_price + spread, 2),
                "size": round(float(np.random.uniform(0.4, 3.2)), 3)
            })
        return {"bids": bids, "asks": asks}