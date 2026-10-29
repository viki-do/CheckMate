import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

# Betöltjük a környezeti változókat a .env fájlból
load_dotenv()

# Kiolvassuk a DATABASE_URL-t (ha nem találja, None-t ad vissza)
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")

if not SQLALCHEMY_DATABASE_URL:
    raise ValueError("Hiba: DATABASE_URL nincs beállítva a .env fájlban!")

# Bármilyen Postgres URL-t a telepített psycopg2 driverre irányítunk
for prefix in ("postgres://", "postgresql+psycopg://", "postgresql://"):
    if SQLALCHEMY_DATABASE_URL.startswith(prefix):
        SQLALCHEMY_DATABASE_URL = "postgresql+psycopg2://" + SQLALCHEMY_DATABASE_URL[len(prefix):]
        break

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()