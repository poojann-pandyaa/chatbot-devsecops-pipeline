import os
import json
import uuid
import datetime
import hashlib
import base64

import redis as redis_lib
import requests
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional

app = FastAPI()

# ---------------------------------------------------------------------------
# Redis
# ---------------------------------------------------------------------------
r = redis_lib.Redis(
    host=os.getenv("REDIS_HOST", "redis-service"),
    port=int(os.getenv("REDIS_PORT", "6379")),
    decode_responses=True,
    socket_connect_timeout=2,
)
SESSION_TTL = 3600  # 1 hour
KEY_TTL     = 86400 # 24 hours for stored API keys

# ---------------------------------------------------------------------------
# Vault config (HashiCorp Vault in dev mode inside the cluster)
# ---------------------------------------------------------------------------
VAULT_ADDR  = os.getenv("VAULT_ADDR", "http://vault.vault.svc.cluster.local:8200")
VAULT_TOKEN = os.getenv("VAULT_TOKEN", "root")

def vault_store(path: str, data: dict):
    """Store a secret in HashiCorp Vault KV v2."""
    try:
        resp = requests.post(
            f"{VAULT_ADDR}/v1/secret/data/{path}",
            headers={"X-Vault-Token": VAULT_TOKEN, "Content-Type": "application/json"},
            json={"data": data},
            timeout=5,
        )
        return resp.ok
    except Exception as e:
        print(f"[Vault] Store failed: {e}")
        return False

def vault_read(path: str) -> dict:
    """Read a secret from HashiCorp Vault KV v2."""
    try:
        resp = requests.get(
            f"{VAULT_ADDR}/v1/secret/data/{path}",
            headers={"X-Vault-Token": VAULT_TOKEN},
            timeout=5,
        )
        if resp.ok:
            return resp.json().get("data", {}).get("data", {})
    except Exception as e:
        print(f"[Vault] Read failed: {e}")
    return {}

# ---------------------------------------------------------------------------
# Simple key obfuscation for Redis storage (not full encryption, but masks
# the raw key so it's not stored in plaintext in Redis memory)
# ---------------------------------------------------------------------------
_OBFUSCATION_KEY = os.getenv("KEY_SALT", "chatbot-devsecops-2026")

