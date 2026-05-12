import os
import json
import uuid
import datetime

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

# ---------------------------------------------------------------------------
# Model registry — add any OpenAI-compatible provider here
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
        "model":    "llama3-70b-8192",
        "api_key_env": "GROQ_API_KEY",
    },
    "mistral": {
        "base_url": "https://api.mistral.ai/v1",
        "model":    "mistral-large-latest",
        "api_key_env": "MISTRAL_API_KEY",
    },
}

DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "groq")

# ---------------------------------------------------------------------------
# Core LLM caller (OpenAI-compatible /chat/completions)
# ---------------------------------------------------------------------------

def call_llm(messages: list, provider: str = DEFAULT_MODEL, api_key_override: str = None) -> str:
    cfg = MODEL_REGISTRY.get(provider)
    if not cfg:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}. Available: {list(MODEL_REGISTRY.keys())}")

    # Use override key (from frontend) or fall back to env var
    api_key = api_key_override or os.getenv(cfg["api_key_env"])
    if not api_key:
        raise HTTPException(status_code=500, detail=f"API key not set for provider '{provider}'. Set {cfg['api_key_env']} or pass api_key in request.")

    payload = {
        "model":    cfg["model"],
        "messages": messages,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type":  "application/json",
    }

    resp = requests.post(
        f"{cfg['base_url']}/chat/completions",
        json=payload,
        headers=headers,
        timeout=60,
    )

    if not resp.ok:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    return resp.json()["choices"][0]["message"]["content"].strip()

# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class ChatRequest(BaseModel):
    session_id: Optional[str] = None
    message: str
    model: str = DEFAULT_MODEL
    api_key: Optional[str] = None  # optional per-request key override from frontend

# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.post("/chat")
async def chat(req: ChatRequest):
    session_id = req.session_id or str(uuid.uuid4())
    key = f"session:{session_id}"

    # Load history from Redis
    history_raw = r.get(key)
    history = json.loads(history_raw) if history_raw else []

    # Build messages list
    llm_messages = [{"role": e["role"], "content": e["msg"]} for e in history]
    llm_messages.append({"role": "user", "content": req.message})

    start = datetime.datetime.utcnow()
    answer = call_llm(llm_messages, provider=req.model, api_key_override=req.api_key)
    latency_ms = int((datetime.datetime.utcnow() - start).total_seconds() * 1000)

    # Persist to Redis
    history.append({"role": "user",      "msg": req.message})
    history.append({"role": "assistant", "msg": answer})
    r.setex(key, SESSION_TTL, json.dumps(history))

    return {
        "session_id": session_id,
        "answer":     answer,
        "model":      req.model,
        "history":    history,
    }


@app.get("/session/{session_id}")
async def get_session(session_id: str):
    key = f"session:{session_id}"
    data = r.get(key)
    if not data:
        return {"session_id": session_id, "history": [], "found": False}
    return {"session_id": session_id, "history": json.loads(data), "found": True}


@app.delete("/session/{session_id}")
async def clear_session(session_id: str):
    r.delete(f"session:{session_id}")
    return {"deleted": True}


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
