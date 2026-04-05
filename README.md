# Kodezera Intelligence Suite - Backend

Enterprise multi-tenant RAG (Retrieval-Augmented Generation) platform with dynamic RBAC and secure document access control.

## Documentation

- System design index: `design/modules/README.md`
- Verified implementation status: `design/modules/VERIFIED_GAP_MATRIX_2026-03-13.md`
- Backend architecture principles: `design/backend_architecture_principles.md`
- Database schema notes: `design/database_schema.md`
- UI specification: `design/ui-spec-v2.md`

## Features

- **Multi-Tenant Architecture**: Complete data isolation per tenant
- **Dynamic RBAC**: Role-based access control with inheritance
- **Document Management**: Upload, process, and manage documents with fine-grained access control
- **RAG Pipeline**: Intelligent document search and question answering using vector embeddings
- **Async Processing**: Background document processing with Celery
- **Audit Logging**: Complete audit trail of all operations
- **Caching**: Redis-based caching for performance optimization

## Tech Stack

- **Backend**: Django 5.0 + Django REST Framework
- **Database**: PostgreSQL (SQLite for development)
- **Vector DB**: Qdrant
- **Cache/Queue**: Redis + Celery
- **AI**: OpenAI (embeddings + LLM)
- **Authentication**: JWT

## Setup

### 1. Create Virtual Environment

```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure Environment

Copy `.env.example` to `.env` and update the values:

```bash
cp .env.example .env
```

Required configurations:

- `OPENAI_API_KEY`: Your OpenAI API key
- `DATABASE_URL`: PostgreSQL connection string (optional, defaults to SQLite)
- `REDIS_URL`: Redis connection string
- `QDRANT_URL`: Qdrant server URL

### 4. Run Migrations

```bash
python manage.py migrate
```

### 5. Create Permissions

```bash
python manage.py create_permissions
```

### 6. Create Test Tenant (Optional)

```bash
python manage.py create_test_tenant
```

This creates:

- Tenant: "Demo Organization"
- Admin user: admin@demo.com / admin123
- Developer user: developer@demo.com / dev123
- Sample roles and departments

### 7. Run Development Server

```bash
python manage.py runserver
```

### 8. Start Celery Worker (Separate Terminal)

```bash
source venv/bin/activate
celery -A config worker -l info
```

### 9. Start Redis and Qdrant

**Redis:**

```bash
redis-server
```

**Qdrant (using Docker):**

```bash
docker run -p 6333:6333 qdrant/qdrant
```

## API Endpoints

### Authentication

- `POST /api/v1/auth/login/` - Login
- `POST /api/v1/auth/refresh/` - Refresh token

### Documents

- `GET /api/v1/documents/` - List accessible documents
- `POST /api/v1/documents/upload/` - Upload document
- `DELETE /api/v1/documents/{id}/` - Delete document

### Document Access

- `POST /api/v1/document-access/` - Grant access
- `DELETE /api/v1/document-access/{id}/` - Revoke access

### RAG

- `POST /api/v1/rag/query/` - Query RAG system

### Admin (Tenant Admin Only)

- `GET/POST /api/v1/roles/` - Manage roles
- `POST /api/v1/roles/{id}/assign_permissions/` - Assign permissions
- `GET/POST /api/v1/departments/` - Manage departments
- `GET/POST /api/v1/user-roles/` - Assign roles to users
- `GET /api/v1/permissions/` - List permissions

## Architecture

```
API Layer (Django REST)
    ↓
Application Services Layer
    ├── Authorization Service (Role/Permission Resolution)
    ├── Document Access Service
    └── RAG Query Service
    ↓
Domain Layer (Models + Business Rules)
    ├── Core (Tenant, User, Department, AuditLog)
    ├── RBAC (Role, Permission, UserRole, RolePermission)
    ├── Documents (Document, DocumentAccess)
    └── RAG (VectorChunk)
    ↓
Infrastructure Layer
    ├── PostgreSQL
    ├── Qdrant (Vector DB)
    ├── Redis (Cache)
    ├── Celery (Async)
    └── Object Storage
```

## Security

- All queries are filtered by tenant_id
- Vector searches require document access verification
- No hardcoded roles - all permissions are dynamic
- JWT authentication on all endpoints
- Rate limiting on RAG queries and uploads
- Complete audit logging

## Development

### Create Superuser

```bash
python manage.py createsuperuser
```

### Access Admin Panel

Navigate to `http://localhost:8000/admin/`

### Run Tests

```bash
python manage.py test
```

### Evaluate RAG Retrieval

Use the offline evaluator to track reranking quality against a labeled JSONL dataset.

```bash
python manage.py evaluate_rag_retrieval path/to/dataset.jsonl --top-k 5
```

Dataset row format:

```json
{
  "query": "mfa policy",
  "expected_document_ids": ["doc-1"],
  "candidates": [{ "document_id": "doc-1", "score": 0.72, "text": "..." }]
}
```

## Production Deployment

1. Set `DEBUG=False` in `.env`
2. Configure PostgreSQL database
3. Set secure `SECRET_KEY` and `JWT_SECRET_KEY`
4. Configure HTTPS
5. Set up proper Redis and Qdrant instances
6. Use Gunicorn as WSGI server
7. Set up Celery with supervisor or systemd

## Infrastructure & Environments

- Environment-based settings loader is enabled via `APP_ENV`.
- Supported values: `development` (default), `staging`, `production`, `testing`.
- Files:
  - `config/settings.py` (loader)
  - `config/settings_base.py`
  - `config/settings_development.py`
  - `config/settings_staging.py`
  - `config/settings_production.py`
  - `config/settings_testing.py`

### Infra Assets

- Docker runtime files:
  - `Dockerfile`
  - `docker-compose.dev.yml`
  - `docker-compose.prod.yml`
  - `nginx/nginx.conf`
- Kubernetes manifests (kustomize-based):
  - `infra/k8s/base/` (backend, celery, postgres, redis, qdrant, service, ingress, hpa)
  - `infra/k8s/overlays/dev/`
  - `infra/k8s/overlays/prod/`
  - `infra/k8s/sealed-secret.example.yaml`
  - `infra/k8s/README.md`
- CI workflow:
  - `.github/workflows/ci.yml`

## License

Proprietary - Kodezera Intelligence Suite
