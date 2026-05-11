# Monitoring — ELK Stack

This directory contains the full ELK (Elasticsearch + Logstash + Kibana) stack with Filebeat to collect and visualise chatbot application logs.

## Architecture

```
Chatbot Container
      │  stdout/stderr logs
      ▼
  Filebeat          ← reads /var/lib/docker/containers logs
      │  Beats protocol
      ▼
  Logstash :5044    ← parses, enriches, filters
      │  HTTP
      ▼
  Elasticsearch :9200  ← stores in chatbot-logs-YYYY.MM.dd index
      │
      ▼
  Kibana :5601      ← visualise & query
```

## Start the Stack

```bash
cd monitoring
docker compose up -d
```

Wait ~60 seconds for Elasticsearch to become healthy, then:

| Service       | URL                        |
|---------------|----------------------------|
| Kibana        | http://localhost:5601       |
| Elasticsearch | http://localhost:9200       |
| Logstash      | localhost:5044 (beats port) |

## Kibana Setup (first time)

1. Open **http://localhost:5601**
2. Go to **Stack Management → Index Patterns**
3. Create index pattern: `chatbot-logs-*`
4. Select `@timestamp` as the time field
5. Go to **Discover** to see live logs

## Useful Queries in Kibana

| Query | What it shows |
|-------|---------------|
| `app: chatbot` | All chatbot logs |
| `parsed.level: error` | Error logs only |
| `parsed.method: POST` | API chat requests |
| `message: "chat"` | Chat activity |

## Stop the Stack

```bash
docker compose down
# To also remove stored data:
docker compose down -v
```

## Resource Requirements

Tuned for QEMU VM (low memory):
- Elasticsearch: 256 MB heap
- Logstash: 128 MB heap
- Total estimated usage: ~700 MB
