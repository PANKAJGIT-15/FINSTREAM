import asyncio
import json
import os
import sys

# Backend folder ko path me add kiya taki direct run karne par import error na aaye
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from producer import MarketDataGenerator
from engine import StreamingAnalyticsEngine

app = FastAPI(title="FinStream Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

generator = MarketDataGenerator()
analytics_engine = StreamingAnalyticsEngine()

@app.websocket("/ws/market")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()

    async def client_listener():
        try:
            while True:
                msg = await websocket.receive_text()
                payload = json.loads(msg)
                action = payload.get("action")
                
                if action == "TRIGGER_FLASH_CRASH":
                    data = generator.trigger_flash_crash()
                    await websocket.send_text(json.dumps({"event": "ANOMALY", "data": data}))
                elif action == "TRIGGER_WHALE":
                    data = generator.trigger_whale()
                    await websocket.send_text(json.dumps({"event": "WHALE", "data": data}))
                elif action == "TRIGGER_WASH_TRADE":
                    data = generator.trigger_wash_trade()
                    await websocket.send_text(json.dumps({"event": "WASH_TRADE", "data": data}))
        except WebSocketDisconnect:
            pass

    async def stream_broadcaster():
        try:
            while True:
                tick = generator.generate_tick()
                result = analytics_engine.process_tick(tick)
                message = {
                    "event": "MARKET_DATA",
                    "tick": result["processed_tick"],
                    "z_score": result["z_score"],
                    "orderbook": result["orderbook"],
                    "is_anomaly": result["is_anomaly"]
                }
                await websocket.send_text(json.dumps(message))
                await asyncio.sleep(0.12)
        except WebSocketDisconnect:
            pass

    listener_task = asyncio.create_task(client_listener())
    broadcaster_task = asyncio.create_task(stream_broadcaster())

    done, pending = await asyncio.wait(
        [listener_task, broadcaster_task],
        return_when=asyncio.FIRST_COMPLETED
    )
    for task in pending:
        task.cancel()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)