import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
from database import SessionLocal
from .auth import get_current_user_id


router = APIRouter(prefix="/saved-analyses", tags=["Saved Analyses"])


class SavedAnalysisUpsert(BaseModel):
    analysis: dict


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def utc_now():
    return datetime.now(timezone.utc)


def parse_json_dict(value):
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}


def serialize_saved_analysis(row: models.SavedAnalysis):
    payload = parse_json_dict(row.payload_json)
    payload.setdefault("id", row.client_analysis_id)
    payload.setdefault("addedAt", row.added_at.isoformat() if row.added_at else None)
    payload.setdefault("updatedAt", row.updated_at.isoformat() if row.updated_at else None)
    return payload


def resolve_saved_analysis(db: Session, user_id, analysis_id: str):
    row = db.query(models.SavedAnalysis).filter(
        models.SavedAnalysis.user_id == user_id,
        models.SavedAnalysis.client_analysis_id == str(analysis_id),
    ).first()
    if row:
        return row

    try:
        row_uuid = uuid.UUID(str(analysis_id))
        row = db.query(models.SavedAnalysis).filter(
            models.SavedAnalysis.user_id == user_id,
            models.SavedAnalysis.id == row_uuid,
        ).first()
        if row:
            return row
    except ValueError:
        pass

    raise HTTPException(status_code=404, detail="Saved analysis not found")


@router.get("")
def list_saved_analyses(user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    user_uuid = uuid.UUID(user_id)
    rows = (
        db.query(models.SavedAnalysis)
        .filter(models.SavedAnalysis.user_id == user_uuid)
        .order_by(models.SavedAnalysis.updated_at.desc())
        .all()
    )
    return [serialize_saved_analysis(row) for row in rows]


@router.post("")
def upsert_saved_analysis(
    data: SavedAnalysisUpsert,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    user_uuid = uuid.UUID(user_id)
    analysis = dict(data.analysis or {})
    client_analysis_id = str(analysis.get("id") or analysis.get("analysis_id") or uuid.uuid4())
    now = utc_now()

    existing = db.query(models.SavedAnalysis).filter(
        models.SavedAnalysis.user_id == user_uuid,
        models.SavedAnalysis.client_analysis_id == client_analysis_id,
    ).first()

    analysis.setdefault("id", client_analysis_id)
    analysis.setdefault("addedAt", existing.added_at.isoformat() if existing else now.isoformat())
    analysis["updatedAt"] = now.isoformat()

    title = analysis.get("title") or analysis.get("opening") or analysis.get("event")
    source_type = analysis.get("source") or analysis.get("sourceType") or analysis.get("source_type")
    source_id = str(analysis.get("sourceId") or analysis.get("source_id") or "")

    if existing:
        existing.title = title
        existing.source_type = source_type
        existing.source_id = source_id
        existing.payload_json = json.dumps(analysis)
        existing.updated_at = now
        row = existing
    else:
        row = models.SavedAnalysis(
            id=uuid.uuid4(),
            user_id=user_uuid,
            client_analysis_id=client_analysis_id,
            title=title,
            source_type=source_type,
            source_id=source_id,
            payload_json=json.dumps(analysis),
            added_at=now,
            updated_at=now,
        )
        db.add(row)

    db.commit()
    db.refresh(row)
    return serialize_saved_analysis(row)


@router.get("/{analysis_id}")
def get_saved_analysis(analysis_id: str, user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    row = resolve_saved_analysis(db, uuid.UUID(user_id), analysis_id)
    return serialize_saved_analysis(row)


@router.delete("/{analysis_id}")
def delete_saved_analysis(analysis_id: str, user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    row = resolve_saved_analysis(db, uuid.UUID(user_id), analysis_id)
    db.delete(row)
    db.commit()
    return {"deleted": True}
