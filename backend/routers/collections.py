import json
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

import models
from database import SessionLocal
from .auth import get_current_user_id


router = APIRouter(prefix="/collections", tags=["Collections"])
PUBLIC_ID_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"


class CollectionCreate(BaseModel):
    name: str
    publicId: str | None = None
    privacy: str = "public"
    participants: list[str] = Field(default_factory=list)


class CollectionUpdate(BaseModel):
    name: str | None = None
    privacy: str | None = None
    participants: list[str] | None = None


class CollectionGameUpsert(BaseModel):
    game: dict


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def utc_now():
    return datetime.now(timezone.utc)


def parse_json_list(value):
    if not value:
        return []
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, list) else []
    except json.JSONDecodeError:
        return []


def parse_json_dict(value):
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}


def create_public_id(length=9):
    import secrets

    return "".join(secrets.choice(PUBLIC_ID_CHARS) for _ in range(length))


def clean_public_id(value):
    public_id = re.sub(r"[^A-Za-z0-9]", "", str(value or ""))
    return public_id[:32]


def unique_public_id(db: Session, user_id):
    while True:
        public_id = create_public_id()
        exists = db.query(models.Collection).filter(
            models.Collection.user_id == user_id,
            models.Collection.public_id == public_id,
        ).first()
        if not exists:
            return public_id


def collection_owner_name(db: Session, user_id):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    return user.username if user else ""


def serialize_game(row: models.CollectionGame):
    payload = parse_json_dict(row.payload_json)
    payload.setdefault("id", row.client_game_id)
    payload.setdefault("addedAt", row.added_at.isoformat() if row.added_at else None)
    payload.setdefault("updatedAt", row.updated_at.isoformat() if row.updated_at else None)
    return payload


def serialize_collection(collection: models.Collection, db: Session, include_games=True):
    games = []
    if include_games:
        rows = (
            db.query(models.CollectionGame)
            .filter(models.CollectionGame.collection_id == collection.id)
            .order_by(models.CollectionGame.added_at.desc())
            .all()
        )
        games = [serialize_game(row) for row in rows]

    return {
        "id": str(collection.id),
        "publicId": collection.public_id,
        "name": collection.name,
        "ownerName": collection_owner_name(db, collection.user_id),
        "privacy": collection.privacy,
        "participants": parse_json_list(collection.participants_json),
        "games": games,
        "gameCount": len(games) if include_games else (
            db.query(models.CollectionGame)
            .filter(models.CollectionGame.collection_id == collection.id)
            .count()
        ),
        "createdAt": collection.created_at.isoformat() if collection.created_at else None,
        "updatedAt": collection.updated_at.isoformat() if collection.updated_at else None,
    }


def resolve_collection(db: Session, user_id, identifier: str):
    filters = [models.Collection.user_id == user_id]
    collection = None

    try:
        collection_uuid = uuid.UUID(str(identifier))
        collection = db.query(models.Collection).filter(*filters, models.Collection.id == collection_uuid).first()
    except ValueError:
        pass

    if collection:
        return collection

    public_id = clean_public_id(identifier)
    if public_id:
        collection = db.query(models.Collection).filter(*filters, models.Collection.public_id == public_id).first()
        if collection:
            return collection

    slug_public_id = clean_public_id(str(identifier).rsplit("-", 1)[-1])
    if slug_public_id and slug_public_id != public_id:
        collection = db.query(models.Collection).filter(*filters, models.Collection.public_id == slug_public_id).first()
        if collection:
            return collection

    raise HTTPException(status_code=404, detail="Collection not found")


