import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
from database import SessionLocal
from .auth import get_current_user_id


router = APIRouter(prefix="/analysis-drafts", tags=["Analysis Drafts"])
CURRENT_DRAFT_KEY = "current"


class AnalysisDraftUpsert(BaseModel):
    draft: dict


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


def serialize_draft(row: models.AnalysisDraft):
    payload = parse_json_dict(row.payload_json)
    payload.setdefault("id", str(row.id))
    payload.setdefault("draftKey", row.draft_key)
    payload.setdefault("createdAt", row.created_at.isoformat() if row.created_at else None)
    payload.setdefault("updatedAt", row.updated_at.isoformat() if row.updated_at else None)
    return payload


def current_draft_query(db: Session, user_id):
    return db.query(models.AnalysisDraft).filter(
        models.AnalysisDraft.user_id == user_id,
        models.AnalysisDraft.draft_key == CURRENT_DRAFT_KEY,
    )


@router.get("/current")
def get_current_analysis_draft(user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    row = current_draft_query(db, uuid.UUID(user_id)).first()
    return serialize_draft(row) if row else None


@router.put("/current")
def upsert_current_analysis_draft(
    data: AnalysisDraftUpsert,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    user_uuid = uuid.UUID(user_id)
    draft = dict(data.draft or {})
    now = utc_now()
    existing = current_draft_query(db, user_uuid).first()

    draft["draftKey"] = CURRENT_DRAFT_KEY
    draft.setdefault("createdAt", existing.created_at.isoformat() if existing else now.isoformat())
    draft["updatedAt"] = now.isoformat()
    game_info = draft.get("sandboxGameInfo") if isinstance(draft.get("sandboxGameInfo"), dict) else {}
    title = draft.get("title") or draft.get("opening") or game_info.get("white")

    if existing:
        existing.title = title
        existing.payload_json = json.dumps(draft)
        existing.updated_at = now
        row = existing
    else:
        row = models.AnalysisDraft(
            id=uuid.uuid4(),
            user_id=user_uuid,
            draft_key=CURRENT_DRAFT_KEY,
            title=title,
            payload_json=json.dumps(draft),
            created_at=now,
            updated_at=now,
        )
        db.add(row)

    db.commit()
    db.refresh(row)
    return serialize_draft(row)


@router.delete("/current")
def delete_current_analysis_draft(user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    current_draft_query(db, uuid.UUID(user_id)).delete()
    db.commit()
    return {"deleted": True}
