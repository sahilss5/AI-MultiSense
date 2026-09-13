import os
import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.app.core.config import settings
from backend.app.core.database import init_db
from backend.app.api import (
    status_router,
    detections_router,
    zones_router,
    settings_router,
    video_router,
    alerts_router,
    ws_router,
    snapshots_router
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup logic
    init_db()
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    os.makedirs(settings.SNAPSHOTS_DIR, exist_ok=True)
    os.makedirs(os.path.dirname(settings.THERMAL_MODEL_PATH), exist_ok=True)
    yield
    # Shutdown logic

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Real-Time Thermal Deep Learning Surveillance Engine & API",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Routers
app.include_router(status_router.router)
app.include_router(detections_router.router)
app.include_router(zones_router.router)
app.include_router(settings_router.router)
app.include_router(video_router.router)
app.include_router(alerts_router.router)
app.include_router(ws_router.router)
app.include_router(snapshots_router.router)

@app.get("/")
def root():
    return {
        "system": settings.PROJECT_NAME,
        "status": "ONLINE",
        "docs": "/docs"
    }