@router.get("")
def list_collections(user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    user_uuid = uuid.UUID(user_id)
    collections = (
        db.query(models.Collection)
        .filter(models.Collection.user_id == user_uuid)
        .order_by(models.Collection.updated_at.desc())
        .all()
    )
    return [serialize_collection(collection, db) for collection in collections]


@router.post("")
def create_collection(data: CollectionCreate, user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    user_uuid = uuid.UUID(user_id)
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Collection name is required")

    requested_public_id = clean_public_id(data.publicId)
    public_id = requested_public_id or unique_public_id(db, user_uuid)
    if requested_public_id:
        exists = db.query(models.Collection).filter(
            models.Collection.user_id == user_uuid,
            models.Collection.public_id == public_id,
        ).first()
        if exists:
            public_id = unique_public_id(db, user_uuid)

    now = utc_now()
    collection = models.Collection(
        id=uuid.uuid4(),
        user_id=user_uuid,
        public_id=public_id,
        name=name,
        privacy=data.privacy or "public",
        participants_json=json.dumps(data.participants or []),
        created_at=now,
        updated_at=now,
    )
    db.add(collection)
    db.commit()
    db.refresh(collection)
    return serialize_collection(collection, db)


@router.get("/{collection_id}")
def get_collection(collection_id: str, user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    collection = resolve_collection(db, uuid.UUID(user_id), collection_id)
    return serialize_collection(collection, db)


@router.put("/{collection_id}")
def update_collection(
    collection_id: str,
    data: CollectionUpdate,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    collection = resolve_collection(db, uuid.UUID(user_id), collection_id)
    if data.name is not None:
        name = data.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Collection name is required")
        collection.name = name
    if data.privacy is not None:
        collection.privacy = data.privacy or "public"
    if data.participants is not None:
        collection.participants_json = json.dumps(data.participants)
    collection.updated_at = utc_now()
    db.commit()
    db.refresh(collection)
    return serialize_collection(collection, db)


@router.delete("/{collection_id}")
def delete_collection(collection_id: str, user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    collection = resolve_collection(db, uuid.UUID(user_id), collection_id)
    db.query(models.CollectionGame).filter(models.CollectionGame.collection_id == collection.id).delete()
    db.delete(collection)
    db.commit()
    return {"deleted": True}


@router.post("/{collection_id}/games")
def upsert_collection_game(
    collection_id: str,
    data: CollectionGameUpsert,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    collection = resolve_collection(db, uuid.UUID(user_id), collection_id)
    game = dict(data.game or {})
    client_game_id = str(game.get("id") or game.get("game_id") or uuid.uuid4())
    now = utc_now()
    existing = db.query(models.CollectionGame).filter(
        models.CollectionGame.collection_id == collection.id,
        models.CollectionGame.client_game_id == client_game_id,
    ).first()

    game.setdefault("id", client_game_id)
    game.setdefault("addedAt", existing.added_at.isoformat() if existing else now.isoformat())
    game["updatedAt"] = now.isoformat()

    if existing:
        existing.payload_json = json.dumps(game)
        existing.source_type = game.get("sourceType") or game.get("source_type")
        existing.source_id = str(game.get("sourceId") or game.get("source_id") or "")
        existing.updated_at = now
        row = existing
    else:
        row = models.CollectionGame(
            id=uuid.uuid4(),
            collection_id=collection.id,
            client_game_id=client_game_id,
            source_type=game.get("sourceType") or game.get("source_type"),
            source_id=str(game.get("sourceId") or game.get("source_id") or ""),
            payload_json=json.dumps(game),
            added_at=now,
            updated_at=now,
        )
        db.add(row)

    collection.updated_at = now
    db.commit()
    db.refresh(collection)
    return serialize_collection(collection, db)


@router.delete("/{collection_id}/games/{game_id}")
def delete_collection_game(
    collection_id: str,
    game_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    collection = resolve_collection(db, uuid.UUID(user_id), collection_id)
    deleted = db.query(models.CollectionGame).filter(
        models.CollectionGame.collection_id == collection.id,
        models.CollectionGame.client_game_id == game_id,
    ).delete()
    if not deleted:
        raise HTTPException(status_code=404, detail="Collection game not found")
    collection.updated_at = utc_now()
    db.commit()
    return serialize_collection(collection, db)
