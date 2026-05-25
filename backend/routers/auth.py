import os
import jwt
import uuid
import re
import hashlib
import secrets
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.security import OAuth2PasswordBearer
from fastapi.responses import RedirectResponse
from sqlalchemy import func
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from pydantic import BaseModel
from authlib.integrations.starlette_client import OAuth
from urllib.parse import urlencode
import models
from database import SessionLocal

router = APIRouter(tags=["Authentication"])
BACKEND_ROOT = os.path.dirname(os.path.dirname(__file__))
AVATAR_DIR = os.path.join(BACKEND_ROOT, "uploads", "avatars")
ALLOWED_AVATAR_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
}

# Konfigurációk (a main.py-ból ide másolva)
SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = "HS256"
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
DEMO_ADMIN_SECRET = os.getenv("DEMO_ADMIN_SECRET", "")
REQUIRE_DEMO_TOKEN_FOR_REGISTRATION = os.getenv("REQUIRE_DEMO_TOKEN_FOR_REGISTRATION", "false").lower() == "true"
pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

# OAuth regisztráció
oauth = OAuth()
oauth.register(
    name='google',
    client_id=os.getenv("GOOGLE_CLIENT_ID"),
    client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={'scope': 'openid email profile'}
)
oauth.register(
    name='github',
    client_id=os.getenv("GITHUB_CLIENT_ID"),
    client_secret=os.getenv("GITHUB_CLIENT_SECRET"),
    access_token_url='https://github.com/login/oauth/access_token',
    authorize_url='https://github.com/login/oauth/authorize',
    api_base_url='https://api.github.com/',
    client_kwargs={'scope': 'user:email'},
)
oauth.register(
    name='facebook',
    client_id=os.getenv("FACEBOOK_CLIENT_ID"),
    client_secret=os.getenv("FACEBOOK_CLIENT_SECRET"),
    access_token_url='https://graph.facebook.com/v19.0/oauth/access_token',
    authorize_url='https://www.facebook.com/v19.0/dialog/oauth',
    api_base_url='https://graph.facebook.com/v19.0/',
    client_kwargs={'scope': 'email public_profile'},
)

# Segédfüggvények
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def create_access_token(data: dict):
    to_encode = data.copy()
    to_encode.update({"iat": datetime.now(timezone.utc)})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def utc_now():
    return datetime.now(timezone.utc)

def normalize_db_datetime(value):
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value

def token_hash(token: str):
    return hashlib.sha256(str(token).encode("utf-8")).hexdigest()

