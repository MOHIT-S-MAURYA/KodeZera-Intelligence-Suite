# Chapter 3: Analysis and Design (Part 2 — Diagrams, ERD, & Table Specifications)

---

## 3.3 Class Diagram

```mermaid
classDiagram
    class Tenant {
        +UUID id
        +String name
        +String domain
        +Boolean is_active
        +String status
        +JSONField config
        +DateTime created_at
        +DateTime updated_at
    }

    class User {
        +UUID id
        +FK tenant_id
        +String email
        +String first_name
        +String last_name
        +FK department_id
        +Boolean is_tenant_admin
        +Boolean is_superuser
        +Boolean is_active
        +Integer clearance_level
        +Boolean mfa_enabled
        +Boolean force_password_change
        +DateTime created_at
    }

    class OrgUnit {
        +UUID id
        +FK tenant_id
        +String name
        +String code
        +String unit_type
        +FK parent_id
        +Integer depth
        +String path
        +FK head_user_id
        +Boolean is_active
    }

    class OrgUnitClosure {
        +FK ancestor_id
        +FK descendant_id
        +Integer depth
    }

    class UserOrgUnit {
        +UUID id
        +FK user_id
        +FK org_unit_id
        +String role_in_unit
        +Boolean is_active
        +DateTime expires_at
    }

    class Role {
        +UUID id
        +FK tenant_id
        +String name
        +String description
        +FK parent_id
        +Integer level
        +Boolean is_system_role
        +Boolean is_active
    }

    class RoleClosure {
        +FK ancestor_id
        +FK descendant_id
        +Integer depth
    }

    class Permission {
        +UUID id
        +String name
        +String resource_type
        +String action
        +String description
        +Boolean is_deny
        +JSONField conditions
    }

    class RolePermission {
        +UUID id
        +FK role_id
        +FK permission_id
        +DateTime granted_at
    }

    class UserRole {
        +UUID id
        +FK user_id
        +FK role_id
        +FK assigned_by_id
        +Boolean is_active
        +DateTime expires_at
        +DateTime assigned_at
    }

    class Document {
        +UUID id
        +FK tenant_id
        +String title
        +String file_path
        +BigInt file_size
        +String file_type
        +FK uploaded_by_id
        +FK department_id
        +Integer classification_level
        +String visibility_type
        +String status
        +Integer chunk_count
        +Boolean is_deleted
        +DateTime created_at
    }

    class DocumentAccess {
        +UUID id
        +FK document_id
        +String access_type
        +FK role_id
        +FK org_unit_id
        +FK user_id
        +String permission_level
        +Boolean include_descendants
        +FK granted_by_id
        +DateTime expires_at
    }

    class VectorChunk {
        +UUID id
        +FK document_id
        +Integer chunk_index
        +String vector_id
        +String text_preview
        +Integer token_count
    }

    class ChatSession {
        +UUID id
        +FK tenant_id
        +FK user_id
        +FK folder_id
        +String title
        +DateTime created_at
        +DateTime updated_at
    }

    class ChatMessage {
        +UUID id
        +FK session_id
        +String role
        +Text content
        +JSONField sources
        +DateTime created_at
    }

    class ChatFolder {
        +UUID id
        +FK tenant_id
        +FK user_id
        +String name
        +DateTime created_at
    }

    class AuditLog {
        +UUID id
        +FK tenant_id
        +FK user_id
        +String action
        +String resource_type
        +UUID resource_id
        +JSONField metadata
        +IP ip_address
        +Text user_agent
        +DateTime timestamp
    }

    class AIProviderConfig {
        +Integer id
        +String llm_provider
        +String llm_model
        +String llm_api_key
        +String embedding_provider
        +String embedding_model
        +Integer max_tokens_per_request
    }

    class QueryAnalytics {
        +UUID id
        +FK tenant_id
        +FK user_id
        +UUID session_id
        +String query_hash
        +Integer latency_ms
        +Integer chunks_retrieved
        +Float avg_relevance
        +String model_used
        +Integer tokens_in
        +Integer tokens_out
        +Decimal cost_usd
        +String user_feedback
        +Boolean is_failed
    }

    Tenant "1" --> "*" User : contains
    Tenant "1" --> "*" OrgUnit : contains
    Tenant "1" --> "*" Role : contains
    Tenant "1" --> "*" Document : contains
    Tenant "1" --> "*" AuditLog : logs

    User "*" --> "1" Tenant : belongs_to
    User "*" --> "*" Role : assigned_via_UserRole
    User "*" --> "*" OrgUnit : member_via_UserOrgUnit
    User "1" --> "*" ChatSession : owns
    User "1" --> "*" Document : uploads

    OrgUnit "1" --> "*" OrgUnit : parent_children
    OrgUnit --> OrgUnitClosure : closure_pairs

    Role "1" --> "*" Role : parent_children
    Role --> RoleClosure : closure_pairs
    Role "*" --> "*" Permission : granted_via_RolePermission

    Document "1" --> "*" DocumentAccess : access_grants
    Document "1" --> "*" VectorChunk : vector_chunks

    ChatSession "1" --> "*" ChatMessage : messages
    ChatSession "*" --> "1" ChatFolder : organised_in
```

