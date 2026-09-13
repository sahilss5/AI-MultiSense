import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from backend.app.services.video_analysis_service import analysis_manager

router = APIRouter(tags=["WebSocket Stream"])
logger = logging.getLogger("ws_router")

@router.websocket("/ws/live")
async def websocket_live_endpoint(websocket: WebSocket):
    await websocket.accept()
    analysis_manager.register_websocket(websocket)
    try:
        while True:
            # Keep connection alive; client can send heartbeats or messages
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        analysis_manager.unregister_websocket(websocket)
    except Exception as e:
        logger.warning(f"WebSocket client disconnected: {e}")
        analysis_manager.unregister_websocket(websocket)
