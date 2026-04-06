# Kodezera Intelligence Suite Database Schema Reference

This document summarizes the logical data model by application area.
It is intended for architecture review, onboarding, and ERD generation.

## Conventions

- Primary keys are shown explicitly.
- Relationship targets are included in foreign key descriptions.
- Field lists are representative and should be validated against live models for migrations in progress.

## 1. Core (System and Multi-Tenancy)

This app handles the fundamental multi-tenant architecture, user management, subscriptions, and system-wide logging.

- **Tenant** (The root entity for organizational isolation)
  - `id` (UUIDField) [Primary Key]
  - `name` (CharField) [max_length=255]
  - `domain` (CharField) [UNIQUE, max_length=255]
  - `is_active` (BooleanField)
  - `created_at` (DateTimeField)
  - `updated_at` (DateTimeField)

- **Department** (Organizational hierarchy within a tenant)
  - `id` (UUIDField) [Primary Key]
  - `tenant` (ForeignKey to `Tenant`)
  - `name` (CharField) [max_length=255]
  - `parent` (ForeignKey to `Department`) [Self-referential, allows hierarchical nesting]
  - `created_at` (DateTimeField)
  - `updated_at` (DateTimeField)

- **User** (Custom user model extending Django's auth)
  - `id` (UUIDField) [Primary Key]
  - `tenant` (ForeignKey to `Tenant`)
  - `username` (CharField) [max_length=150]
  - `email` (EmailField) [UNIQUE]
  - `first_name` (CharField) [max_length=150]
  - `last_name` (CharField) [max_length=150]
  - `department` (ForeignKey to `Department`)
  - `password` (CharField) [max_length=128]
  - `is_tenant_admin` (BooleanField)
  - `is_superuser` (BooleanField)
  - `is_staff` (BooleanField)
  - `is_active` (BooleanField)
  - `created_at`, `updated_at`, `last_login` (DateTimeField)

- **SubscriptionPlan** (System-wide available plans)
  - `id` (BigAutoField) [Primary Key]
  - `name` (CharField) [UNIQUE]
  - `plan_type` (CharField) [CHOICES]
  - `max_users`, `max_storage_gb`, `max_queries_per_month`, `max_tokens_per_month` (IntegerField)
  - `price_monthly` (DecimalField)
  - `features` (JSONField)
  - `is_active` (BooleanField)

- **TenantSubscription** (Mapping a tenant to a plan)
  - `id` (BigAutoField) [Primary Key]
  - `tenant` (ForeignKey to `Tenant`)
  - `plan` (ForeignKey to `SubscriptionPlan`)
  - `status` (CharField) [CHOICES]
  - `current_period_start`, `current_period_end` (DateTimeField)
  - `last_payment_date`, `next_payment_date`, `cancelled_at` (DateTimeField)
  - `payment_method` (CharField)

- **UsageMetrics** (Tenant resource tracking)
  - `id` (BigAutoField) [Primary Key]
  - `tenant` (ForeignKey to `Tenant`)
  - `date` (DateField)
  - `queries_count`, `failed_queries_count`, `tokens_used`, `embedding_tokens`, `completion_tokens` (IntegerField)
  - `avg_response_time_ms` (FloatField)
  - `storage_used_bytes` (BigIntegerField)
  - `documents_count`, `active_users_count` (IntegerField)

- **AuditLog** (Tenant-specific activity logging)
  - `id` (UUIDField) [Primary Key]
  - `tenant` (ForeignKey to `Tenant`)
  - `user` (ForeignKey to `User`)
  - `action` (CharField) [CHOICES]
  - `resource_type` (CharField)
  - `resource_id` (UUIDField) [NULLable]
  - `metadata` (JSONField)
  - `ip_address` (GenericIPAddressField)
  - `user_agent` (TextField)

- **SystemAuditLog** (Platform-Owner global logging)
  - `id` (BigAutoField) [Primary Key]
  - `action` (CharField) [CHOICES]
  - `performed_by` (ForeignKey to `User`)
  - `tenant_affected` (ForeignKey to `Tenant`)
  - `details` (JSONField)
  - `ip_address`, `user_agent`, `timestamp`

---

## 2. RBAC (Role-Based Access Control)

Handles the dynamic roles and granular permissions engine.

- **Role** (Customizable roles within a tenant)
  - `id` (UUIDField) [Primary Key]
  - `tenant` (ForeignKey to `Tenant`)
  - `name` (CharField) [max_length=100]
  - `description` (TextField)
  - `parent` (ForeignKey to `Role`) [Self-referential, allows inherited hierarchies]

- **Permission** (Global system permissions)
  - `id` (UUIDField) [Primary Key]
  - `name` (CharField) [UNIQUE]
  - `resource_type` (CharField) [CHOICES]
  - `action` (CharField) [CHOICES]
  - `description` (TextField)

- **RolePermission** (Junction mapping Roles to Permissions)
  - `id` (UUIDField) [Primary Key]
  - `role` (ForeignKey to `Role`)
  - `permission` (ForeignKey to `Permission`)

- **UserRole** (Junction mapping Users to Roles)
  - `id` (UUIDField) [Primary Key]
  - `user` (ForeignKey to `User`)
  - `role` (ForeignKey to `Role`)

---

## 3. Documents (Document Management)

Handles file metadata, parsing status, and polymorphic access overrides.

- **Document**
  - `id` (UUIDField) [Primary Key]
  - `tenant` (ForeignKey to `Tenant`)
  - `title` (CharField) [max_length=500]
  - `file_path` (CharField) [max_length=1000]
  - `file_size` (BigIntegerField)
  - `file_type` (CharField)
  - `uploaded_by` (ForeignKey to `User`)
  - `department` (ForeignKey to `Department`) [NULLable]
  - `classification_level` (IntegerField)
  - `visibility_type` (CharField) [CHOICES: public, restricted, private]
  - `status` (CharField) [CHOICES: pending, processing, completed, failed]
  - `chunk_count` (IntegerField)
  - `processing_error` (TextField)

- **DocumentAccess** (Explicit permission overrides for restricted documents)
  - `id` (UUIDField) [Primary Key]
  - `document` (ForeignKey to `Document`)
  - `access_type` (CharField) [CHOICES: 'role', 'department', 'user']
  - `access_id` (UUIDField) [Stores the ID of the role, department, or user]
  - `granted_by` (ForeignKey to `User`)

---

## 4. RAG (Retrieval-Augmented Generation)

Handles vector indexing metadata and the conversational AI chat tracking system.

- **VectorChunk** (Maps Django DB records to the Qdrant Vector DB)
  - `id` (UUIDField) [Primary Key]
  - `document` (ForeignKey to `Document`)
  - `chunk_index` (IntegerField)
  - `vector_id` (CharField) [UNIQUE] [Maps to the exact Qdrant PointStruct ID]
  - `text_preview` (TextField)
  - `token_count` (IntegerField)

- **ChatFolder** (ChatGPT-style folders for organizing conversations)
  - `id` (UUIDField) [Primary Key]
  - `tenant` (ForeignKey to `Tenant`) [NULLable for Platform Owner usage]
  - `user` (ForeignKey to `User`)
  - `name` (CharField) [max_length=255]
  - `created_at`, `updated_at` (DateTimeField)

- **ChatSession** (Individual conversation threads)
  - `id` (UUIDField) [Primary Key]
  - `tenant` (ForeignKey to `Tenant`) [NULLable for Platform Owner usage]
  - `user` (ForeignKey to `User`)
  - `folder` (ForeignKey to `ChatFolder`) [NULLable]
  - `title` (CharField) [max_length=255]
  - `created_at`, `updated_at` (DateTimeField)

- **ChatMessage** (Line items inside a chat session)
  - `id` (UUIDField) [Primary Key]
  - `session` (ForeignKey to `ChatSession`)
  - `role` (CharField) [CHOICES: 'user', 'assistant']
  - `content` (TextField)
  - `sources` (JSONField) [Stores retrieved chunks & citations used by the LLM]
  - `created_at` (DateTimeField)
