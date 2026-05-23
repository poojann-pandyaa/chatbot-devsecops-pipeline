# Chatbot DevSecOps Pipeline

This project deploys a Next.js chatbot through a DevSecOps pipeline with Docker,
Jenkins, Ansible, Kubernetes, Trivy, SonarQube, Vault-backed secrets, and
production-oriented Kubernetes controls

## Kubernetes Production Upgrades

- Dedicated `chatbot-prod` namespace for workload isolation.
- RollingUpdate deployment with `replicas: 2`, `maxUnavailable: 0`, and
  `maxSurge: 1` for zero-downtime rollouts.
- `/api/health` liveness and readiness probes.
- Commit-pinned Docker image tags through Jenkins `IMAGE_TAG`.
- ClusterIP service behind Nginx Ingress with TLS redirect enabled.
- Pod Disruption Budget requiring at least one chatbot pod to stay available.
- HPA using CPU, memory, and the pod metric `http_requests_per_second`.
- `/api/metrics` endpoint exposing Prometheus-compatible metrics.

## Deploy

Create the TLS secret before applying the Ingress:

```bash
kubectl create namespace chatbot-prod
kubectl create secret tls chatbot-tls \
  --cert=cert.pem \
  --key=key.pem \
  -n chatbot-prod
```

The Jenkins pipeline builds and pushes both `:latest` and the short Git commit
tag, then runs Ansible as the Kubernetes deployment driver:

```bash
ansible-playbook -i ansible/inventory/hosts.ini ansible/site.yml \
  --extra-vars "image_tag=<git-sha> git_commit=<full-git-sha> namespace=chatbot-prod"
```

## Local Docker Compose (with optional Vault)

Run without Vault (Redis-only key cache):

```bash
docker compose up -d --build
```

Run with Vault profile (persistent key store + Redis cache):

```bash
cp .env.example .env
# Set VAULT_TOKEN and optionally VAULT_DEV_ROOT_TOKEN_ID in .env
docker compose --profile vault up -d --build
```

Frontend APIs use `BACKEND_URL=http://chatbot-backend:8000` in compose.

## Monitoring and Logging UIs

Start full local stack:

```bash
cp .env.example .env
# Set GRAFANA_ADMIN_PASSWORD (and optional Vault values) in .env
docker compose up -d --build
```

UI endpoints:

- Chatbot frontend: `http://localhost:3000`
- Kibana (ELK logs): `http://localhost:5601`
- Prometheus (metrics): `http://localhost:9090`
- Grafana dashboards: `http://localhost:3001` (login from `.env`)

Prometheus scrape targets included:

- Frontend metrics: `chatbot-frontend:3000/api/metrics`
- Backend metrics: `chatbot-backend:8000/metrics`
- Redis exporter: `redis-exporter:9121/metrics`

Kibana quick start:

1. Open Kibana at `http://localhost:5601`
2. Go to Discover
3. Select/create data view `filebeat-*`
4. Filter by container name fields (e.g. `container.name : "chatbot-backend"`)
