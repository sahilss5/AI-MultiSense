import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select
from backend.app.core.database import get_session
from backend.app.models.db_models import ZoneModel
from backend.app.schemas.domain import ZoneResponse, ZoneCreate, ZoneUpdate

router = APIRouter(prefix="/api/zones", tags=["Restricted Zones"])

@router.get("", response_model=List[ZoneResponse])
def list_zones(session: Session = Depends(get_session)):
    db_zones = session.exec(select(ZoneModel)).all()
    return [
        ZoneResponse(
            id=z.id,
            name=z.name,
            polygon=z.polygon,
            enabled=z.enabled
        )
        for z in db_zones
    ]

@router.post("", response_model=ZoneResponse, status_code=status.HTTP_201_CREATED)
def create_zone(zone_in: ZoneCreate, session: Session = Depends(get_session)):
    zone_id = f"zone_{uuid.uuid4().hex[:6]}"
    zone_model = ZoneModel(
        id=zone_id,
        name=zone_in.name,
        enabled=zone_in.enabled
    )
    zone_model.polygon = zone_in.polygon
    session.add(zone_model)
    session.commit()
    session.refresh(zone_model)

    return ZoneResponse(
        id=zone_model.id,
        name=zone_model.name,
        polygon=zone_model.polygon,
        enabled=zone_model.enabled
    )

@router.put("/{zone_id}", response_model=ZoneResponse)
def update_zone(zone_id: str, zone_in: ZoneUpdate, session: Session = Depends(get_session)):
    zone_model = session.get(ZoneModel, zone_id)
    if not zone_model:
        zone_model = session.exec(select(ZoneModel).where(ZoneModel.name == zone_id)).first()
    if not zone_model:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zone not found")

    if zone_in.name is not None:
        zone_model.name = zone_in.name
    if zone_in.enabled is not None:
        zone_model.enabled = zone_in.enabled
    if zone_in.polygon is not None:
        zone_model.polygon = zone_in.polygon

    session.add(zone_model)
    session.commit()
    session.refresh(zone_model)

    return ZoneResponse(
        id=zone_model.id,
        name=zone_model.name,
        polygon=zone_model.polygon,
        enabled=zone_model.enabled
    )

@router.delete("/{zone_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_zone(zone_id: str, session: Session = Depends(get_session)):
    zone_model = session.get(ZoneModel, zone_id)
    if not zone_model:
        # Fallback: check by zone name in case an alias or name was provided
        zone_model = session.exec(select(ZoneModel).where(ZoneModel.name == zone_id)).first()
    if not zone_model:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Zone not found")
    session.delete(zone_model)
    session.commit()
    return None
