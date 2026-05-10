# Chatbot DevSecOps Pipeline

This project deploys a Next.js chatbot through a DevSecOps pipeline with Docker,
Jenkins, Ansible, Kubernetes, Trivy, SonarQube, Vault-backed secrets, and
production-oriented Kubernetes controls.

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
