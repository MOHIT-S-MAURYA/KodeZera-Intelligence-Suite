# Appendix A: Glossary & Acronyms

---

| Term | Definition |
|------|-----------|
| **ABAC** | Attribute-Based Access Control — authorisation model where access decisions are made based on attributes of the subject, resource, action, and environment |
| **ANN** | Approximate Nearest Neighbour — a family of algorithms for finding the closest vectors in high-dimensional spaces without exhaustive search |
| **API** | Application Programming Interface — the set of HTTP endpoints exposed by the backend for client consumption |
| **Bearer Token** | An authentication scheme where the client passes a JWT in the `Authorization: Bearer <token>` HTTP header |
| **Celery** | A distributed task queue for Python, used for asynchronous document processing and background jobs |
| **Chunk** | A fixed-size segment of document text (measured in tokens) that is individually embedded and stored as a vector |
| **Classification Level** | A numeric security classification (0–5) assigned to documents, determining the minimum clearance required to access them |
| **Clearance Level** | A numeric security clearance (0–5) assigned to users, determining the maximum classification of documents they may access |
| **Closure Table** | A database pattern for representing hierarchical (tree) data, storing all ancestor-descendant pairs with depth for O(1) queries |
| **CORS** | Cross-Origin Resource Sharing — HTTP headers that allow a web page to make requests to a different domain than the one serving the page |
| **DRF** | Django REST Framework — a toolkit for building RESTful APIs in Django |
| **Embedding** | A fixed-dimensional dense vector representation of text, produced by a neural network encoder (e.g., SentenceTransformers) |
| **ERD** | Entity-Relationship Diagram — a visual representation of database entities and their relationships |
| **Fan-Out** | The process of replicating a source event (e.g., notification) into per-recipient records for fast inbox queries |
| **Grounding Score** | A metric measuring the lexical overlap between an LLM-generated answer and the retrieved source chunks, used to detect hallucination |
| **HPA** | Horizontal Pod Autoscaler — a Kubernetes resource that automatically scales the number of pod replicas based on CPU/memory utilisation |
| **HSTS** | HTTP Strict Transport Security — a web security policy mechanism that forces browsers to interact only via HTTPS |
| **JWT** | JSON Web Token — a compact, URL-safe token format for representing claims between two parties, used for stateless authentication |
| **LLM** | Large Language Model — a neural network trained on large text corpora to generate human-like text (e.g., GPT-4, Claude, Llama) |
| **MFA** | Multi-Factor Authentication — requiring two or more verification factors (password + OTP) for authentication |
| **Modular Monolith** | An architectural pattern where the application is a single deployable unit but internally organised into strictly bounded modules |
| **Multi-Tenancy** | An architecture where a single instance serves multiple isolated organisations (tenants) sharing the same infrastructure |
| **NLP** | Natural Language Processing — the field of AI concerned with interactions between computers and human language |
| **ORM** | Object-Relational Mapping — a technique that maps database tables to programming language objects (Django's ORM) |
| **OTP** | One-Time Password — a password valid for a single authentication session (TOTP = Time-based OTP) |
| **PgBouncer** | A lightweight connection pooler for PostgreSQL that reduces database connection overhead |
| **Platform Owner** | The SaaS operator who manages the entire Kodezera platform, distinct from individual tenant administrators |
| **Qdrant** | An open-source vector database optimised for Approximate Nearest Neighbour search with filtering support |
| **RAG** | Retrieval-Augmented Generation — a technique that combines document retrieval with LLM generation to produce grounded, sourced answers |
| **RBAC** | Role-Based Access Control — an access control model where permissions are assigned to roles, and roles are assigned to users |
| **Re-ranking** | A second-pass scoring stage that refines the initial retrieval results using additional signals (e.g., lexical overlap) |
| **SaaS** | Software as a Service — a software distribution model where applications are hosted centrally and accessed via the internet |
| **Semantic Search** | Information retrieval based on meaning rather than keyword matching, typically using dense vector similarity |
| **SentenceTransformers** | A Python library for generating sentence-level embeddings using fine-tuned BERT-family models |
| **SSE** | Server-Sent Events — a standard allowing a server to push real-time updates to a web client over a single HTTP connection |
| **Tenant** | An isolated organisational unit within the multi-tenant platform; each tenant has its own users, roles, documents, and data |
| **Token** | In the context of LLMs, a subword unit (~4 characters in English) used for text processing and billing |
| **TOTP** | Time-based One-Time Password — a 6-digit code generated by an authenticator app (e.g., Google Authenticator) that changes every 30 seconds |
| **Vector** | A numerical array representing the semantic meaning of text in high-dimensional space (e.g., 384 dimensions for MiniLM) |
| **Vector Database** | A specialised database optimised for storing, indexing, and querying high-dimensional vectors (e.g., Qdrant, Pinecone, Weaviate) |
| **WSGI** | Web Server Gateway Interface — the Python standard for communication between web servers and web applications |
| **Zero-Trust** | A security model that assumes no implicit trust; every request is fully authenticated and authorised regardless of origin |

---

# Appendix B: Environment Configuration Reference

---

## B.1 Core Configuration Variables

| Variable | Default | Required | Description |
|----------|---------|:--------:|-------------|
| `SECRET_KEY` | *insecure-dev-key* | ✓ (prod) | Django secret key for cryptographic signing |
| `DEBUG` | `True` | | Enable debug mode (MUST be `False` in production) |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1` | ✓ (prod) | Comma-separated list of allowed host headers |
| `DATABASE_URL` | `sqlite:///db.sqlite3` | ✓ (prod) | PostgreSQL connection URL |
| `REDIS_URL` | `redis://localhost:6379/0` | | Redis connection for caching |
| `REDIS_PASSWORD` | | ✓ (prod) | Redis authentication password |

## B.2 Authentication Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_ACCESS_TOKEN_LIFETIME` | `3600` | Access token TTL in seconds (1 hour) |
| `JWT_REFRESH_TOKEN_LIFETIME` | `86400` | Refresh token TTL in seconds (24 hours) |
| `JWT_SECRET_KEY` | `SECRET_KEY` | JWT signing key (defaults to Django SECRET_KEY) |

## B.3 AI & RAG Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | `` | OpenAI API key for LLM and embeddings |
| `LLM_MODEL` | `gpt-4-turbo-preview` | Default LLM model identifier |
| `EMBEDDING_PROVIDER` | `sentence_transformers` | Embedding provider (sentence_transformers, openai, huggingface) |
| `EMBEDDING_MODEL` | `all-MiniLM-L6-v2` | Embedding model identifier |
| `VECTOR_DIMENSION` | `384` | Embedding vector dimensionality |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant server URL |
| `QDRANT_API_KEY` | `` | Qdrant authentication key |
| `QDRANT_LOCAL_PATH` | `./qdrant_data` | Local persistent Qdrant storage path |
| `QDRANT_COLLECTION_NAME` | `kodezera_documents` | Qdrant collection name |

## B.4 Rate Limiting & Quota Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TENANT_QUERY_RATE` | `200/minute` | Baseline tenant query rate limit |
| `USER_QUERY_RATE` | `30/minute` | Baseline per-user query rate limit |
| `TENANT_UPLOAD_RATE` | `50/hour` | Baseline document upload rate limit |
| `TENANT_DAILY_QUERY_LIMIT` | `500` | Max AI queries per tenant per day |
| `THROTTLE_TENANT_QUERY_BASIC` | `200/minute` | Basic plan tenant query rate |
| `THROTTLE_TENANT_QUERY_PRO` | `400/minute` | Pro plan tenant query rate |
| `THROTTLE_TENANT_QUERY_ENTERPRISE` | `800/minute` | Enterprise plan tenant query rate |

## B.5 Infrastructure Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CELERY_BROKER_URL` | `redis://localhost:6379/1` | Celery message broker URL |
| `CELERY_RESULT_BACKEND` | `redis://localhost:6379/2` | Celery result storage URL |
| `MEDIA_ROOT` | `./media` | Document file storage directory |
| `MAX_UPLOAD_SIZE` | `52428800` | Maximum upload file size in bytes (50MB) |
| `FRONTEND_URL` | `http://localhost:5173` | Frontend URL (used in emails and CORS) |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000,...` | Comma-separated CORS allowed origins |

## B.6 Email Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `EMAIL_BACKEND` | `console` | Email backend (console for dev, SMTP for prod) |
| `EMAIL_HOST` | `smtp.gmail.com` | SMTP server hostname |
| `EMAIL_PORT` | `587` | SMTP server port |
| `EMAIL_USE_TLS` | `True` | Enable TLS for SMTP |
| `EMAIL_HOST_USER` | `` | SMTP username |
| `EMAIL_HOST_PASSWORD` | `` | SMTP password |
| `DEFAULT_FROM_EMAIL` | `noreply@kodezera.com` | Default sender email address |

## B.7 Monitoring Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SENTRY_DSN` | `` | Sentry error tracking DSN |
| `SENTRY_TRACES_SAMPLE_RATE` | `0.0` | Sentry performance tracing sample rate (0.0–1.0) |
| `SENTRY_ENVIRONMENT` | `development` | Sentry environment tag |
| `LOG_FORMAT` | `text` | Log format: `text` (human) or `json` (structured) |

## B.8 Gunicorn Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GUNICORN_WORKERS` | `(2×CPU)+1` | Number of Gunicorn worker processes |
| `GUNICORN_THREADS` | `2` | Threads per worker |
| `GUNICORN_WORKER_CLASS` | `sync` | Worker class (sync, gevent, uvicorn) |
| `GUNICORN_TIMEOUT` | `120` | Request timeout in seconds |
| `GUNICORN_LOG_LEVEL` | `info` | Log verbosity (debug, info, warning, error) |
| `GUNICORN_MAX_REQUESTS` | `1000` | Worker recycling threshold |

---

# Appendix C: Code Metrics

---

## C.1 Codebase Size

| Component | Files | Estimated Lines |
|-----------|------:|---------------:|
| **Backend (Python)** | | |
| `apps/core/` | ~25 | ~5,000 |
| `apps/rbac/` | ~10 | ~1,500 |
| `apps/documents/` | ~8 | ~1,200 |
| `apps/rag/` | ~12 | ~2,500 |
| `apps/analytics/` | ~8 | ~1,200 |
| `apps/api/` | ~15 | ~3,000 |
| `config/` | ~5 | ~600 |
| **Frontend (TypeScript/TSX)** | | |
| `frontend/src/pages/` | ~16 | ~4,500 |
| `frontend/src/components/` | ~20 | ~3,000 |
| `frontend/src/services/` | ~5 | ~800 |
| `frontend/src/stores/` | ~3 | ~400 |
| **Infrastructure** | | |
| Dockerfiles | 1 | 78 |
| Docker Compose | 3 | ~230 |
| Kubernetes Manifests | 6 | ~280 |
| **Design Specifications** | 12 | ~9,000 |
| **Documentation** | 15 | ~3,000 |
| **Total** | ~165+ | ~36,000+ |

## C.2 Database Model Count

| Module | Models | Notable Properties |
|--------|-------:|-------------------|
| Core | 15+ | Tenant, User, OrgUnit, OrgUnitClosure, AuditLog, AuditEvent, Notification, UserNotification, DeliveryRecord, NotificationTemplate, AIProviderConfig, SubscriptionPlan, TenantSubscription, UsageMetrics, SystemAuditLog |
| RBAC | 5 | Role, Permission, RolePermission, UserRole, RoleClosure |
| Documents | 6+ | Document, DocumentAccess, DocumentVersion, DocumentFolder, DocumentTag, DocumentTagAssignment |
| RAG | 4 | VectorChunk, ChatSession, ChatMessage, ChatFolder |
| Analytics | 5+ | MetricHour, MetricMonth, QueryAnalytics, AlertRule, MetricAlert |
| **Total** | **35+** | |

## C.3 API Endpoint Count

| Category | Endpoints |
|----------|:---------:|
| Authentication + MFA | 14 |
| Session Management | 2 |
| Admin User Management | 4 |
| RBAC (Roles, Permissions) | 5+ |
| Documents | 8+ |
| RAG + Chat | 6+ |
| Organisation | 3+ |
| Notifications | 9 |
| Analytics | 10+ |
| Audit & Compliance | 12+ |
| Platform Owner | 15+ |
| Health/Infrastructure | 3 |
| **Total** | **80+** |

---

# Appendix D: Subscription Plans & Cost Model

---

## D.1 Plan Definitions

| Feature | Basic | Pro | Enterprise |
|---------|:-----:|:---:|:----------:|
| Max Users | 10 | 50 | Unlimited |
| Max Storage | 5 GB | 25 GB | 100 GB |
| Max Queries/Month | 1,000 | 10,000 | Unlimited |
| Max Tokens/Month | 500K | 5M | Unlimited |
| Query Rate (per min) | 200 | 400 | 800 |
| Upload Rate (per hr) | 50 | 100 | 200 |
| MFA Support | ✓ | ✓ | ✓ |
| Custom Roles | 5 | 20 | Unlimited |
| Audit Log Retention | 30 days | 1 year | 5 years |
| Priority Support | ✗ | ✓ | ✓ |
| Dedicated Resources | ✗ | ✗ | ✓ |

## D.2 Per-Query Cost Tracking

Each RAG query records:
- `tokens_in`: Input tokens sent to LLM (context + query)
- `tokens_out`: Output tokens generated by LLM
- `cost_usd`: Computed as `(tokens_in × input_rate + tokens_out × output_rate)`

Default cost rates (configurable per AI provider):
- OpenAI GPT-4 Turbo: $0.01/1K input, $0.03/1K output
- OpenAI GPT-3.5 Turbo: $0.0005/1K input, $0.0015/1K output
- Local/Ollama: $0.00 (no API cost)

---

# Appendix E: Related Work Comparison

---

## E.1 Comparison with Existing RAG Platforms

| Feature | LangChain + Pinecone | LlamaIndex | Haystack | **KIS** |
|---------|:---:|:---:|:---:|:---:|
| Multi-Tenancy | ✗ | ✗ | ✗ | ✓ |
| Built-in RBAC | ✗ | ✗ | ✗ | ✓ |
| Document Access Control | ✗ | ✗ | Partial | ✓ (6-rule) |
| Classification Levels | ✗ | ✗ | ✗ | ✓ (0–5) |
| Citation Verification | ✗ | ✗ | Partial | ✓ |
| Hybrid Re-ranking | ✗ | ✓ | ✓ | ✓ |
| Multi-LLM Support | ✓ | ✓ | ✓ | ✓ |
| SaaS Platform Management | ✗ | ✗ | ✗ | ✓ |
| Audit Logging | ✗ | ✗ | ✗ | ✓ (hash chain) |
| Subscription Billing | ✗ | ✗ | ✗ | ✓ |
| Production UI | ✗ | ✗ | ✗ | ✓ |
| Air-Gap Deployment | ✗ | Partial | Partial | ✓ |
| Framework/Library | Library | Library | Framework | Full Platform |

**Key Differentiator**: Existing RAG frameworks (LangChain, LlamaIndex, Haystack) are developer libraries — they provide building blocks for RAG pipelines but do not include user management, access control, multi-tenancy, audit logging, or end-user interfaces. KIS is a complete, deployable platform with all of these built-in.

---
