import hashlib
import json
import os
from typing import Any

import redis
from dotenv import load_dotenv

load_dotenv()

PREFIX = "newsarchiv"
DEFAULT_TTL = int(os.getenv("CACHE_TTL_SECONDS", "300"))

_client: redis.Redis | None = None
_enabled: bool | None = None


def _redis() -> redis.Redis | None:
    global _client, _enabled
    if _enabled is False:
        return None
    if _client is None:
        try:
            _client = redis.Redis.from_url(
                os.getenv("REDIS_URL", "redis://localhost:6379/0"),
                decode_responses=True,
            )
            _client.ping()
            _enabled = True
        except redis.RedisError:
            _client = None
            _enabled = False
    return _client


def is_enabled() -> bool:
    return _redis() is not None


def make_key(namespace: str, **params: Any) -> str:
    payload = json.dumps(params, sort_keys=True, default=str)
    digest = hashlib.sha256(payload.encode()).hexdigest()[:16]
    return f"{PREFIX}:{namespace}:{digest}"


def get_json(key: str) -> Any | None:
    client = _redis()
    if not client:
        return None
    try:
        raw = client.get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except (redis.RedisError, json.JSONDecodeError):
        return None


def set_json(key: str, data: Any, ttl: int = DEFAULT_TTL) -> None:
    client = _redis()
    if not client:
        return
    try:
        client.setex(key, ttl, json.dumps(data, default=str))
    except redis.RedisError:
        pass


def invalidate_all() -> int:
    client = _redis()
    if not client:
        return 0
    deleted = 0
    try:
        for key in client.scan_iter(match=f"{PREFIX}:*", count=200):
            deleted += client.delete(key)
    except redis.RedisError:
        return 0
    return deleted
