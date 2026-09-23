import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

class Settings(BaseSettings):
    PROJECT_NAME: str = "AI-MultiSense Surveillance"
    THERMAL_MODEL_PATH: str = os.getenv("THERMAL_MODEL_PATH", "models/thermal/best.pt")
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./data/surveillance.db")
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "data/uploads")
    SNAPSHOTS_DIR: str = os.getenv("SNAPSHOTS_DIR", "data/snapshots")
    MAX_UPLOAD_SIZE_MB: int = int(os.getenv("MAX_UPLOAD_SIZE_MB", "100"))
    ALLOWED_EXTENSIONS: List[str] = [".mp4", ".avi", ".mov"]
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "https://ai-multisense.vercel.app",
    ]
    DEFAULT_SPEED_THRESHOLD_KMH: float = 80.0
    DEFAULT_CONFIDENCE_THRESHOLD: float = 0.5
    DEFAULT_TRACKING_IOU_THRESHOLD: float = 0.3

    @classmethod
    def parse_cors_origins(cls, v) -> List[str]:
        defaults = [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:3000",
            "https://ai-multisense.vercel.app",
        ]
        if not v:
            return defaults
        if isinstance(v, list):
            res = list(defaults)
            for item in v:
                if str(item) not in res:
                    res.append(str(item))
            return res
        if isinstance(v, str):
            v_str = v.strip()
            import json
            if v_str.startswith("[") and v_str.endswith("]"):
                try:
                    parsed = json.loads(v_str)
                    if isinstance(parsed, list):
                        res = list(defaults)
                        for item in parsed:
                            if str(item) not in res:
                                res.append(str(item))
                        return res
                except Exception:
                    pass
            res = list(defaults)
            for part in v_str.split(","):
                part = part.strip()
                if part and part not in res:
                    res.append(part)
            return res
        return defaults

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.CORS_ORIGINS = self.parse_cors_origins(self.CORS_ORIGINS)

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()
