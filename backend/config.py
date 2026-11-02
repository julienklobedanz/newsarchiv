"""Zentrale Konfiguration aus Umgebungsvariablen.

Gelesen wird eine ``.env`` im Projektstamm oder in ``backend/`` (siehe ``.env.example``).
"""
import os
from pathlib import Path
from urllib.parse import quote_plus

from dotenv import load_dotenv

_HERE = Path(__file__).resolve().parent
load_dotenv(_HERE.parent / ".env")
load_dotenv(_HERE / ".env")


def _mongo_url() -> str:
    url = os.getenv("MONGO_URL")
    if url:
        return url
    password = os.getenv("MONGO_ROOT_PASSWORD")
    if not password:
        raise RuntimeError(
            "MONGO_URL oder MONGO_ROOT_PASSWORD fehlt. .env.example nach .env kopieren und ausfüllen."
        )
    return f"mongodb://root:{quote_plus(password)}@localhost:27017/"


MONGO_URL = _mongo_url()
MILVUS_HOST = os.getenv("MILVUS_HOST", "localhost")
MILVUS_PORT = os.getenv("MILVUS_PORT", "19530")
