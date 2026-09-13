import os
import logging
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from fastapi.responses import FileResponse
from sqlmodel import Session
from backend.app.core.database import get_session
from backend.app.core.config import settings
from backend.app.models.db_models import VideoRecordModel
from backend.app.schemas.domain import VideoUploadResponse, VideoControlRequest, VideoStatusResponse
from backend.app.services.video_upload_service import VideoUploadService
from backend.app.services.video_analysis_service import analysis_manager

logger = logging.getLogger("video_router")

router = APIRouter(prefix="/api/video", tags=["Video Upload & Analysis"])

@router.post("/upload", response_model=VideoUploadResponse)
async def upload_video(file: UploadFile = File(...), session: Session = Depends(get_session)):
    response = await VideoUploadService.process_upload(file, session)
    analysis_manager.set_video_ready(response.video_id)
    return response

@router.post("/start", response_model=VideoStatusResponse)
async def start_analysis(req: VideoControlRequest, session: Session = Depends(get_session)):
    record = session.get(VideoRecordModel, req.video_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Video ID '{req.video_id}' not found")

    new_status = await analysis_manager.start_analysis(req.video_id)

    return VideoStatusResponse(
        video_id=record.id,
        filename=record.filename,
        status=new_status,
        analysis_mode=analysis_manager.get_analysis_mode(),
        session_start_time=analysis_manager.session_start_time
    )

@router.post("/pause", response_model=VideoStatusResponse)
async def pause_analysis(req: VideoControlRequest, session: Session = Depends(get_session)):
    record = session.get(VideoRecordModel, req.video_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Video ID '{req.video_id}' not found")

    new_status = await analysis_manager.pause_analysis(req.video_id)

    return VideoStatusResponse(
        video_id=record.id,
        filename=record.filename,
        status=new_status,
        analysis_mode=analysis_manager.get_analysis_mode(),
        session_start_time=analysis_manager.session_start_time
    )

@router.post("/resume", response_model=VideoStatusResponse)
async def resume_analysis(req: VideoControlRequest, session: Session = Depends(get_session)):
    record = session.get(VideoRecordModel, req.video_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Video ID '{req.video_id}' not found")

    new_status = await analysis_manager.resume_analysis(req.video_id)

    return VideoStatusResponse(
        video_id=record.id,
        filename=record.filename,
        status=new_status,
        analysis_mode=analysis_manager.get_analysis_mode(),
        session_start_time=analysis_manager.session_start_time
    )

@router.post("/stop", response_model=VideoStatusResponse)
async def stop_analysis(req: VideoControlRequest, session: Session = Depends(get_session)):
    record = session.get(VideoRecordModel, req.video_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Video ID '{req.video_id}' not found")

    new_status = await analysis_manager.stop_analysis(req.video_id)

    return VideoStatusResponse(
        video_id=record.id,
        filename=record.filename,
        status=new_status,
        analysis_mode=analysis_manager.get_analysis_mode(),
        session_start_time=analysis_manager.session_start_time
    )

@router.get("/file/{video_id}")
def get_video_file(video_id: str, session: Session = Depends(get_session)):
    record = session.get(VideoRecordModel, video_id)
    if not record or not record.filepath or not os.path.exists(record.filepath):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Video file for ID '{video_id}' not found")
    return FileResponse(record.filepath, media_type="video/mp4")

@router.get("/status", response_model=VideoStatusResponse)
def get_video_status(session: Session = Depends(get_session)):
    vid_id = analysis_manager.active_video_id
    filename = None

    if vid_id:
        record = session.get(VideoRecordModel, vid_id)
        if record:
            filename = record.filename

    return VideoStatusResponse(
        video_id=vid_id,
        filename=filename,
        status=analysis_manager.video_status,
        analysis_mode=analysis_manager.get_analysis_mode(),
        session_start_time=analysis_manager.session_start_time
    )

@router.delete("/{video_id}", response_model=VideoStatusResponse)
async def delete_video(video_id: str, session: Session = Depends(get_session)):
    """
    Stops active analysis, broadcasts empty frame, clears active session, and safely
    removes the uploaded file from data/uploads/ (never touches database, snapshots, models, or test videos).
    """
    await analysis_manager.clear_active_video(video_id)

    record = session.get(VideoRecordModel, video_id)
    if not record:
        return VideoStatusResponse(
            video_id=None,
            filename=None,
            status="no_video_selected",
            analysis_mode=analysis_manager.get_analysis_mode()
        )

    # Safely delete uploaded file from disk strictly if inside settings.UPLOAD_DIR
    if record.filepath and os.path.exists(record.filepath):
        abs_filepath = os.path.abspath(record.filepath)
        abs_upload_dir = os.path.abspath(settings.UPLOAD_DIR)
        try:
            # Check file is inside UPLOAD_DIR (prevents arbitrary file deletion)
            if os.path.commonpath([abs_filepath, abs_upload_dir]) == abs_upload_dir and abs_filepath != abs_upload_dir:
                os.remove(abs_filepath)
                logger.info(f"Deleted uploaded file: {abs_filepath}")
        except Exception as e:
            logger.warning(f"Failed to delete uploaded file {abs_filepath}: {e}")

    # Remove DB record
    session.delete(record)
    session.commit()

    return VideoStatusResponse(
        video_id=None,
        filename=None,
        status="no_video_selected",
        analysis_mode=analysis_manager.get_analysis_mode()
    )

@router.post("/clear", response_model=VideoStatusResponse)
async def clear_active_video():
    """
    Clears active video session from memory and halts analysis without deleting files.
    """
    await analysis_manager.clear_active_video()
    return VideoStatusResponse(
        video_id=None,
        filename=None,
        status="no_video_selected",
        analysis_mode=analysis_manager.get_analysis_mode()
    )
