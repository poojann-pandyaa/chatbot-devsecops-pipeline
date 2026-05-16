"""
Backend Unit Tests for Chatbot DevSecOps Pipeline.

Tests cover:
  - Health endpoint
  - Model listing
  - Session lifecycle (create, retrieve, delete)
  - Key management (save, list, delete)
  - Redis stats endpoint
  - Input validation
"""
import os
import sys
import uuid
import pytest

# ── Ensure the backend package is importable ──────────────────────────────────
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

# Mock Redis before importing app so it doesn't try to connect
mock_redis = MagicMock()
mock_redis.ping.return_value = True
mock_redis.get.return_value = None
mock_redis.keys.return_value = []
mock_redis.hgetall.return_value = {}
mock_redis.info.return_value = {"used_memory_human": "1M"}
mock_redis.zrevrange.return_value = []

with patch("redis.Redis", return_value=mock_redis):
    from main import app

client = TestClient(app)


# ═══════════════════════════════════════════════════════════════════════════════
# Health & Info
# ═══════════════════════════════════════════════════════════════════════════════

class TestHealth:
    """Tests for the /health endpoint."""

    def test_health_returns_200(self):
        response = client.get("/health")
        assert response.status_code == 200

    def test_health_response_structure(self):
        response = client.get("/health")
        data = response.json()
        assert "status" in data
        assert "redis" in data
        assert data["status"] == "ok"


class TestModels:
    """Tests for the /models endpoint."""

    def test_models_returns_200(self):
        response = client.get("/models")
        assert response.status_code == 200

    def test_models_lists_available(self):
        data = client.get("/models").json()
        assert "available" in data
        assert "default" in data
        assert isinstance(data["available"], list)
        assert len(data["available"]) > 0

    def test_models_contains_known_providers(self):
        models = client.get("/models").json()["available"]
        for expected in ["grok", "groq", "openai", "mistral"]:
            assert expected in models, f"Missing provider: {expected}"


# ═══════════════════════════════════════════════════════════════════════════════
# Session Management
# ═══════════════════════════════════════════════════════════════════════════════

class TestSession:
    """Tests for session CRUD endpoints."""

    def test_get_empty_session(self):
        """Retrieving a non-existent session should return found=False."""
        fake_id = str(uuid.uuid4())
        response = client.get(f"/session/{fake_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["found"] is False
        assert data["history"] == []

    def test_delete_session(self):
        """Deleting a session should return deleted=True."""
        fake_id = str(uuid.uuid4())
        response = client.delete(f"/session/{fake_id}")
        assert response.status_code == 200
        assert response.json()["deleted"] is True

    def test_list_sessions_empty(self):
        """Listing sessions for unknown user should return empty list."""
        response = client.get("/sessions/unknown-user-xyz")
        assert response.status_code == 200
        data = response.json()
        assert data["sessions"] == []


# ═══════════════════════════════════════════════════════════════════════════════
# API Key Management
# ═══════════════════════════════════════════════════════════════════════════════

class TestKeyManagement:
    """Tests for key save/list/delete endpoints."""

    def test_save_key_invalid_provider(self):
        """Saving a key for an unknown provider should return 400."""
        response = client.post("/keys", json={
            "user_id": "test-user",
            "provider": "invalid-provider",
            "api_key": "sk-test-12345"
        })
        assert response.status_code == 400

    @patch("main.vault_store", return_value=True)
    @patch("main.vault_read", return_value={})
    def test_save_key_valid_provider(self, mock_read, mock_store):
        """Saving a key for a valid provider should succeed."""
        response = client.post("/keys", json={
            "user_id": "test-user",
            "provider": "groq",
            "api_key": "sk-test-key-1234567890"
        })
        assert response.status_code == 200
        data = response.json()
        assert data["saved"] is True
        assert data["provider"] == "groq"
        assert "masked_key" in data

    def test_get_keys_returns_structure(self):
        """GET /keys/{user_id} should return correct structure."""
        response = client.get("/keys/test-user")
        assert response.status_code == 200
        data = response.json()
        assert "user_id" in data
        assert "providers" in data

    @patch("main.vault_store", return_value=True)
    @patch("main.vault_read", return_value={})
    def test_delete_key(self, mock_read, mock_store):
        """Deleting a key should return deleted=True."""
        response = client.delete("/keys/test-user/groq")
        assert response.status_code == 200
        assert response.json()["deleted"] is True


# ═══════════════════════════════════════════════════════════════════════════════
# Chat Endpoint Validation
# ═══════════════════════════════════════════════════════════════════════════════

class TestChatValidation:
    """Tests for /chat input validation."""

    def test_chat_missing_message(self):
        """POST /chat without a message should return 422 validation error."""
        response = client.post("/chat", json={})
        assert response.status_code == 422

    def test_chat_invalid_model(self):
        """POST /chat with an invalid model should return an error."""
        response = client.post("/chat", json={
            "message": "hello",
            "model": "nonexistent-model"
        })
        # Should fail with 400 or 500 because model is unknown
        assert response.status_code in [400, 500]


# ═══════════════════════════════════════════════════════════════════════════════
# Redis Stats
# ═══════════════════════════════════════════════════════════════════════════════

class TestRedisStats:
    """Tests for /redis/stats endpoint."""

    def test_redis_stats_returns_200(self):
        response = client.get("/redis/stats")
        assert response.status_code == 200

    def test_redis_stats_structure(self):
        data = client.get("/redis/stats").json()
        assert "total_keys" in data
        assert "active_sessions" in data
        assert "memory_used" in data


# ═══════════════════════════════════════════════════════════════════════════════
# Metrics
# ═══════════════════════════════════════════════════════════════════════════════

class TestMetrics:
    """Tests for Prometheus /metrics endpoint."""

    def test_metrics_returns_200(self):
        response = client.get("/metrics")
        assert response.status_code == 200

    def test_metrics_contains_prometheus_format(self):
        response = client.get("/metrics")
        text = response.text
        assert "backend_http_requests_total" in text
