# syntax=docker/dockerfile:1
# Build context MUST be ./backend (not project root)
# e.g.: docker build -f backend/Dockerfile -t chatbot-backend:latest ./backend
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y gcc g++ && rm -rf /var/lib/apt/lists/*

# Heavy deps (torch, faiss, transformers) — only reinstalled when THIS file changes
COPY requirements-heavy.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --timeout=300 --retries=5 -r requirements-heavy.txt

# Light deps (langchain, fastapi, etc.) — reinstalled only when requirements.txt changes
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --timeout=300 --retries=5 -r requirements.txt

# Copy backend source — context must be ./backend so main.py lands at /app/main.py
COPY . .

EXPOSE 3000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3000"]
