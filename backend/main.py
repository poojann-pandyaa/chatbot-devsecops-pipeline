import os
from fastapi import FastAPI
from pydantic import BaseModel
from rag_service import RAGService
from ship_log import ship_to_elk
import json, datetime, uuid
import redis as redis_lib

app = FastAPI()
rag = RAGService()

r = redis_lib.Redis(host=os.getenv("REDIS_HOST", "redis-service"), port=int(os.getenv("REDIS_PORT", "6379")), decode_responses=True, socket_connect_timeout=2)
SESSION_TTL = 3600

class ChatRequest(BaseModel):
    session_id: str = None
    message: str

@app.post("/chat")
async def chat(req: ChatRequest):
    session_id = req.session_id or str(uuid.uuid4())
    key = f"session:{session_id}"
    history_raw = r.get(key)
    history = json.loads(history_raw) if history_raw else []
    result = rag.query(req.message)
    history.append({"role": "user",      "msg": req.message})
    history.append({"role": "assistant", "msg": result["answer"]})
    r.setex(key, SESSION_TTL, json.dumps(history))
    ship_to_elk({
        "session_id":     session_id,
        "message":        req.message,
        "reasoning_type": result["reasoning_type"],
        "sub_questions":  result["sub_questions"],
        "latency_ms":     result["latency_ms"],
        "sources_count":  len(result["sources"]),
        "history_length": len(history),
        "type":           "rag_chat"
    })
    return {
        "session_id": session_id,
        "answer":     result["answer"],
        "history":    history,
        "reasoning":  {
            "type":          result["reasoning_type"],
            "sub_questions": result["sub_questions"],
            "sources":       result["sources"]
        }
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

@app.get("/health")
def health():
    try:
        redis_ok = r.ping()
    except Exception:
        redis_ok = False
    return {"status": "ok", "redis": redis_ok}
