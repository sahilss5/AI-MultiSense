import os
import json
import uuid
from sqlmodel import SQLModel, create_engine, Session, select
from backend.app.core.config import settings
from backend.app.models.db_models import ZoneModel, SettingsModel, AlertModel, VideoRecordModel, SessionSummaryModel

# Ensure database directory exists
db_path = settings.DATABASE_URL.replace("sqlite:///", "")
if db_path != ":memory:":
    os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)

from sqlalchemy import event

connect_args = {"check_same_thread": False, "timeout": 30}
engine = create_engine(settings.DATABASE_URL, connect_args=connect_args, echo=False)

@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.execute("PRAGMA busy_timeout=30000")
    cursor.close()

def init_db():
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        # Migrate alerts table to ensure video_id column exists
        from sqlalchemy import text
        try:
            cols = [r[1] for r in session.execute(text("PRAGMA table_info(alerts)")).all()]
            if "video_id" not in cols:
                session.execute(text("ALTER TABLE alerts ADD COLUMN video_id VARCHAR"))
                session.commit()
        except Exception:
            pass
        # Initialize default settings if not existing
        existing_settings = session.exec(select(SettingsModel).where(SettingsModel.id == 1)).first()
        if not existing_settings:
            default_settings = SettingsModel(
                id=1,
                speed_threshold_kmh=settings.DEFAULT_SPEED_THRESHOLD_KMH,
                confidence_threshold=settings.DEFAULT_CONFIDENCE_THRESHOLD,
                tracking_iou_threshold=settings.DEFAULT_TRACKING_IOU_THRESHOLD,
                thermal_camera_enabled=True,
                alert_sound_enabled=True
            )
            session.add(default_settings)
        
        # Initialize default zones if not existing
        existing_zones = session.exec(select(ZoneModel)).all()
        if not existing_zones:
            zone1 = ZoneModel(
                id=f"zone_{uuid.uuid4().hex[:6]}",
                name="Restricted Zone A (North Gate)",
                polygon_json=json.dumps([[0.1, 0.1], [0.45, 0.1], [0.45, 0.5], [0.1, 0.5]]),
                enabled=True
            )
            zone2 = ZoneModel(
                id=f"zone_{uuid.uuid4().hex[:6]}",
                name="Perimeter Zone B (South Facility)",
                polygon_json=json.dumps([[0.55, 0.45], [0.95, 0.45], [0.95, 0.9], [0.55, 0.9]]),
                enabled=True
            )
            session.add(zone1)
            session.add(zone2)
        
        session.commit()

def get_session():
    with Session(engine) as session:
        yield session