---

## 3.4 Activity Diagram — RAG Query Flow

```mermaid
flowchart TD
    A[User Submits Query] --> B{Is User Authenticated?}
    B -->|No| C[401 Unauthorized]
    B -->|Yes| D{Is Platform Owner?}
    D -->|Yes| E[Return: Use tenant account]
    D -->|No| F[Resolve Accessible Document IDs]
    F --> G{Has Accessible Documents?}
    G -->|No| H[Return: No documents accessible]
    G -->|Yes| I[Check if Follow-up Query]
    I --> J{Is Referential?}
    J -->|Yes| K[Rewrite: Prepend Prior Message]
    J -->|No| L[Use Original Query]
    K --> M[Generate Query Embedding]
    L --> M
    M --> N[Vector Search in Qdrant]
    N --> O[Over-fetch 3x Candidates]
    O --> P[Hybrid Re-ranking]
    P --> Q{Has Relevant Chunks?}
    Q -->|No| R[Return: No relevant information]
    Q -->|Yes| S[Expand Context Window ±1]
    S --> T[Build LLM Prompt]
    T --> U[Stream LLM Response via SSE]
    U --> V[Save Assistant Message to DB]
    V --> W[Verify Citations]
    W --> X[Record Audit Log - async]
    X --> Y[Record Analytics Metrics - async]
    Y --> Z[Stream Complete Signal]
```

---

## 3.5 Deployment Diagram

```mermaid
graph TB
    subgraph "Client Layer"
        Browser["Web Browser\n(React SPA)"]
    end

    subgraph "Edge Layer"
        Nginx["Nginx\nReverse Proxy\nTLS Termination\nStatic Files"]
    end

    subgraph "Application Layer"
        Django1["Django App\n(Gunicorn Worker 1)"]
        Django2["Django App\n(Gunicorn Worker 2)"]
        Django3["Django App\n(Gunicorn Worker 3)"]
        Django4["Django App\n(Gunicorn Worker 4)"]
        CeleryDefault["Celery Worker\n(default queue)"]
        CeleryEmbed["Celery Worker\n(embedding queue)"]
        CeleryBeat["Celery Beat\n(Scheduler)"]
    end

    subgraph "Data Layer"
        PostgreSQL["PostgreSQL 16\n(Primary + Read Replicas)"]
        Redis["Redis 7\n(Cache + Celery Broker)"]
        Qdrant["Qdrant\n(Vector Database)"]
        ObjectStore["S3 / Object Storage\n(Document Files)"]
    end

    subgraph "External Services"
        OpenAI["OpenAI API\n(LLM + Embeddings)"]
        Anthropic["Anthropic API\n(Claude LLM)"]
        SMTP["SMTP Server\n(Email Notifications)"]
        Sentry["Sentry\n(Error Tracking)"]
    end

    Browser <-->|HTTPS| Nginx
    Nginx <-->|HTTP| Django1
    Nginx <-->|HTTP| Django2
    Nginx <-->|HTTP| Django3
    Nginx <-->|HTTP| Django4

    Django1 <--> PostgreSQL
    Django1 <--> Redis
    Django1 <--> Qdrant
    Django1 --> ObjectStore

    CeleryDefault <--> Redis
    CeleryDefault <--> PostgreSQL
    CeleryEmbed <--> Redis
    CeleryEmbed <--> PostgreSQL
    CeleryEmbed <--> Qdrant
    CeleryBeat <--> Redis

    Django1 -.->|Optional| OpenAI
    Django1 -.->|Optional| Anthropic
    Django1 -.-> SMTP
    Django1 -.-> Sentry
```

---

## 3.6 Data Flow Diagram (DFD)

### Level 0: Context Diagram

