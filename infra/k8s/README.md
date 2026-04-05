# Kubernetes Deployment

This folder contains a production-oriented Kubernetes layout for Kodezera.

## Structure

- `base/`: shared resources for all environments
  - backend, celery workers, celery beat
  - postgres, redis, qdrant as first-class workloads
  - service, ingress, and backend HPA
- `overlays/dev/`: local or staging-like lightweight settings
- `overlays/prod/`: production scaling defaults

## Apply

Use one overlay at a time:

```bash
kubectl apply -k infra/k8s/overlays/dev
# or
kubectl apply -k infra/k8s/overlays/prod
```

## Secrets

Create `kodezera-secrets` in namespace `kodezera` before applying workloads.
A SealedSecret example template is provided in `sealed-secret.example.yaml`.

Expected keys include:

- `SECRET_KEY`
- `JWT_SECRET_KEY`
- `DATABASE_URL`
- `POSTGRES_PASSWORD`
- `OPENAI_API_KEY` (optional if using local providers)

## Notes

- Ingress host defaults:
  - dev: `kodezera.local`
  - prod: `kodezera.example.com`
- Update image tags in overlay `kustomization.yaml` before deployment.
