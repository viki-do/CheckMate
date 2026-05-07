import os
import jwt
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordBearer
from fastapi.responses import RedirectResponse
from sqlalchemy import func
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from pydantic import BaseModel
from authlib.integrations.starlette_client import OAuth
import models
from database import SessionLocal

router = APIRouter(tags=["Authentication"])

# Konfigurációk (a main.py-ból ide másolva)
SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = "HS256"
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

def get_current_user_id(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("user_id")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Érvénytelen token")
        return user_id
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Lejárt vagy hibás munkamenet")

# Pydantic modellek
class UserCreate(BaseModel):
    username: str
    email: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class UserProfileUpdate(BaseModel):
    username: str | None = None
    bio: str | None = None
    about_me: str | None = None
    first_name: str | None = None
    last_name: str | None = None

# --- ÚTVONALAK ---

@router.post("/register")
def register_user(user_data: UserCreate, db: Session = Depends(get_db)):
    existing_user = db.query(models.User).filter((models.User.username == user_data.username) | (models.User.email == user_data.email)).first()
    if existing_user: raise HTTPException(status_code=400, detail="Már létezik ilyen felhasználó!")
    hashed_pwd = pwd_context.hash(user_data.password)
    new_user = models.User(username=user_data.username, email=user_data.email, password_hash=hashed_pwd)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"message": "Sikeres regisztráció!", "user_id": str(new_user.id)}

@router.post("/login")
def login(data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == data.username).first()
    if not user or not pwd_context.verify(data.password, user.password_hash): 
        raise HTTPException(status_code=401, detail="Hibás adatok!")
    token = create_access_token(data={"user_id": str(user.id), "username": user.username})
    return {"access_token": token, "token_type": "bearer", "username": user.username, "user_id": str(user.id)}

@router.get("/auth/google")
async def login_google(request: Request):
    redirect_uri = "http://localhost:8000/auth/google/callback" 
    return await oauth.google.authorize_redirect(request, redirect_uri)

@router.get("/auth/google/callback")
async def auth_google(request: Request, db: Session = Depends(get_db)):
    try:
        token = await oauth.google.authorize_access_token(request)
        user_info = token.get('userinfo') or (await oauth.google.get('https://openidconnect.googleapis.com/v1/userinfo', token=token)).json()
        email = user_info.get('email')
        user = db.query(models.User).filter(models.User.email == email).first()
        if not user:
            user = models.User(id=uuid.uuid4(), username=email.split('@')[0], email=email, provider="google")
            db.add(user)
            db.commit()
            db.refresh(user)
        jwt_token = create_access_token(data={"user_id": str(user.id), "username": user.username})
        return RedirectResponse(url=f"http://localhost:5173/login?token={jwt_token}&username={user.username}&user_id={user.id}")
    except Exception: return RedirectResponse(url="http://localhost:5173/login?error=google_auth_failed")

@router.get("/auth/github")
async def login_github(request: Request):
    return await oauth.github.authorize_redirect(request, "http://localhost:8000/auth/github/callback")

@router.get("/auth/github/callback")
async def auth_github(request: Request, db: Session = Depends(get_db)):
    try:
        token = await oauth.github.authorize_access_token(request)
        user_info = (await oauth.github.get('user', token=token)).json()
        email = user_info.get('email') or next(e['email'] for e in (await oauth.github.get('user/emails', token=token)).json() if e['primary'])
        user = db.query(models.User).filter(models.User.email == email).first()
        if not user:
            user = models.User(id=uuid.uuid4(), username=user_info.get('login'), email=email, provider="github")
            db.add(user)
            db.commit()
            db.refresh(user)
        jwt_token = create_access_token(data={"user_id": str(user.id), "username": user.username})
        return RedirectResponse(url=f"http://localhost:5173/login?token={jwt_token}&username={user.username}&user_id={user.id}")
    except Exception: return RedirectResponse(url="http://localhost:5173/login?error=github_auth_failed")

@router.get("/profile")
def get_profile(user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == uuid.UUID(user_id)).first()
    if not user: raise HTTPException(status_code=404, detail="Nem található")
    return {
        "username": user.username,
        "email": user.email,
        "provider": user.provider,
        "bio": user.bio or "",
        "about_me": user.about_me or "",
        "first_name": user.first_name or "",
        "last_name": user.last_name or "",
    }

@router.put("/profile")
def update_profile(data: UserProfileUpdate, user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == uuid.UUID(user_id)).first()
    if not user: raise HTTPException(status_code=404, detail="Nem talÃ¡lhatÃ³")

    if data.username is not None:
        next_username = data.username.strip()
        if not next_username:
            raise HTTPException(status_code=400, detail="Username is required")
        existing_user = (
            db.query(models.User)
            .filter(func.lower(models.User.username) == next_username.lower(), models.User.id != user.id)
            .first()
        )
        if existing_user:
            raise HTTPException(status_code=409, detail="Username is already taken")
        user.username = next_username[:50]
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
    return {
        "username": user.username,
        "email": user.email,
        "provider": user.provider,
        "bio": user.bio or "",
        "about_me": user.about_me or "",
        "first_name": user.first_name or "",
        "last_name": user.last_name or "",
    }