def _obfuscate(value: str) -> str:
    salt = _OBFUSCATION_KEY.encode()
    return base64.b64encode(bytes(a ^ b for a, b in zip(value.encode(), salt * (len(value) // len(salt) + 1)))).decode()

def _deobfuscate(value: str) -> str:
    salt = _OBFUSCATION_KEY.encode()
    raw = base64.b64decode(value.encode())
    return bytes(a ^ b for a, b in zip(raw, salt * (len(raw) // len(salt) + 1))).decode()

# ---------------------------------------------------------------------------
# Model registry
# ---------------------------------------------------------------------------
MODEL_REGISTRY = {
    "grok": {
        "base_url": "https://api.x.ai/v1",
        "model":    "grok-3",
        "api_key_env": "GROK_API_KEY",
    },
    "openai": {
        "base_url": "https://api.openai.com/v1",
        "model":    "gpt-4o",
        "api_key_env": "OPENAI_API_KEY",
    },
    "groq": {
        "base_url": "https://api.groq.com/openai/v1",
        "model":    "llama-3.3-70b-versatile",
        "api_key_env": "GROQ_API_KEY",
    },
    "mistral": {
        "base_url": "https://api.mistral.ai/v1",
        "model":    "mistral-large-latest",
        "api_key_env": "MISTRAL_API_KEY",
    },
}

DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "grok")

# ---------------------------------------------------------------------------
# Resolve API key: user-stored (Redis) > request override > env var
# ---------------------------------------------------------------------------
def _resolve_api_key(provider: str, user_id: str = None, override: str = None) -> str:
    cfg = MODEL_REGISTRY.get(provider)
    if not cfg:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")

    # 1. Direct override from request
    if override:
        return override

    # 2. User-stored key in Redis
    if user_id:
        stored = r.hget(f"userkeys:{user_id}", provider)
        if stored:
            try:
                return _deobfuscate(stored)
            except Exception:
                pass

    # 3. Server-side env var (from K8s secret / Vault)
    env_key = os.getenv(cfg["api_key_env"])
    if env_key:
        return env_key

    raise HTTPException(
        status_code=500,
        detail=f"No API key for '{provider}'. Save one via the sidebar or set {cfg['api_key_env']}."
    )

# ---------------------------------------------------------------------------
# Core LLM caller
# ---------------------------------------------------------------------------
def call_llm(messages: list, provider: str = DEFAULT_MODEL, api_key: str = None) -> str:
    cfg = MODEL_REGISTRY.get(provider)
    if not cfg:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")

    if not api_key:
        raise HTTPException(status_code=500, detail="No API key resolved")

    payload = {"model": cfg["model"], "messages": messages}
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

    resp = requests.post(
        f"{cfg['base_url']}/chat/completions",
        json=payload, headers=headers, timeout=60,
    )

    if not resp.ok:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    return resp.json()["choices"][0]["message"]["content"].strip()

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class ChatRequest(BaseModel):
    session_id: Optional[str] = None
    message: str
    model: str = DEFAULT_MODEL
    api_key: Optional[str] = None
    user_id: Optional[str] = None

class SaveKeyRequest(BaseModel):
    user_id: str
    provider: str
    api_key: str

# ---------------------------------------------------------------------------
# Routes - Chat
# ---------------------------------------------------------------------------
@app.post("/chat")
async def chat(req: ChatRequest):
    session_id = req.session_id or str(uuid.uuid4())
    key = f"session:{session_id}"

    # Load conversation history from Redis
    history_raw = r.get(key)
    history = json.loads(history_raw) if history_raw else []

    # Build messages for LLM (include conversation context)
    llm_messages = [{"role": e["role"], "content": e["msg"]} for e in history]
    llm_messages.append({"role": "user", "content": req.message})

    # Resolve API key: user-stored > override > env
    api_key = _resolve_api_key(req.model, req.user_id, req.api_key)
    answer = call_llm(llm_messages, provider=req.model, api_key=api_key)

    # Save updated history to Redis
    history.append({"role": "user",      "msg": req.message})
    history.append({"role": "assistant", "msg": answer})
    r.setex(key, SESSION_TTL, json.dumps(history))

    return {"session_id": session_id, "answer": answer, "model": req.model, "history": history}

# ---------------------------------------------------------------------------
# Routes - API Key Management (stored in Redis + synced to Vault)
# ---------------------------------------------------------------------------
@app.post("/keys")
async def save_key(req: SaveKeyRequest):
    """Store a user's API key securely in Redis and sync to Vault."""
    if req.provider not in MODEL_REGISTRY:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {req.provider}")

    redis_key = f"userkeys:{req.user_id}"

    # Store obfuscated key in Redis with TTL
    r.hset(redis_key, req.provider, _obfuscate(req.api_key))
    r.expire(redis_key, KEY_TTL)

    # Sync to Vault for persistence
    vault_path = f"chatbot/userkeys/{req.user_id}"
    existing = vault_read(vault_path)
    existing[req.provider] = req.api_key
    vault_ok = vault_store(vault_path, existing)

    return {
        "saved": True,
        "provider": req.provider,
        "redis": True,
        "vault": vault_ok,
        "masked_key": req.api_key[:6] + "..." + req.api_key[-4:],
    }

@app.get("/keys/{user_id}")
async def get_keys(user_id: str):
    """Retrieve which providers have stored keys for this user."""
    redis_key = f"userkeys:{user_id}"
    stored = r.hgetall(redis_key)
    providers = {}
    for provider, obfuscated in stored.items():
        try:
            raw = _deobfuscate(obfuscated)
            providers[provider] = raw[:6] + "..." + raw[-4:]
        except Exception:
            providers[provider] = "***"
    return {"user_id": user_id, "providers": providers}

@app.delete("/keys/{user_id}/{provider}")
async def delete_key(user_id: str, provider: str):
    """Remove a stored API key."""
    r.hdel(f"userkeys:{user_id}", provider)
    return {"deleted": True, "provider": provider}

# ---------------------------------------------------------------------------
# Routes - Session Management
# ---------------------------------------------------------------------------
@app.get("/session/{session_id}")
async def get_session(session_id: str):
    data = r.get(f"session:{session_id}")
    if not data:
        return {"session_id": session_id, "history": [], "found": False}
    return {"session_id": session_id, "history": json.loads(data), "found": True}

@app.delete("/session/{session_id}")
async def clear_session(session_id: str):
    r.delete(f"session:{session_id}")
    return {"deleted": True}

# ---------------------------------------------------------------------------
# Routes - Observability
# ---------------------------------------------------------------------------
@app.get("/models")
async def list_models():
    return {"available": list(MODEL_REGISTRY.keys()), "default": DEFAULT_MODEL}

@app.get("/health")
def health():
    try:
        redis_ok = r.ping()
    except Exception:
        redis_ok = False
    return {"status": "ok", "redis": redis_ok}

@app.get("/redis/stats")
def redis_stats():
    """Inspect Redis state: session count, stored keys, memory usage."""
    try:
        info = r.info("memory")
        all_keys = r.keys("*")
        sessions = [k for k in all_keys if k.startswith("session:")]
        user_keys = [k for k in all_keys if k.startswith("userkeys:")]

        session_details = []
        for sk in sessions[:10]:  # Show up to 10 sessions
            ttl = r.ttl(sk)
            data = r.get(sk)
            msg_count = len(json.loads(data)) if data else 0
            session_details.append({
                "key": sk,
                "messages": msg_count,
                "ttl_seconds": ttl,
            })

        return {
            "total_keys": len(all_keys),
            "active_sessions": len(sessions),
            "stored_user_keys": len(user_keys),
            "memory_used": info.get("used_memory_human", "?"),
            "sessions": session_details,
        }
    except Exception as e:
        return {"error": str(e)}
