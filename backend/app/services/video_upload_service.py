import os
import uuid
from datetime import datetime, timezone
from fastapi import UploadFile, HTTPException, status
from sqlmodel import Session, select
from backend.app.core.config import settings
from backend.app.models.db_models import VideoRecordModel
from backend.app.schemas.domain import VideoUploadResponse

class VideoUploadService:
    """
    Validates and stores uploaded thermal video files.
    """

    @staticmethod
    async def process_upload(file: UploadFile, session: Session) -> VideoUploadResponse:
        filename = file.filename or "thermal_video.mp4"
        ext = os.path.splitext(filename)[1].lower()

        # Validate file extension
        if ext not in settings.ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid video format '{ext}'. Allowed formats: {', '.join(settings.ALLOWED_EXTENSIONS)}"
            )

        # Read contents to check size
        contents = await file.read()
        file_size = len(contents)
        max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024

        if file_size > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File size ({round(file_size / (1024*1024), 2)} MB) exceeds maximum limit of {settings.MAX_UPLOAD_SIZE_MB} MB"
            )

        # Save to disk under data/uploads/
        os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
        video_id = f"vid_{uuid.uuid4().hex[:8]}"
        saved_filename = f"{video_id}{ext}"
        filepath = os.path.join(settings.UPLOAD_DIR, saved_filename)

        with open(filepath, "wb") as f:
            f.write(contents)

        # Create record with status 'ready'
        timestamp = datetime.now(timezone.utc).isoformat()
        video_record = VideoRecordModel(
            id=video_id,
            filename=filename,
            filepath=filepath,
            file_size=file_size,
            status="ready",
            uploaded_at=timestamp
        )
        session.add(video_record)
        session.commit()
        session.refresh(video_record)

        return VideoUploadResponse(
            video_id=video_record.id,
            filename=video_record.filename,
            status="ready"
        )