```mermaid
graph LR
    User((User)) -->|Authentication Request| KIS[Kodezera Intelligence Suite]
    User -->|Document Upload| KIS
    User -->|AI Query| KIS
    KIS -->|JWT Tokens| User
    KIS -->|Search Results / AI Response| User
    KIS -->|Notifications| User

    Admin((Tenant Admin)) -->|User/Role Management| KIS
    Admin -->|Document Access Grants| KIS
    KIS -->|Audit Logs / Analytics| Admin

    PO((Platform Owner)) -->|Tenant/AI Configuration| KIS
    KIS -->|System Metrics / Billing| PO

    KIS <-->|Vector Operations| Qdrant[(Qdrant Vector DB)]
    KIS <-->|Data Operations| PG[(PostgreSQL)]
    KIS <-->|Cache/Queue| Redis[(Redis)]
    KIS -.->|LLM Inference| LLM[LLM Provider]
```

### Level 1: Subsystem Interaction

```mermaid
graph TB
    subgraph "1.0 Authentication"
        A1[Login/MFA Handler]
        A2[JWT Token Service]
        A3[Session Manager]
    end

    subgraph "2.0 RBAC Engine"
        R1[Role Resolution Service]
        R2[Permission Service]
        R3[Condition Engine - ABAC]
    end

    subgraph "3.0 Document Management"
        D1[Upload Handler]
        D2[Processing Pipeline]
        D3[Access Resolution Service]
    end

    subgraph "4.0 RAG Pipeline"
        Q1[Retriever]
        Q2[Re-ranker]
        Q3[LLM Runner]
        Q4[Citation Verifier]
    end

    subgraph "5.0 Analytics"
        AN1[Metric Collector]
        AN2[Aggregation Service]
        AN3[Alert Engine]
    end

    A1 --> A2
    A2 --> A3
    A1 --> R1
    R1 --> R2
    R2 --> R3

    D1 --> D2
    D3 --> R1

    Q1 --> D3
    Q1 --> Q2
    Q2 --> Q3
    Q3 --> Q4

    Q3 --> AN1
    AN1 --> AN2
    AN2 --> AN3
```

---

## 3.7 Entity-Relationship Diagram (ERD)

```mermaid
erDiagram
    TENANT ||--o{ USER : contains
    TENANT ||--o{ ORG_UNIT : has
    TENANT ||--o{ ROLE : defines
    TENANT ||--o{ DOCUMENT : stores
    TENANT ||--o{ AUDIT_LOG : logs
    TENANT ||--o{ CHAT_SESSION : contains
    TENANT ||--o{ METRIC_HOUR : tracks
    TENANT ||--o{ METRIC_MONTH : tracks
    TENANT ||--o{ QUERY_ANALYTICS : records

    USER ||--o{ USER_ROLE : assigned
    USER ||--o{ USER_ORG_UNIT : belongs_to
    USER ||--o{ DOCUMENT : uploads
    USER ||--o{ CHAT_SESSION : owns
    USER ||--o{ CHAT_FOLDER : organises
    USER ||--o{ USER_NOTIFICATION : receives

    ROLE ||--o{ ROLE_PERMISSION : grants
    ROLE ||--o{ ROLE_CLOSURE : closure_entry
    ROLE }o--o| ROLE : parent_child

    PERMISSION ||--o{ ROLE_PERMISSION : assigned_to

    ORG_UNIT ||--o{ ORG_UNIT_CLOSURE : closure_entry
    ORG_UNIT }o--o| ORG_UNIT : parent_child
    ORG_UNIT ||--o{ USER_ORG_UNIT : members

    DOCUMENT ||--o{ DOCUMENT_ACCESS : access_grants
    DOCUMENT ||--o{ DOCUMENT_VERSION : versions
    DOCUMENT ||--o{ VECTOR_CHUNK : indexed_chunks
    DOCUMENT ||--o{ DOCUMENT_TAG : tagged

    DOCUMENT_ACCESS }o--o| ROLE : role_grant
    DOCUMENT_ACCESS }o--o| ORG_UNIT : org_unit_grant
    DOCUMENT_ACCESS }o--o| USER : user_grant

    CHAT_SESSION ||--o{ CHAT_MESSAGE : contains
    CHAT_SESSION }o--o| CHAT_FOLDER : in_folder

    NOTIFICATION ||--o{ USER_NOTIFICATION : fan_out
    USER_NOTIFICATION ||--o{ DELIVERY_RECORD : delivered_via

    ALERT_RULE ||--o{ METRIC_ALERT : triggers

    TENANT {
        UUID id PK
        String name
        String domain UK
        Boolean is_active
        String status
    }

    USER {
        UUID id PK
        UUID tenant_id FK
        String email UK
        String first_name
        String last_name
        UUID department_id FK
        Boolean is_tenant_admin
        Integer clearance_level
    }

    ROLE {
        UUID id PK
        UUID tenant_id FK
        String name
        UUID parent_id FK
        Integer level
        Boolean is_system_role
    }

    PERMISSION {
        UUID id PK
        String name UK
        String resource_type
        String action
        Boolean is_deny
        JSON conditions
    }

    DOCUMENT {
        UUID id PK
        UUID tenant_id FK
        String title
        String file_type
        UUID uploaded_by FK
        Integer classification_level
        String visibility_type
        String status
        Integer chunk_count
    }

    VECTOR_CHUNK {
        UUID id PK
        UUID document_id FK
        Integer chunk_index
        String vector_id UK
        Integer token_count
    }

    CHAT_SESSION {
        UUID id PK
        UUID tenant_id FK
        UUID user_id FK
        UUID folder_id FK
        String title
    }

    CHAT_MESSAGE {
        UUID id PK
        UUID session_id FK
        String role
        Text content
        JSON sources
    }
```