def get_current_user_id(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("user_id")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = db.query(models.User).filter(models.User.id == uuid.UUID(user_id)).first()
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        demo_expires_at = normalize_db_datetime(user.demo_expires_at)
        if user.is_demo and demo_expires_at and utc_now() >= demo_expires_at:
            raise HTTPException(status_code=403, detail="Demo mode has expired")
        return user_id
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Session expired or invalid")

# Pydantic modellek
class UserCreate(BaseModel):
    username: str
    email: str
    password: str
    demo_token: str | None = None

class UserLogin(BaseModel):
    username: str
    password: str

class DemoAccessCreate(BaseModel):
    hours: int = 24

class DemoCleanupResult(BaseModel):
    deleted_users: int
    deleted_games: int
    deleted_demo_accesses: int

class UserProfileUpdate(BaseModel):
    bio: str | None = None
    about_me: str | None = None
    first_name: str | None = None
    last_name: str | None = None

class UsernameChangeRequest(BaseModel):
    username: str
    password: str

class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str

def is_valid_username(value: str):
    username = value.strip()
    return (
        bool(re.search(r"[A-Za-z]", username)) and
        bool(re.match(r"^[A-Za-z0-9]", username)) and
        3 <= len(username) <= 25 and
        bool(re.match(r"^[A-Za-z0-9_-]+$", username)) and
        not bool(re.search(r"[-_](?![A-Za-z0-9])", username))
    )

def password_meets_requirements(value: str):
    password = value or ""
    return len(password) >= 8 and bool(re.search(r"[A-Z]", password)) and bool(re.search(r"[0-9]", password))


PASSWORD_REQUIREMENTS_MESSAGE = "Password must be at least 8 characters and include one capital letter and one number"


def profile_payload(user: models.User):
    return {
        "username": user.username,
        "email": user.email,
        "provider": user.provider,
        "bio": user.bio or "",
        "about_me": user.about_me or "",
        "first_name": user.first_name or "",
        "last_name": user.last_name or "",
        "avatar_url": user.avatar_url or "",
        "is_demo": bool(user.is_demo),
        "demo_expires_at": user.demo_expires_at,
        "created_at": user.created_at,
    }

def find_valid_demo_access(db: Session, raw_token: str):
    access = db.query(models.DemoAccess).filter(models.DemoAccess.token_hash == token_hash(raw_token)).first()
    if not access:
        raise HTTPException(status_code=404, detail="Demo link not found")
    if access.revoked_at:
        raise HTTPException(status_code=403, detail="Demo link has been revoked")
    if access.consumed_at:
        raise HTTPException(status_code=403, detail="Demo link has already been used")
    if utc_now() >= normalize_db_datetime(access.expires_at):
        raise HTTPException(status_code=403, detail="Demo link has expired")
    return access

def login_payload(user: models.User):
    token_data = {
        "user_id": str(user.id),
        "username": user.username,
        "mode": "demo" if user.is_demo else "user",
    }
    if user.is_demo and user.demo_expires_at:
        token_data["demo_expires_at"] = normalize_db_datetime(user.demo_expires_at).isoformat()
    token = create_access_token(data=token_data)
    return {
        "access_token": token,
        "token_type": "bearer",
        "username": user.username,
        "user_id": str(user.id),
        "mode": "demo" if user.is_demo else "user",
        "demo_expires_at": normalize_db_datetime(user.demo_expires_at).isoformat() if user.is_demo and user.demo_expires_at else None,
    }

def require_demo_admin_secret(request: Request):
    provided_secret = request.headers.get("x-demo-admin-secret", "")
    if not DEMO_ADMIN_SECRET or not secrets.compare_digest(provided_secret, DEMO_ADMIN_SECRET):
        raise HTTPException(status_code=401, detail="Invalid demo admin secret")

def delete_expired_demo_user_data(db: Session):
    now = utc_now()
    expired_users = db.query(models.User).filter(
        models.User.is_demo == True,
        models.User.demo_expires_at != None,
        models.User.demo_expires_at <= now,
    ).all()
    expired_user_ids = [user.id for user in expired_users]
    if not expired_user_ids:
        return {"deleted_users": 0, "deleted_games": 0, "deleted_demo_accesses": 0}

    db.query(models.AnalysisDraft).filter(models.AnalysisDraft.user_id.in_(expired_user_ids)).delete(synchronize_session=False)
    db.query(models.SavedAnalysis).filter(models.SavedAnalysis.user_id.in_(expired_user_ids)).delete(synchronize_session=False)
    collection_ids = [
        row[0]
        for row in db.query(models.Collection.id).filter(models.Collection.user_id.in_(expired_user_ids)).all()
    ]
    if collection_ids:
        db.query(models.CollectionGame).filter(models.CollectionGame.collection_id.in_(collection_ids)).delete(synchronize_session=False)
        db.query(models.Collection).filter(models.Collection.id.in_(collection_ids)).delete(synchronize_session=False)

    game_ids = [
        row[0]
        for row in db.query(models.Game.id).filter(
            (models.Game.white_player_id.in_(expired_user_ids)) | (models.Game.black_player_id.in_(expired_user_ids))
        ).all()
    ]
    if game_ids:
        db.query(models.Move).filter(models.Move.game_id.in_(game_ids)).delete(synchronize_session=False)
        db.query(models.Game).filter(models.Game.id.in_(game_ids)).delete(synchronize_session=False)

    demo_access_count = db.query(models.DemoAccess).filter(models.DemoAccess.user_id.in_(expired_user_ids)).delete(synchronize_session=False)
    user_count = db.query(models.User).filter(models.User.id.in_(expired_user_ids)).delete(synchronize_session=False)
    db.commit()
    return {
        "deleted_users": user_count,
        "deleted_games": len(game_ids),
        "deleted_demo_accesses": demo_access_count,
    }

def delete_avatar_file(avatar_url: str | None):
    if not avatar_url or not avatar_url.startswith("/uploads/avatars/"):
        return
    filename = os.path.basename(avatar_url)
    path = os.path.abspath(os.path.join(AVATAR_DIR, filename))
    avatars_root = os.path.abspath(AVATAR_DIR)
    if path.startswith(avatars_root) and os.path.exists(path):
        os.remove(path)

def frontend_login_redirect(token: str, user: models.User):
    query = urlencode({
        "token": token,
        "username": user.username,
        "user_id": str(user.id),
        "mode": "demo" if user.is_demo else "user",
    })
    return RedirectResponse(url=f"{FRONTEND_URL}/login?{query}")

def frontend_auth_error(provider: str):
    return RedirectResponse(url=f"{FRONTEND_URL}/login?error={provider}_auth_failed")

def clean_oauth_username(value: str):
    username = re.sub(r"[^A-Za-z0-9_-]+", "", value or "").strip("_-")
    if not username or not re.search(r"[A-Za-z]", username):
        username = "player"
    return username[:25]

def unique_oauth_username(db: Session, preferred: str):
    base = clean_oauth_username(preferred)
    candidate = base
    suffix = 1
    while db.query(models.User).filter(func.lower(models.User.username) == candidate.lower()).first():
        suffix += 1
        candidate = f"{base[: max(1, 25 - len(str(suffix)) - 1)]}-{suffix}"
    return candidate

def get_or_create_oauth_user(db: Session, email: str, username_seed: str, provider: str):
    if not email:
        raise ValueError("OAuth provider did not return an email address")

    user = db.query(models.User).filter(models.User.email == email).first()
    if user:
        return user

    user = models.User(
        id=uuid.uuid4(),
        username=unique_oauth_username(db, username_seed or email.split("@")[0]),
        email=email,
        provider=provider,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

# --- ÚTVONALAK ---

@router.post("/register")
def register_user(user_data: UserCreate, db: Session = Depends(get_db)):
    demo_access = None
    if user_data.demo_token:
        demo_access = find_valid_demo_access(db, user_data.demo_token)
    elif REQUIRE_DEMO_TOKEN_FOR_REGISTRATION:
        raise HTTPException(status_code=403, detail="Demo link is required")

    if not password_meets_requirements(user_data.password):
        raise HTTPException(status_code=400, detail=PASSWORD_REQUIREMENTS_MESSAGE)
    existing_user = db.query(models.User).filter((models.User.username == user_data.username) | (models.User.email == user_data.email)).first()
    if existing_user: raise HTTPException(status_code=400, detail="A user with this username or email already exists.")
    hashed_pwd = pwd_context.hash(user_data.password)
    new_user = models.User(
        id=uuid.uuid4(),
        username=user_data.username,
        email=user_data.email,
        password_hash=hashed_pwd,
        is_demo=bool(demo_access),
        demo_expires_at=utc_now() + timedelta(hours=demo_access.duration_hours or 24) if demo_access else None,
    )
    db.add(new_user)
    if demo_access:
        demo_access.user_id = new_user.id
        demo_access.consumed_at = utc_now()
    db.commit()
    db.refresh(new_user)
    return {"message": "Registration successful.", "user_id": str(new_user.id)}

@router.post("/login")
def login(data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == data.username).first()
    if not user or not pwd_context.verify(data.password, user.password_hash): 
        raise HTTPException(status_code=401, detail="Invalid credentials")
    demo_expires_at = normalize_db_datetime(user.demo_expires_at)
    if user.is_demo and demo_expires_at and utc_now() >= demo_expires_at:
        raise HTTPException(status_code=403, detail="Demo mode has expired")
    return login_payload(user)

@router.get("/demo-access/{demo_token}")
def check_demo_access(demo_token: str, db: Session = Depends(get_db)):
    access = find_valid_demo_access(db, demo_token)
    return {"valid": True, "expires_at": normalize_db_datetime(access.expires_at).isoformat()}

@router.post("/demo-access")
def create_demo_access(data: DemoAccessCreate, request: Request, db: Session = Depends(get_db)):
    require_demo_admin_secret(request)
    hours = max(1, min(int(data.hours or 24), 24 * 14))
    raw_token = secrets.token_urlsafe(32)
    now = utc_now()
    access = models.DemoAccess(
        id=uuid.uuid4(),
        token_hash=token_hash(raw_token),
        duration_hours=hours,
        expires_at=now + timedelta(hours=hours),
        created_at=now,
    )
    db.add(access)
    db.commit()
    db.refresh(access)
    return {
        "token": raw_token,
        "url": f"{FRONTEND_URL}/demo/{raw_token}",
        "expires_at": normalize_db_datetime(access.expires_at).isoformat(),
    }

@router.post("/demo-access/cleanup-expired", response_model=DemoCleanupResult)
def cleanup_expired_demo_accesses(request: Request, db: Session = Depends(get_db)):
    require_demo_admin_secret(request)
    return delete_expired_demo_user_data(db)

@router.get("/auth/google")
async def login_google(request: Request):
    if REQUIRE_DEMO_TOKEN_FOR_REGISTRATION:
        raise HTTPException(status_code=403, detail="Demo link is required")
    redirect_uri = f"{BACKEND_URL}/auth/google/callback"
    return await oauth.google.authorize_redirect(request, redirect_uri)

@router.get("/auth/google/callback")
async def auth_google(request: Request, db: Session = Depends(get_db)):
    try:
        token = await oauth.google.authorize_access_token(request)
        user_info = token.get('userinfo') or (await oauth.google.get('https://openidconnect.googleapis.com/v1/userinfo', token=token)).json()
        email = user_info.get('email')
        user = get_or_create_oauth_user(db, email, user_info.get("name") or email.split("@")[0], "google")
        jwt_token = create_access_token(data={"user_id": str(user.id), "username": user.username})
        return frontend_login_redirect(jwt_token, user)
    except Exception:
        return frontend_auth_error("google")

@router.get("/auth/github")
async def login_github(request: Request):
    if REQUIRE_DEMO_TOKEN_FOR_REGISTRATION:
        raise HTTPException(status_code=403, detail="Demo link is required")
    return await oauth.github.authorize_redirect(request, f"{BACKEND_URL}/auth/github/callback")

@router.get("/auth/github/callback")
async def auth_github(request: Request, db: Session = Depends(get_db)):
    try:
        token = await oauth.github.authorize_access_token(request)
        user_info = (await oauth.github.get('user', token=token)).json()
        email = user_info.get('email') or next(e['email'] for e in (await oauth.github.get('user/emails', token=token)).json() if e['primary'])
        user = get_or_create_oauth_user(db, email, user_info.get('login'), "github")
        jwt_token = create_access_token(data={"user_id": str(user.id), "username": user.username})
        return frontend_login_redirect(jwt_token, user)
    except Exception:
        return frontend_auth_error("github")

@router.get("/auth/facebook")
async def login_facebook(request: Request):
    if REQUIRE_DEMO_TOKEN_FOR_REGISTRATION:
        raise HTTPException(status_code=403, detail="Demo link is required")
    return await oauth.facebook.authorize_redirect(request, f"{BACKEND_URL}/auth/facebook/callback")

@router.get("/auth/facebook/callback")
async def auth_facebook(request: Request, db: Session = Depends(get_db)):
    try:
        token = await oauth.facebook.authorize_access_token(request)
        user_info = (await oauth.facebook.get("me?fields=id,name,email", token=token)).json()
        email = user_info.get("email") or f"facebook-{user_info.get('id')}@facebook.local"
        user = get_or_create_oauth_user(db, email, user_info.get("name"), "facebook")
        jwt_token = create_access_token(data={"user_id": str(user.id), "username": user.username})
        return frontend_login_redirect(jwt_token, user)
    except Exception:
        return frontend_auth_error("facebook")

@router.get("/profile")
def get_profile(user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == uuid.UUID(user_id)).first()
    if not user: raise HTTPException(status_code=404, detail="Not found")
    return profile_payload(user)

@router.put("/profile")
def update_profile(data: UserProfileUpdate, user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == uuid.UUID(user_id)).first()
    if not user: raise HTTPException(status_code=404, detail="Not found")

    if data.bio is not None:
        user.bio = data.bio[:50]
    if data.about_me is not None:
        user.about_me = data.about_me
    if data.first_name is not None:
        user.first_name = data.first_name.strip()[:100]
    if data.last_name is not None:
        user.last_name = data.last_name.strip()[:100]

    db.commit()
    db.refresh(user)
    return profile_payload(user)

@router.post("/profile/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    user = db.query(models.User).filter(models.User.id == uuid.UUID(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="Not found")

    extension = ALLOWED_AVATAR_TYPES.get(file.content_type)
    if not extension:
        raise HTTPException(status_code=400, detail="Only JPG, PNG, GIF, and WebP images are supported")

    contents = await file.read()
    if len(contents) > 3 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Avatar image must be 3 MB or smaller")

    os.makedirs(AVATAR_DIR, exist_ok=True)
    delete_avatar_file(user.avatar_url)
    filename = f"{user.id}-{uuid.uuid4().hex}{extension}"
    path = os.path.join(AVATAR_DIR, filename)
    with open(path, "wb") as avatar_file:
        avatar_file.write(contents)

    user.avatar_url = f"/uploads/avatars/{filename}"
    db.commit()
    db.refresh(user)
    return profile_payload(user)

@router.delete("/profile/avatar")
def delete_avatar(user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == uuid.UUID(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="Not found")

    delete_avatar_file(user.avatar_url)
    user.avatar_url = None
    db.commit()
    db.refresh(user)
    return profile_payload(user)

@router.put("/profile/username")
def change_username(data: UsernameChangeRequest, user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == uuid.UUID(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="Not found")

    if not user.password_hash or not pwd_context.verify(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect password")

    next_username = data.username.strip()
    if not next_username:
        raise HTTPException(status_code=400, detail="Username is required")
    if not is_valid_username(next_username):
        raise HTTPException(status_code=400, detail="Username does not meet the requirements")
    if next_username.lower() == user.username.lower():
        raise HTTPException(status_code=409, detail="This is your current username")

    existing_user = (
        db.query(models.User)
        .filter(func.lower(models.User.username) == next_username.lower(), models.User.id != user.id)
        .first()
    )
    if existing_user:
        raise HTTPException(status_code=409, detail="Username is already taken")

    user.username = next_username[:50]
    db.commit()
    db.refresh(user)
    return {"username": user.username}

@router.get("/profile/username/check")
def check_username_availability(
    username: str = Query(..., min_length=1),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    user = db.query(models.User).filter(models.User.id == uuid.UUID(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="Not found")

    next_username = username.strip()
    if not next_username:
        return {"available": False, "reason": "invalid"}
    if not is_valid_username(next_username):
        return {"available": False, "reason": "invalid"}
    if next_username.lower() == user.username.lower():
        return {"available": False, "reason": "current"}

    existing_user = (
        db.query(models.User)
        .filter(func.lower(models.User.username) == next_username.lower(), models.User.id != user.id)
        .first()
    )
    if existing_user:
        return {"available": False, "reason": "taken"}

    return {"available": True, "reason": None}

@router.put("/profile/password")
def change_password(data: PasswordChangeRequest, user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == uuid.UUID(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="Not found")

    if not user.password_hash:
        raise HTTPException(status_code=400, detail="Password changes are unavailable for this account")
    if not pwd_context.verify(data.current_password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect current password")

    next_password = data.new_password or ""
    if not password_meets_requirements(next_password):
        raise HTTPException(status_code=400, detail=PASSWORD_REQUIREMENTS_MESSAGE)
    if next_password == data.current_password:
        raise HTTPException(status_code=400, detail="New password must be different")

    user.password_hash = pwd_context.hash(next_password)
    db.commit()
    return {"message": "Password updated"}
