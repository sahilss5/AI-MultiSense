import os
import re
import base64
from datetime import datetime
from typing import List
from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse

from backend.app.core.config import settings
from backend.app.schemas.domain import (
    SnapshotCreateRequest,
    SnapshotResponse,
    SnapshotListItem,
)

router = APIRouter(prefix="/api/snapshots", tags=["Snapshots"])

PNG_MAGIC_BYTES = b"\x89PNG\r\n\x1a\n"


@router.post("", response_model=SnapshotResponse, status_code=status.HTTP_201_CREATED)
def create_snapshot(request: SnapshotCreateRequest):
    """
    Saves a captured thermal surveillance PNG image frame into data/snapshots/.
    Validates base64 data and PNG magic header.
    """
    raw_input = request.image_data.strip() if request.image_data else ""
    if not raw_input:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Image data cannot be empty."
        )

    # Strip data URL scheme prefix if present (e.g., data:image/png;base64,...)
    if "," in raw_input and (raw_input.startswith("data:") or "base64," in raw_input):
        encoded_data = raw_input.split(",", 1)[1].strip()
    else:
        encoded_data = raw_input

    try:
        image_bytes = base64.b64decode(encoded_data, validate=True)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid base64 encoding: {str(e)}"
        )

    # Validate PNG magic signature
    if len(image_bytes) < len(PNG_MAGIC_BYTES) or not image_bytes.startswith(PNG_MAGIC_BYTES):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid image format. Only valid PNG images are accepted."
        )

    # Ensure snapshots directory exists
    snapshots_dir = os.path.abspath(settings.SNAPSHOTS_DIR)
    os.makedirs(snapshots_dir, exist_ok=True)

    # Generate timestamp-based filename: thermal_snapshot_YYYYMMDD_HHMMSS.png
    base_timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"thermal_snapshot_{base_timestamp}.png"
    target_filepath = os.path.join(snapshots_dir, filename)

    # If clicked rapidly in the same second, append collision counter to guarantee uniqueness
    counter = 1
    while os.path.exists(target_filepath):
        filename = f"thermal_snapshot_{base_timestamp}_{counter}.png"
        target_filepath = os.path.join(snapshots_dir, filename)
        counter += 1

    # Write PNG bytes permanently to disk
    try:
        with open(target_filepath, "wb") as f:
            f.write(image_bytes)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to write snapshot to disk: {str(e)}"
        )

    return SnapshotResponse(
        success=True,
        filename=filename,
        filepath=target_filepath,
        timestamp=datetime.now().isoformat(),
        size_bytes=len(image_bytes),
    )


@router.get("", response_model=List[SnapshotListItem])
def list_snapshots():
    """
    List all captured snapshot files currently saved in data/snapshots/.
    """
    snapshots_dir = os.path.abspath(settings.SNAPSHOTS_DIR)
    os.makedirs(snapshots_dir, exist_ok=True)

    items: List[SnapshotListItem] = []
    for entry in os.listdir(snapshots_dir):
        if entry.lower().endswith(".png"):
            full_path = os.path.join(snapshots_dir, entry)
            if os.path.isfile(full_path):
                stat = os.stat(full_path)
                mtime_iso = datetime.fromtimestamp(stat.st_mtime).isoformat()
                items.append(
                    SnapshotListItem(
                        filename=entry,
                        filepath=full_path,
                        timestamp=mtime_iso,
                        size_bytes=stat.st_size,
                    )
                )

    # Sort newest first
    items.sort(key=lambda x: x.timestamp, reverse=True)
    return items


@router.get("/{filename}")
def get_snapshot_file(filename: str):
    """
    Retrieve a specific snapshot image by filename.
    """
    # Sanitize filename to prevent directory traversal
    clean_filename = os.path.basename(filename)
    if not clean_filename.lower().endswith(".png"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PNG snapshot files are accessible."
        )

    snapshots_dir = os.path.abspath(settings.SNAPSHOTS_DIR)
    target_filepath = os.path.join(snapshots_dir, clean_filename)

    if not os.path.isfile(target_filepath):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Snapshot '{clean_filename}' not found."
        )

    return FileResponse(target_filepath, media_type="image/png", filename=clean_filename)