---

## 3.8 Table Specifications

### 3.8.1 Core Module Tables

#### Table: `tenants`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT uuid4 | Unique tenant identifier |
| name | VARCHAR(255) | NOT NULL | Organisation display name |
| domain | VARCHAR(255) | UNIQUE, NOT NULL | Unique domain slug |
| is_active | BOOLEAN | DEFAULT TRUE | Tenant active status |
| status | VARCHAR(20) | DEFAULT 'created' | Onboarding status (created, configured, active, suspended) |
| config | JSONB | DEFAULT {} | Tenant-specific configuration |
| max_users | INTEGER | DEFAULT 50 | User seat limit |
| max_storage_gb | INTEGER | DEFAULT 10 | Storage quota |
| created_at | TIMESTAMP | AUTO | Creation timestamp |
| updated_at | TIMESTAMP | AUTO | Last modification timestamp |

**Indexes**: `(domain)` UNIQUE, `(is_active)`, `(status)`

#### Table: `users` (extends Django AbstractBaseUser)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT uuid4 | Unique user identifier |
| tenant_id | UUID | FK → tenants.id, NULL | Parent tenant (NULL for Platform Owner) |
| email | VARCHAR(254) | UNIQUE, NOT NULL | Login email |
| username | VARCHAR(150) | NOT NULL | Display username |
| first_name | VARCHAR(150) | | User first name |
| last_name | VARCHAR(150) | | User last name |
| department_id | UUID | FK → departments.id, NULL | Legacy department reference |
| password | VARCHAR(128) | NOT NULL | Hashed password (bcrypt) |
| is_tenant_admin | BOOLEAN | DEFAULT FALSE | Tenant administrator flag |
| is_superuser | BOOLEAN | DEFAULT FALSE | Platform owner flag |
| is_active | BOOLEAN | DEFAULT TRUE | Account active status |
| clearance_level | INTEGER | DEFAULT 0 | Document classification clearance (0–5) |
| mfa_enabled | BOOLEAN | DEFAULT FALSE | Multi-factor authentication enabled |
| mfa_secret | VARCHAR(32) | NULL | TOTP shared secret |
| force_password_change | BOOLEAN | DEFAULT FALSE | Force password change on next login |
| failed_login_attempts | INTEGER | DEFAULT 0 | Consecutive failed login count |
| last_failed_login | TIMESTAMP | NULL | Last failed login timestamp |
| created_at | TIMESTAMP | AUTO | Account creation timestamp |
| updated_at | TIMESTAMP | AUTO | Last modification timestamp |

**Indexes**: `(email)` UNIQUE, `(tenant_id, is_active)`, `(tenant_id, department_id)`

#### Table: `org_units`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Unit identifier |
| tenant_id | UUID | FK → tenants.id | Parent tenant |
| name | VARCHAR(255) | NOT NULL | Unit display name |
| code | VARCHAR(50) | | Short code (unique per tenant when non-empty) |
| unit_type | VARCHAR(20) | DEFAULT 'department' | Type: company, division, department, team, cost_center, location |
| parent_id | UUID | FK → org_units.id, NULL | Parent unit (self-referential) |
| depth | INTEGER | DEFAULT 0 | Hierarchy depth (0 = root) |
| path | VARCHAR(1000) | | Materialised path for ordering |
| head_id | UUID | FK → users.id, NULL | Unit head |
| is_active | BOOLEAN | DEFAULT TRUE | Active status |
| metadata | JSONB | DEFAULT {} | Custom metadata |

**Indexes**: `(tenant_id, unit_type)`, `(tenant_id, parent_id)`, `(path)`
**Constraints**: MAX_DEPTH = 15; parent must belong to same tenant

