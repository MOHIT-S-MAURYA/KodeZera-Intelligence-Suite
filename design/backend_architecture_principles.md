# Backend Architecture Principles

This document defines the non-negotiable backend design constraints for the Kodezera Intelligence Suite.

## 1. Multi-Tenant Isolation

- Tenant-scoped models must include a tenant reference.
- Tenant-facing data access must be filtered by the authenticated tenant context.
- Cross-tenant reads and writes are forbidden unless explicitly part of platform-owner operations.

## 2. Dynamic Authorization

- Access control must be derived from persisted role and permission data.
- Avoid hardcoded role-name checks in business logic.
- Permission checks must execute server-side for all protected operations.

## 3. Retrieval Safety for RAG

RAG query flow must enforce this order:

1. Resolve user identity and permissions.
2. Resolve accessible document IDs.
3. Apply tenant and document filters in vector retrieval.
4. Generate response only from authorized context.

## 4. Layered Architecture

The backend follows a modular monolith architecture:

- API Layer (DRF views/serializers)
- Application Services Layer (business workflows)
- Domain Layer (models + invariants)
- Infrastructure Layer (PostgreSQL, Redis, Qdrant, Celery)

## 5. Security and Compliance Baseline

- Authentication via JWT.
- Audit logging for sensitive write operations and RAG queries.
- Plan-aware throttling and quota enforcement on expensive endpoints.
- Structured error responses for predictable API contracts.

## 6. Operational Standards

- Health endpoints required for deployment probes.
- Environment-specific settings managed through explicit environment profiles.
- CI checks should include lint/test/build validation for backend and frontend.
