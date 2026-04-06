# Document Management System — Complete Analysis & System Design

**Date:** 10 March 2026
**Scope:** Full analysis of document upload, processing, storage, classification, access control, and retrieval
**Principle:** Analyse current → Identify gaps → Design enterprise-grade document management

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Component Deep-Dive](#2-component-deep-dive)
3. [SWOT Analysis](#3-swot-analysis)
4. [Gap Analysis — Current vs Enterprise-Grade](#4-gap-analysis)
5. [Advanced System Design](#5-advanced-system-design)
6. [Architecture Design](#6-architecture-design)
7. [Data Model Design](#7-data-model-design)
8. [API Design](#8-api-design)
9. [Security Design](#9-security-design)
10. [Scalability & Reliability Design](#10-scalability--reliability-design)
11. [Frontend Design](#11-frontend-design)
12. [Migration Strategy](#12-migration-strategy)
13. [Implementation Roadmap](#13-implementation-roadmap)

---

## 1. System Overview

### 1.1 Current Architecture Summary

The document management module spans **10 files** across backend + frontend:

| Layer                | Files                                                                         | Purpose                                          |
| -------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------ |
| **Models**           | `documents/models.py` (Document, DocumentAccess)                              | Document metadata, polymorphic access grants     |
| **Views**            | `api/views/documents.py` (DocumentViewSet, DocumentAccessViewSet)             | Upload, download, delete, access management CRUD |
| **Access Service**   | `documents/services/access.py` (DocumentAccessService)                        | 5-rule access resolution with Redis caching      |
| **Processing Tasks** | `documents/tasks.py` (process_document_task, delete_document_embeddings_task) | Celery async: extract → chunk → embed → store    |
| **RAG Processing**   | `rag/services/document_processing.py`                                         | Text extraction (PDF, DOCX, TXT) + chunking      |
| **Embedding**        | `rag/services/embeddings.py`                                                  | Multi-provider embedding generation              |
| **Vector Store**     | `rag/services/vector_store.py`                                                | Qdrant storage with tenant/dept metadata         |
| **Serializers**      | `api/serializers/__init__.py` (Document, DocumentUpload, DocumentAccess)      | Validation and transformation                    |
| **Frontend Page**    | `pages/Documents.tsx`                                                         | Upload modal, drag-drop, search/filter, download |
| **Frontend Service** | `services/document.service.ts`                                                | API wrapper with progress tracking               |

### 1.2 Current Document Lifecycle

```
User uploads file (multipart POST)
    │
    ▼
[DocumentViewSet.create()] — rate limited per user
    │
    ├─ Validate: file type, size (MAX_UPLOAD_SIZE)
    ├─ Save to: media/<tenant_id>/<uuid>.<ext>
    ├─ Create Document record (status=pending)
    ├─ Dispatch process_document_task.delay()
    ├─ Notify department or tenant
    │
    ▼
[Celery: process_document_task]
    │
    ├─ Set status=processing
    ├─ Step 1: Extract text (PDF→PyPDF2, DOCX→python-docx, TXT→read)
    ├─ Step 2: Clean text (normalize whitespace, special chars)
    ├─ Step 3: Chunk text (token-based, overlapping, configurable size)
    ├─ Step 4: Generate embeddings (batch, multi-provider)
    ├─ Step 5: Store vectors in Qdrant (with metadata: tenant_id, dept_id, classification_level)
    ├─ Step 6: Create VectorChunk DB records
    ├─ Set status=completed, chunk_count=N
    │
    ├─ On failure: status=failed, processing_error=message, retry up to 3x
    │
    ▼
Document ready for RAG query
```

### 1.3 Current Access Resolution

```
DocumentAccessService.get_accessible_document_ids(user)
    │
    ├─ Superuser → ALL documents
    ├─ Tenant admin → ALL tenant documents
    ├─ Regular user:
    │   Rule 1: Role-based grants (DocumentAccess type=role, access_id ∈ user's role IDs)
    │   Rule 2: Department grants (type=department, access_id ∈ user's dept chain)
    │   Rule 3: User-specific grants (type=user, access_id = user.id)
    │   Rule 4: Public documents (visibility_type=public, status=completed)
    │   Rule 5: User's own uploads (uploaded_by=user, status=completed)
    │
    ├─ Cache: Redis 15min, key=user:{id}:accessible_docs
    └─ Returns: Set[UUID]
```

---

## 2. Component Deep-Dive

### 2.1 Document Model (`documents/models.py`)

**Current Fields:**

- `id`, `tenant`, `title`, `file_path`, `file_size`, `file_type`
- `uploaded_by`, `department`, `classification_level` (0-5)
- `visibility_type` (public/restricted/private)
- `status` (pending/processing/completed/failed)
- `processing_error`, `chunk_count`

**Issues:**

- No file versioning — overwrite loses history
- No content type validation beyond extension
- `file_path` is absolute OS path (non-portable, cloud migration breaks)
- `classification_level` 0-5 stored but NEVER enforced in access resolution
- No document metadata extraction (author, creation date, page count)
- No file checksums (integrity verification impossible)
- No soft delete — hard delete removes permanently
- No folder/category organization for documents
- No document preview/thumbnail generation
- No maximum file count per tenant (only size limit)

### 2.2 DocumentAccess Model

**Current Design:** Polymorphic pattern — `access_type` (role/department/user) + `access_id` (UUID)

**Issues:**

- No FK constraints — `access_id` is unconstrained UUID (dangling references)
- No permission level on grants (read-only vs read-write vs manage)
- No expiry on grants (no time-bound access)
- No grant scope (e.g., "read metadata only" vs "read content" vs "download")
- Deleting a role or department doesn't cascade-clean orphaned grants

### 2.3 Upload Pipeline

**Issues:**

- Direct filesystem write (no cloud storage support)
- UUID-based filenames lose original filename
- No virus/malware scanning
- No file deduplication (same file uploaded twice = double storage)
- Upload rate limit per user but not per tenant
- No resume for large uploads (no chunked upload protocol)
- No supported file type allowlist (relies on DocumentUploadSerializer)

### 2.4 Processing Pipeline (`documents/tasks.py`)

**Strengths:**

- Retry with exponential backoff (3 retries)
- Clean error capture in `processing_error`
- Bulk VectorChunk creation
- Old vectors cleaned before re-processing

**Issues:**

- No processing progress reporting (user sees "processing" with no ETA)
- No partial success (either all chunks succeed or complete failure)
- No text extraction for images (OCR missing)
- No table/structured data extraction
- No language detection
- No processing priority queue (large files block small ones)

### 2.5 Frontend Documents Page

**Strengths:**

- Drag-and-drop upload with progress bar
- Search and filter functionality
- Skeleton loading states
- Delete confirmation modal

**Issues:**

- No bulk upload (one file at a time)
- No folder/category navigation
- No document preview (must download to view)
- No access management UI (DocumentAccessViewSet API exists but no frontend)
- No version history UI
- No file type icons (all look the same)
- No processing status real-time update (manual refresh required)

---

## 3. SWOT Analysis

### Strengths (8)

1. **Async processing** — Celery pipeline doesn't block upload response
2. **Multi-format support** — PDF, DOCX, TXT extraction working
3. **RBAC-integrated access** — 5-rule resolution with role inheritance
4. **Redis-cached access** — 15-minute cache prevents per-query DB lookups
5. **Automatic embedding** — Upload → embeddings → searchable in RAG pipeline
6. **Rate limiting** — Per-user upload throttle prevents abuse
7. **Tenant isolation** — Documents scoped to tenant with middleware enforcement
8. **Retry resilience** — 3 retries with exponential backoff on processing

### Weaknesses (15)

1. No document versioning
2. Classification level (0-5) never enforced
3. `file_path` is absolute OS path (non-portable)
4. No virus/malware scanning on upload
5. No file integrity verification (checksums)
6. No cloud storage backend (S3/GCS/Azure Blob)
7. No document preview/thumbnail generation
8. No OCR for image-based documents
9. No folder/category organization
10. Polymorphic DocumentAccess has no FK constraints
11. No permission levels on access grants (no read-only vs write)
12. No time-bound/expiring access grants
13. No bulk upload support
14. No processing progress visibility
15. No soft delete (hard delete only)

### Opportunities (7)

1. S3-compatible storage for scalable cloud deployment
2. Document collaboration (comments, annotations)
3. AI-powered auto-classification and tagging
4. Full-text search index (Elasticsearch/Meilisearch) beyond vector search
5. DLP (Data Loss Prevention) integration
6. Document workflows (review → approve → publish)
7. Cross-tenant document sharing for enterprise groups

### Threats (4)

1. Data loss from hard delete + no backups
2. Compliance violations without proper retention policies
3. Storage cost explosion without deduplication
4. Processing pipeline bottleneck on large document batches

---

## 4. Gap Analysis — Current vs Enterprise-Grade

| Capability                 | Current State           | Enterprise Target                   | Gap    |
| -------------------------- | ----------------------- | ----------------------------------- | ------ |
| File upload                | ✅ Basic (single file)  | ✅ Bulk + chunked + resumable       | Medium |
| Format support             | ✅ PDF, DOCX, TXT       | ✅ + XLSX, PPTX, CSV, images        | Medium |
| Storage backend            | ⚠️ Local filesystem     | ✅ S3/GCS with CDN                  | Large  |
| Document versioning        | ❌ None                 | ✅ Full version history             | Large  |
| Classification enforcement | ❌ Stored, not enforced | ✅ Clearance-based access           | Medium |
| Access grant types         | ⚠️ Polymorphic (no FK)  | ✅ Proper FKs + permission levels   | Medium |
| Virus scanning             | ❌ None                 | ✅ ClamAV or cloud scan             | Medium |
| Preview generation         | ❌ None                 | ✅ PDF/image previews               | Medium |
| OCR                        | ❌ None                 | ✅ Tesseract/cloud OCR              | Medium |
| Folder organization        | ❌ None                 | ✅ Nested folders + tags            | Medium |
| Soft delete + retention    | ❌ Hard delete only     | ✅ Trash + retention policies       | Medium |
| Processing progress        | ❌ No visibility        | ✅ Real-time progress via WebSocket | Small  |
| Full-text search           | ⚠️ Vector search only   | ✅ + keyword/metadata search        | Medium |
| Document workflows         | ❌ None                 | ✅ Review/approve/publish           | Large  |

---

## 5. Advanced System Design

### 5.1 Design Principles

1. **Storage abstraction** — pluggable backends (local, S3, GCS, Azure) via unified interface
2. **Content-addressed storage** — SHA-256 hash for deduplication and integrity
3. **Progressive processing** — chunk-level progress reporting
4. **Defense in depth** — virus scan → type validation → size limit → classification enforcement
5. **Zero data loss** — versioning + soft delete + retention policies + backups

### 5.2 Document Lifecycle (Redesigned)

```
Upload Request
    │
    ▼
[Intake Layer]
    ├─ Validate: file type (allowlist), size, tenant quota
    ├─ Virus scan (ClamAV / cloud scanner)
    ├─ Calculate SHA-256 hash → check dedup
    ├─ Store to StorageBackend (local / S3 / GCS)
    ├─ Create Document record (status=uploaded)
    ├─ Create initial DocumentVersion (v1)
    │
    ▼
[Processing Pipeline] (Celery priority queue)
    ├─ Metadata extraction (page count, author, creation date)
    ├─ Language detection
    ├─ Preview generation (first page → thumbnail)
    ├─ Text extraction (with OCR fallback for images)
    ├─ Auto-classification (AI-driven tags + classification level)
    ├─ Chunking → embedding → Qdrant storage
    ├─ Report progress at each step via Redis pub/sub
    │
    ▼
[Ready State] (status=completed)
    ├─ Full-text search indexed
    ├─ Vector search indexed
    ├─ Preview available
    ├─ Access resolution active
    │
    ▼
[Lifecycle Management]
    ├─ Version updates (new file → new version, old preserved)
    ├─ Soft delete → trash (recoverable for retention_days)
    ├─ Hard delete after retention period
    ├─ Compliance hold (prevents deletion during legal hold)
```

### 5.3 Storage Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Storage Abstraction Layer                  │
│                                                              │
│  ┌────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐   │
│  │ Local  │ │ AWS S3   │ │ GCS      │ │ Azure Blob     │   │
│  │ FS     │ │ (+ CDN)  │ │          │ │                │   │
│  └───┬────┘ └────┬─────┘ └────┬─────┘ └──────┬─────────┘   │
│      │           │            │               │              │
│      └───────────┴────────────┴───────────────┘              │
│                         │                                     │
│                    StorageService                              │
│                         │                                     │
│         ┌───────────────┼───────────────────┐                │
│         │               │                   │                │
│     upload()       download()          delete()              │
│     get_url()      exists()            move()                │
│                                                              │
│  Content Addressing:                                          │
│    file_key = "{tenant_id}/{YYYY/MM}/{sha256_prefix}/{uuid}" │
│    Dedup: same hash = same content = skip re-upload           │
└─────────────────────────────────────────────────────────────┘
```

### 5.4 Versioning Strategy

```
Document (v3 - current)
    ├── DocumentVersion v1 (original upload)
    │   └── file_key, file_size, hash, uploaded_by, created_at
    ├── DocumentVersion v2 (edited)
    │   └── file_key, file_size, hash, uploaded_by, created_at, change_note
    └── DocumentVersion v3 (current)
        └── file_key, file_size, hash, uploaded_by, created_at, change_note

Rules:
  - Document.current_version → latest DocumentVersion
  - Download always serves current_version
  - Previous versions downloadable via /documents/{id}/versions/{version_number}/download/
  - Soft-deleting document preserves all versions in trash
  - Re-processing re-embeds current_version only
```

### 5.5 Enhanced Access Control

```
DocumentAccess (redesigned):
    ├── document → FK(Document)
    ├── For role grants:    role → FK(Role)
    ├── For dept grants:    department → FK(Department)
    ├── For user grants:    user → FK(User)
    │   (only one of role/department/user is set per row, enforced at model level)
    │
    ├── permission_level: read | write | manage
    │     read   = view metadata + download
    │     write  = read + upload new version + edit metadata
    │     manage = write + change access grants + delete
    │
    ├── expires_at → optional DateTime (time-bound access)
    ├── granted_by → FK(User)
    └── created_at

Classification Enforcement:
    User.clearance_level (0-5) >= Document.classification_level
    (enforced in DocumentAccessService alongside existing 5-rule resolution)
```

### 5.6 Folder & Tagging

```
DocumentFolder:
    ├── tenant, name, parent (self-ref for nesting)
    ├── owner (creator), shared (boolean for team visibility)
    └── Constraint: unique(tenant, name, parent)

DocumentTag:
    ├── tenant, name, color, category (auto/manual)
    └── AI-generated tags flagged as auto-tagged

DocumentTagAssignment:
    ├── document, tag
    └── Many-to-many through table
```

---

## 6. Architecture Design

### 6.1 Module Structure

```
apps/
  documents/
    __init__.py
    models.py                     # Document, DocumentVersion, DocumentAccess (redesigned),
                                  # DocumentFolder, DocumentTag, DocumentTagAssignment
    tasks.py                      # Processing pipeline tasks (enhanced with progress + OCR)
    admin.py
    services/
      __init__.py
      access.py                   # DocumentAccessService (enhanced with classification)
      storage.py                  # StorageService (pluggable backend abstraction)
      processing.py               # DocumentProcessingOrchestrator (progress-reporting)
      virus_scanner.py            # VirusScanService (ClamAV wrapper)
      preview_generator.py        # PreviewService (thumbnail generation)
      metadata_extractor.py       # MetadataService (page count, author, dates)
      classifier.py               # AutoClassificationService (AI-driven tagging)
      search.py                   # FullTextSearchService (Elasticsearch/Meilisearch)
    migrations/
```

### 6.2 Dependency Graph

```
documents module
    ├── core.models (User, Tenant, Department)
    ├── rbac.services (RoleResolutionService — for access resolution)
    ├── rag.services (embeddings, vector_store — for processing pipeline)
    ├── core.services.notifications (upload/processing alerts)
    ├── django.core.cache (Redis — access cache, processing progress)
    └── External:
        ├── boto3 / google-cloud-storage (cloud storage)
        ├── pyclamd (ClamAV virus scanning)
        ├── pdf2image + Pillow (preview generation)
        ├── pytesseract (OCR)
        └── elasticsearch-py (full-text search)
```

---

## 7. Data Model Design

### 7.1 New/Updated Models

```python
# ── Document (UPDATED) ──────────────────────────────────
class Document(models.Model):
    id                  = UUIDField(primary_key=True)
    tenant              = ForeignKey(Tenant, CASCADE)
    title               = CharField(max_length=500)
    description         = TextField(blank=True)
    folder              = ForeignKey('DocumentFolder', SET_NULL, null=True, blank=True)
    # Storage
    file_key            = CharField(max_length=512)           # StorageBackend key (replaces file_path)
    file_size           = BigIntegerField()
    file_type           = CharField(max_length=20)            # .pdf, .docx, etc.
    content_hash        = CharField(max_length=64)            # SHA-256 for dedup + integrity
    original_filename   = CharField(max_length=500)           # Preserve original name
    mime_type           = CharField(max_length=100)
    # Classification
    classification_level = IntegerField(default=0)            # 0-5, ENFORCED in access check
    visibility_type     = CharField(max_length=20)            # public/restricted/private
    # Metadata
    page_count          = IntegerField(null=True)
    language            = CharField(max_length=10, blank=True) # ISO 639-1
    author              = CharField(max_length=255, blank=True) # Extracted from file metadata
    # Processing
    status              = CharField(max_length=20)
    processing_progress = IntegerField(default=0)             # 0-100 percentage
    processing_error    = TextField(blank=True)
    chunk_count         = IntegerField(default=0)
    # Lifecycle
    uploaded_by         = ForeignKey(User, SET_NULL, null=True)
    department          = ForeignKey(Department, SET_NULL, null=True, blank=True)
    current_version     = ForeignKey('DocumentVersion', SET_NULL, null=True, related_name='+')
    is_deleted          = BooleanField(default=False)         # Soft delete
    deleted_at          = DateTimeField(null=True)
    retention_until     = DateTimeField(null=True)            # Compliance hold
    created_at          = DateTimeField(auto_now_add=True)
    updated_at          = DateTimeField(auto_now=True)

# ── DocumentVersion ──────────────────────────────────────
class DocumentVersion(models.Model):
    id              = UUIDField(primary_key=True)
    document        = ForeignKey(Document, CASCADE, related_name='versions')
    version_number  = IntegerField()
    file_key        = CharField(max_length=512)               # Storage key for this version
    file_size       = BigIntegerField()
    content_hash    = CharField(max_length=64)
    change_note     = TextField(blank=True)
    uploaded_by     = ForeignKey(User, SET_NULL, null=True)
    created_at      = DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [['document', 'version_number']]
        ordering = ['-version_number']

# ── DocumentAccess (REDESIGNED) ──────────────────────────
class DocumentAccess(models.Model):
    PERMISSION_LEVELS = [('read','Read'), ('write','Write'), ('manage','Manage')]
    id              = UUIDField(primary_key=True)
    document        = ForeignKey(Document, CASCADE, related_name='access_grants')
    # Proper FKs — only one set per row
    role            = ForeignKey(Role, CASCADE, null=True, blank=True)
    department      = ForeignKey(Department, CASCADE, null=True, blank=True)
    user            = ForeignKey(User, CASCADE, null=True, blank=True)
    permission_level = CharField(max_length=10, choices=PERMISSION_LEVELS, default='read')
    expires_at      = DateTimeField(null=True, blank=True)
    granted_by      = ForeignKey(User, SET_NULL, null=True, related_name='grants_given')
    created_at      = DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            CheckConstraint(
                check=(
                    Q(role__isnull=False, department__isnull=True, user__isnull=True) |
                    Q(role__isnull=True, department__isnull=False, user__isnull=True) |
                    Q(role__isnull=True, department__isnull=True, user__isnull=False)
                ),
                name='exactly_one_grantee'
            )
        ]

# ── DocumentFolder ───────────────────────────────────────
class DocumentFolder(models.Model):
    id          = UUIDField(primary_key=True)
    tenant      = ForeignKey(Tenant, CASCADE)
    name        = CharField(max_length=255)
    parent      = ForeignKey('self', SET_NULL, null=True, blank=True)
    owner       = ForeignKey(User, SET_NULL, null=True)
    is_shared   = BooleanField(default=False)
    created_at  = DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [['tenant', 'name', 'parent']]

# ── DocumentTag ──────────────────────────────────────────
class DocumentTag(models.Model):
    TAG_CATEGORIES = [('manual','Manual'), ('auto','Auto-classified')]
    id          = UUIDField(primary_key=True)
    tenant      = ForeignKey(Tenant, CASCADE)
    name        = CharField(max_length=100)
    color       = CharField(max_length=7, default='#6366f1')  # Hex color
    category    = CharField(max_length=10, choices=TAG_CATEGORIES, default='manual')
    created_at  = DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [['tenant', 'name']]

# ── DocumentTagAssignment ────────────────────────────────
class DocumentTagAssignment(models.Model):
    document    = ForeignKey(Document, CASCADE, related_name='tag_assignments')
    tag         = ForeignKey(DocumentTag, CASCADE, related_name='assignments')
    assigned_by = ForeignKey(User, SET_NULL, null=True)
    created_at  = DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [['document', 'tag']]
```

### 7.2 ERD

```
┌─────────────────┐     ┌────────────────────┐
│ DocumentFolder   │     │    Document         │
│ name, parent     │──<──│ title, folder       │
│ tenant, owner    │     │ file_key, hash      │
└─────────────────┘     │ classification      │
                         │ status, progress    │
                         │ is_deleted          │
                         │ current_version ──┐ │
                         └──┬───────┬────────┘ │
                            │       │     │     │
          ┌─────────────────┘       │     │     │
          ▼                         ▼     │     ▼
┌──────────────────┐  ┌──────────────┐   │  ┌──────────────────┐
│  DocumentAccess  │  │ DocumentTag  │   │  │ DocumentVersion  │
│ role (FK)        │  │ Assignment   │   │  │ version_number   │
│ department (FK)  │  │ document, tag│   │  │ file_key, hash   │
│ user (FK)        │  └──────────────┘   │  │ change_note      │
│ permission_level │        ▲            │  └──────────────────┘
│ expires_at       │        │            │
└──────────────────┘  ┌─────┴──────┐     │
                      │ DocumentTag│     │
                      │ name, color│     │
                      │ category   │     │
                      └────────────┘     │
```

---

## 8. API Design

### 8.1 Document CRUD Endpoints

| Endpoint                                | Method | Auth  | Purpose                                 |
| --------------------------------------- | ------ | ----- | --------------------------------------- |
| `/api/documents/`                       | GET    | Auth  | List accessible documents (filterable)  |
| `/api/documents/`                       | POST   | RBAC  | Upload new document                     |
| `/api/documents/{id}/`                  | GET    | Auth  | Document detail with metadata           |
| `/api/documents/{id}/`                  | PATCH  | RBAC  | Update document metadata                |
| `/api/documents/{id}/`                  | DELETE | RBAC  | Soft delete document                    |
| `/api/documents/{id}/download/`         | GET    | Auth  | Download current version                |
| `/api/documents/{id}/preview/`          | GET    | Auth  | Get preview thumbnail URL               |
| `/api/documents/{id}/reprocess/`        | POST   | RBAC  | Re-run processing pipeline              |
| `/api/documents/bulk-upload/`           | POST   | RBAC  | Upload multiple files at once           |
| `/api/documents/trash/`                 | GET    | Auth  | List soft-deleted documents             |
| `/api/documents/{id}/restore/`          | POST   | RBAC  | Restore from trash                      |
| `/api/documents/{id}/permanent-delete/` | DELETE | Admin | Permanently delete (bypasses retention) |

### 8.2 Version Endpoints

| Endpoint                                       | Method | Auth | Purpose                    |
| ---------------------------------------------- | ------ | ---- | -------------------------- |
| `/api/documents/{id}/versions/`                | GET    | Auth | List all versions          |
| `/api/documents/{id}/versions/`                | POST   | RBAC | Upload new version         |
| `/api/documents/{id}/versions/{ver}/download/` | GET    | Auth | Download specific version  |
| `/api/documents/{id}/versions/{ver}/restore/`  | POST   | RBAC | Restore version as current |

### 8.3 Access Management Endpoints

| Endpoint                                 | Method | Auth   | Purpose                             |
| ---------------------------------------- | ------ | ------ | ----------------------------------- |
| `/api/documents/{id}/access/`            | GET    | Auth   | List access grants for document     |
| `/api/documents/{id}/access/`            | POST   | Manage | Create access grant                 |
| `/api/documents/{id}/access/{grant_id}/` | DELETE | Manage | Revoke access grant                 |
| `/api/documents/{id}/access/effective/`  | GET    | Auth   | Show effective permissions for user |

### 8.4 Folder & Tag Endpoints

| Endpoint                       | Method       | Auth | Purpose                         |
| ------------------------------ | ------------ | ---- | ------------------------------- |
| `/api/documents/folders/`      | GET/POST     | Auth | List/create folders             |
| `/api/documents/folders/{id}/` | PATCH/DELETE | Auth | Update/delete folder            |
| `/api/documents/tags/`         | GET/POST     | Auth | List/create tags                |
| `/api/documents/{id}/tags/`    | POST/DELETE  | RBAC | Assign/remove tag from document |

### 8.5 Search Endpoints

| Endpoint                 | Method | Auth | Purpose                      |
| ------------------------ | ------ | ---- | ---------------------------- |
| `/api/documents/search/` | GET    | Auth | Full-text + metadata search  |
| `/api/documents/search/` | POST   | Auth | Advanced search with filters |

**Query Parameters for List:**

- `?folder=<id>` — filter by folder
- `?tag=<name>` — filter by tag
- `?status=completed` — filter by processing status
- `?classification_level__lte=3` — filter by classification
- `?visibility_type=public` — filter by visibility
- `?search=keyword` — full-text search
- `?ordering=-created_at` — sort order

---

## 9. Security Design

### 9.1 Threat Model

| Threat                | Mitigation                                                             |
| --------------------- | ---------------------------------------------------------------------- |
| Malware upload        | ClamAV scan on intake, quarantine infected files                       |
| Path traversal        | Storage keys generated server-side (UUID), no user-supplied paths      |
| File type spoofing    | Validate MIME type + magic bytes, not just extension                   |
| Unauthorized access   | 5-rule resolution + classification enforcement + grant FK constraints  |
| Data exfiltration     | DLP rules, download audit logging, classification watermarking         |
| Denial of service     | Upload rate limit + file size limit + tenant storage quota             |
| Data loss             | Versioning + soft delete + retention policies + backup to cold storage |
| Integrity tampering   | SHA-256 hash verification on download                                  |
| SSRF via file content | Sanitize extracted URLs, disable external resource loading in parsers  |

### 9.2 Classification Enforcement

```
User requests document D
    │
    ├─ D.classification_level = 3 (Confidential)
    ├─ User.clearance_level = 2 (Internal)
    │
    └─ DENIED: User clearance (2) < Document classification (3)

Enforcement points:
  1. DocumentAccessService.get_accessible_document_ids() — filter out
  2. DocumentViewSet.get_object() — double-check on retrieve
  3. Download endpoint — final gate before serving file
```

### 9.3 File Type Allowlist

```python
ALLOWED_FILE_TYPES = {
    '.pdf':  'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc':  'application/msword',
    '.txt':  'text/plain',
    '.csv':  'text/csv',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.md':   'text/markdown',
    '.png':  'image/png',    # For OCR
    '.jpg':  'image/jpeg',   # For OCR
}
# Validate: extension in allowlist AND magic bytes match expected MIME type
```

---

## 10. Scalability & Reliability Design

### 10.1 Performance Targets

| Metric                      | Target           | Current  |
| --------------------------- | ---------------- | -------- |
| Upload latency (100MB file) | < 5s             | ~3s      |
| Processing (10-page PDF)    | < 30s            | ~20s     |
| Access resolution (p95)     | < 10ms           | ~15ms    |
| Document list (1000 docs)   | < 200ms          | ~150ms   |
| Full-text search (p95)      | < 100ms          | N/A      |
| Download (any size)         | < 2s start       | ~1s      |
| Storage per tenant          | Unlimited (paid) | 50GB max |

### 10.2 Processing Queue Design

```
Priority Queues:
  HIGH:    Small files (< 5MB), re-processing requests
  NORMAL:  Standard uploads (5MB - 100MB)
  LOW:     Bulk uploads, large files (> 100MB)

Workers:
  - Auto-scale Celery workers based on queue depth
  - Separate worker pool for embedding generation (GPU if available)
  - Dead letter queue for permanently failed documents
```

### 10.3 Storage Scaling

- **Deduplication:** Content-addressed storage — same SHA-256 = no re-upload
- **Tiered storage:** Hot (recent/active) → Warm (30+ days) → Cold (archive, 1+ year)
- **CDN:** Signed URLs for downloads — offload bandwidth from app server
- **Compression:** Gzip for text-based formats in storage

### 10.4 Caching Strategy

| Data                    | Cache Key                   | TTL       | Invalidation              |
| ----------------------- | --------------------------- | --------- | ------------------------- |
| Accessible document IDs | `user:{id}:accessible_docs` | 15 min    | Access grant change       |
| Document metadata       | `doc:{id}:meta`             | 5 min     | Document update           |
| Processing progress     | `doc:{id}:progress`         | Real-time | Redis pub/sub on progress |
| Folder tree             | `tenant:{id}:folder_tree`   | 10 min    | Folder CRUD               |
| Tag list                | `tenant:{id}:tags`          | 30 min    | Tag CRUD                  |
| Download URL (signed)   | `doc:{id}:download_url`     | 5 min     | N/A (short-lived URL)     |

---

## 11. Frontend Design

### 11.1 Documents Page (Redesigned)

```
Documents Page Layout:
┌─────────────────────────────────────────────────────────────────┐
│  [Search _______________]  [Filter ▼]  [View: Grid|List]  [Upload]│
├───────────────┬─────────────────────────────────────────────────┤
│               │                                                  │
│  Folder Tree  │  Document Grid / List                           │
│               │                                                  │
│  📁 All Docs  │  ┌─────────┐ ┌─────────┐ ┌─────────┐          │
│  📁 HR        │  │ 📄 Q3   │ │ 📊 Data │ │ 📋 Spec │          │
│    📁 Policies│  │ Report  │ │ Export  │ │ Doc    │          │
│  📁 Legal     │  │ PDF 2MB │ │ XLSX 5MB│ │ DOCX 1MB│          │
│  📁 Finance   │  │ 🟢 Ready│ │ 🟡 Proc │ │ 🔴 Fail │          │
│  🗑️ Trash     │  │ v3 · 3d │ │ v1 · 1h │ │ v1 · 2d │          │
│               │  └─────────┘ └─────────┘ └─────────┘          │
│  Tags:        │                                                  │
│  🏷️ Confidential│  [← Prev]  Page 1 of 10  [Next →]           │
│  🏷️ Finance   │                                                  │
│  🏷️ Policy    │                                                  │
└───────────────┴─────────────────────────────────────────────────┘
```

### 11.2 Document Detail Drawer

```
Document Detail (Slide-in Panel):
┌──────────────────────────────────────────────┐
│  [← Back]  Q3 Revenue Report              [⋮] │
├──────────────────────────────────────────────┤
│  Preview: ┌──────────────────────────────┐   │
│           │  (Thumbnail / First Page)     │   │
│           └──────────────────────────────┘   │
│                                               │
│  📊 Metadata                                  │
│  Type: PDF  |  Size: 2.4 MB  |  Pages: 12   │
│  Classification: 🔒 Confidential (Level 3)    │
│  Visibility: Restricted                       │
│  Uploaded by: John Smith  |  3 days ago       │
│  Department: Finance                          │
│  Tags: Finance, Q3, Revenue                   │
│                                               │
│  📋 Versions                                  │
│  v3 (current) — John, 3d ago — "Updated figs" │
│  v2 — Jane, 1w ago — "Added appendix"         │
│  v1 — John, 2w ago — (original)               │
│                                               │
│  🔐 Access                                    │
│  Finance Dept (read) | HR Role (read)          │
│  [+ Add Access]                                │
│                                               │
│  [Download]  [New Version]  [Delete]           │
└──────────────────────────────────────────────┘
```

### 11.3 New Components

| Component               | Purpose                                              |
| ----------------------- | ---------------------------------------------------- |
| `FolderTree`            | Nested folder navigation sidebar                     |
| `DocumentCard`          | Grid card with type icon, status badge, version info |
| `DocumentDetailDrawer`  | Slide-in panel with preview, metadata, versions      |
| `BulkUploadModal`       | Multi-file upload with individual progress bars      |
| `AccessManagerPanel`    | Grant/revoke access with role/dept/user picker       |
| `VersionHistory`        | Timeline of document versions with restore/download  |
| `TagPicker`             | Tag selection/creation with color picker             |
| `ProcessingProgressBar` | Real-time processing status per document             |
| `DocumentPreview`       | Inline PDF/image viewer                              |

---

## 12. Migration Strategy

### Phase 1: Foundation (Non-Breaking)

- Add new fields to Document model (`file_key`, `content_hash`, `original_filename`, `mime_type`, etc.)
- Add `is_deleted`, `deleted_at` for soft delete
- Backfill `file_key` from existing `file_path`
- Create DocumentVersion model, backfill v1 for all existing docs
- Create DocumentFolder and DocumentTag models

### Phase 2: Access Redesign

- Create new DocumentAccess model with proper FKs
- Migrate existing polymorphic access grants to FK-based
- Add `permission_level` and `expires_at` fields
- Add classification enforcement to DocumentAccessService
- Add `clearance_level` to User model (from Org/RBAC design)

### Phase 3: Storage & Processing

- Implement StorageService abstraction
- Migrate file storage from absolute paths to storage keys
- Add virus scanning to upload pipeline
- Add processing progress reporting
- Add preview generation

### Phase 4: Frontend

- Build folder tree sidebar
- Build document detail drawer with preview
- Add version history UI
- Add access management panel
- Add bulk upload support
- Add tag management

### Phase 5: Advanced Features

- Integrate full-text search (Elasticsearch/Meilisearch)
- Add OCR for image documents
- Add AI auto-classification
- Add retention policies and compliance holds
- Add document workflows (review → approve → publish)

---

## 13. Implementation Roadmap

| #   | Task                                        | Phase | Depends On | Priority |
| --- | ------------------------------------------- | ----- | ---------- | -------- |
| 1   | Add soft delete fields to Document          | 1     | —          | Critical |
| 2   | Add file_key, hash, mime_type fields        | 1     | —          | Critical |
| 3   | Create DocumentVersion model + migration    | 1     | —          | Critical |
| 4   | Backfill v1 for all existing documents      | 1     | 3          | Critical |
| 5   | Create DocumentFolder model                 | 1     | —          | High     |
| 6   | Create DocumentTag models                   | 1     | —          | High     |
| 7   | Redesign DocumentAccess with proper FKs     | 2     | —          | Critical |
| 8   | Migrate polymorphic grants to FK-based      | 2     | 7          | Critical |
| 9   | Add permission_level and expires_at         | 2     | 7          | High     |
| 10  | Enforce classification in access resolution | 2     | 7          | High     |
| 11  | Build StorageService abstraction            | 3     | —          | High     |
| 12  | Migrate files to storage keys               | 3     | 11         | High     |
| 13  | Integrate ClamAV virus scanning             | 3     | —          | High     |
| 14  | Add processing progress to pipeline         | 3     | —          | Medium   |
| 15  | Add preview generation service              | 3     | —          | Medium   |
| 16  | Add metadata extraction service             | 3     | —          | Medium   |
| 17  | Build folder tree sidebar                   | 4     | 5          | High     |
| 18  | Build document detail drawer                | 4     | 3          | High     |
| 19  | Build version history UI                    | 4     | 3          | High     |
| 20  | Build access management panel               | 4     | 7          | High     |
| 21  | Build bulk upload modal                     | 4     | —          | Medium   |
| 22  | Build tag management UI                     | 4     | 6          | Medium   |
| 23  | Integrate full-text search                  | 5     | —          | Medium   |
| 24  | Add OCR service                             | 5     | —          | Medium   |
| 25  | Add AI auto-classification                  | 5     | 6          | Low      |
| 26  | Add retention policies                      | 5     | 1          | Medium   |
| 27  | Add document workflows                      | 5     | —          | Low      |

---

> **Status:** Analysis complete. Implementation ON HOLD until design review and approval.