#### Table: `org_unit_closure`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| ancestor_id | UUID | FK → org_units.id | Ancestor node |
| descendant_id | UUID | FK → org_units.id | Descendant node |
| depth | INTEGER | NOT NULL | Distance between ancestor and descendant (0 = self) |

**Indexes**: `(descendant_id, depth)`, `(ancestor_id, depth)`
**Constraints**: UNIQUE(ancestor_id, descendant_id)

### 3.8.2 RBAC Module Tables

#### Table: `roles`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Role identifier |
| tenant_id | UUID | FK → tenants.id | Owning tenant |
| name | VARCHAR(100) | NOT NULL | Role display name |
| description | TEXT | | Role description |
| parent_id | UUID | FK → roles.id, NULL | Parent role for hierarchy |
| level | INTEGER | DEFAULT 0 | Hierarchy level (0 = top) |
| is_system_role | BOOLEAN | DEFAULT FALSE | System-generated, non-deletable |
| is_active | BOOLEAN | DEFAULT TRUE | Active status |

**Indexes**: `(tenant_id, is_active)`, `(tenant_id, is_system_role)`
**Constraints**: UNIQUE(tenant_id, name); system roles cannot be modified/deleted

#### Table: `permissions`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Permission identifier |
| name | VARCHAR(200) | UNIQUE | Human-readable permission name |
| resource_type | VARCHAR(50) | NOT NULL | Resource category (document, user, role, rag, etc.) |
| action | VARCHAR(50) | NOT NULL | Action verb (create, read, update, delete, upload, query) |
| description | TEXT | | Explanation of what this permission grants |
| is_deny | BOOLEAN | DEFAULT FALSE | If TRUE, this is an explicit deny rule |
| conditions | JSONB | DEFAULT {} | ABAC condition object |

**Indexes**: `(resource_type, action)`, `(is_deny)`
**Constraints**: UNIQUE(resource_type, action, is_deny)

#### Table: `role_closure`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| ancestor_id | UUID | FK → roles.id | Ancestor role |
| descendant_id | UUID | FK → roles.id | Descendant role |
| depth | INTEGER | NOT NULL | Hierarchy distance |

**Indexes**: `(descendant_id, depth)`, `(ancestor_id)`
**Constraints**: UNIQUE(ancestor_id, descendant_id)

### 3.8.3 Document Module Tables

#### Table: `documents`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Document identifier |
| tenant_id | UUID | FK → tenants.id | Owning tenant |
| title | VARCHAR(500) | NOT NULL | Document title |
| file_path | VARCHAR(1000) | NOT NULL | Storage path |
| file_size | BIGINT | NOT NULL | File size in bytes |
| file_type | VARCHAR(20) | NOT NULL | File extension (.pdf, .docx, etc.) |
| uploaded_by_id | UUID | FK → users.id | Uploader reference |
| department_id | UUID | FK → departments.id, NULL | Legacy department association |
| classification_level | INTEGER | DEFAULT 0 | Security classification (0–5) |
| visibility_type | VARCHAR(20) | DEFAULT 'restricted' | public, restricted, or private |
| status | VARCHAR(20) | DEFAULT 'pending' | Processing status (pending, processing, completed, failed) |
| chunk_count | INTEGER | DEFAULT 0 | Number of vector chunks created |
| processing_error | TEXT | | Error message if processing failed |
| version | INTEGER | DEFAULT 1 | Current version number |
| is_deleted | BOOLEAN | DEFAULT FALSE | Soft delete flag |
| deleted_at | TIMESTAMP | NULL | Soft delete timestamp |

**Indexes**: `(tenant_id, status)`, `(tenant_id, visibility_type)`, `(uploaded_by_id)`

#### Table: `document_access`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Grant identifier |
| document_id | UUID | FK → documents.id | Target document |
| access_type | VARCHAR(20) | NOT NULL | Grant type: role, org_unit, user |
| role_id | UUID | FK → roles.id, NULL | Role reference (for type='role') |
| org_unit_id | UUID | FK → org_units.id, NULL | Org unit reference (for type='org_unit') |
| user_id | UUID | FK → users.id, NULL | User reference (for type='user') |
| permission_level | VARCHAR(10) | DEFAULT 'read' | read, write, or manage |
| include_descendants | BOOLEAN | DEFAULT FALSE | Cascade to descendant org units |
| granted_by_id | UUID | FK → users.id | Who created the grant |
| expires_at | TIMESTAMP | NULL | Optional expiration |

**Indexes**: `(document_id, access_type)`, `(role_id)`, `(org_unit_id)`, `(user_id)`

---
