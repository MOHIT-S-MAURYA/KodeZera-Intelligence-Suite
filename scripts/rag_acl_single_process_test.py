import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django

django.setup()

from django.contrib.auth.hashers import make_password
from django.utils import timezone

from apps.core.models import Department, Tenant, User
from apps.documents.models import Document, DocumentAccess
from apps.documents.services.access import DocumentAccessService
from apps.documents.tasks import process_document_task
from apps.rag.services.rag_query import RAGQueryService
from apps.rbac.models import Role, UserRole


def ensure_user(tenant, email, first_name, last_name, password, department=None):
    username = email.split("@")[0]
    user, created = User.objects.get_or_create(
        email=email,
        defaults={
            "username": username,
            "tenant": tenant,
            "first_name": first_name,
            "last_name": last_name,
            "department": department,
            "is_active": True,
            "password": make_password(password),
        },
    )
    if not created:
        user.first_name = first_name
        user.last_name = last_name
        user.tenant = tenant
        user.department = department
        user.is_active = True
        user.password = make_password(password)
        user.save(
            update_fields=[
                "first_name",
                "last_name",
                "tenant",
                "department",
                "is_active",
                "password",
                "updated_at",
            ]
        )
    return user


def ensure_role(tenant, name, description):
    role, _ = Role.objects.get_or_create(
        tenant=tenant,
        name=name,
        defaults={"description": description, "is_system_role": False},
    )
    return role


def assign_role(user, role, assigned_by):
    UserRole.objects.update_or_create(
        user=user,
        role=role,
        defaults={"is_active": True, "assigned_by": assigned_by, "expires_at": None},
    )


def create_doc(tenant, owner, title, body, suffix):
    base = Path("/tmp") / f"rag_acl_{suffix}"
    base.mkdir(parents=True, exist_ok=True)
    path = base / f"{title}.txt"
    path.write_text(body, encoding="utf-8")

    doc = Document.objects.create(
        tenant=tenant,
        title=title,
        file_path=str(path),
        file_key="",
        file_size=path.stat().st_size,
        file_type=".txt",
        original_filename=path.name,
        mime_type="text/plain",
        uploaded_by=owner,
        department=owner.department,
        visibility_type="restricted",
        status="pending",
    )
    return doc


def add_access(doc, access_type, granted_by, role=None, user=None):
    access_id = None
    if role is not None:
        access_id = role.id
    if user is not None:
        access_id = user.id

    DocumentAccess.objects.create(
        document=doc,
        access_type=access_type,
        access_id=access_id,
        role=role,
        user=user,
        permission_level="read",
        include_descendants=True,
        granted_by=granted_by,
    )
    DocumentAccessService.invalidate_document_cache(doc.id)


def process_doc_sync(doc):
    process_document_task.run(str(doc.id))
    doc.refresh_from_db()
    return doc.status, doc.processing_error


def query_sources(user, question):
    service = RAGQueryService()
    result = service.query(user=user, question=question)
    return [s.get("title") for s in (result.get("sources") or [])]


def main():
    suffix = str(int(timezone.now().timestamp()))[-6:]
    password = "TestPass123!"

    tenant = Tenant.objects.filter(is_active=True).exclude(slug="test-tenant").first() or Tenant.objects.filter(is_active=True).first()
    if tenant is None:
        raise RuntimeError("No active tenant found.")

    admin = User.objects.filter(email="admin@acmecorp.com").first()
    if admin is None:
        admin = User.objects.filter(tenant=tenant, is_superuser=False).first()
    if admin is None:
        raise RuntimeError("No tenant admin-like user found.")

    finance_dept, _ = Department.objects.get_or_create(tenant=tenant, name=f"Finance-{suffix}", defaults={"description": "ACL test"})
    hr_dept, _ = Department.objects.get_or_create(tenant=tenant, name=f"HR-{suffix}", defaults={"description": "ACL test"})

    finance_role = ensure_role(tenant, f"FinanceRole-{suffix}", "ACL test finance role")
    hr_role = ensure_role(tenant, f"HRRole-{suffix}", "ACL test hr role")

    finance_user = ensure_user(tenant, f"finance.{suffix}@demo.local", "Finance", "User", password, finance_dept)
    hr_user = ensure_user(tenant, f"hr.{suffix}@demo.local", "HR", "User", password, hr_dept)
    direct_user = ensure_user(tenant, f"direct.{suffix}@demo.local", "Direct", "User", password, hr_dept)

    assign_role(finance_user, finance_role, admin)
    assign_role(hr_user, hr_role, admin)

    finance_doc = create_doc(
        tenant,
        admin,
        f"FinanceRoleSecret-{suffix}",
        f"Budget key RAGFIN-{suffix} available only for finance role grants.",
        suffix,
    )
    hr_doc = create_doc(
        tenant,
        admin,
        f"HRRoleSecret-{suffix}",
        f"HR policy key RAGHR-{suffix} available only for HR role grants.",
        suffix,
    )
    user_doc = create_doc(
        tenant,
        admin,
        f"UserSecret-{suffix}",
        f"Private key RAGUSER-{suffix} available only for direct user grants.",
        suffix,
    )

    add_access(finance_doc, "role", admin, role=finance_role)
    add_access(hr_doc, "role", admin, role=hr_role)
    add_access(user_doc, "user", admin, user=direct_user)

    statuses = {
        finance_doc.title: process_doc_sync(finance_doc),
        hr_doc.title: process_doc_sync(hr_doc),
        user_doc.title: process_doc_sync(user_doc),
    }

    users = [
        ("finance_user", finance_user),
        ("hr_user", hr_user),
        ("direct_user", direct_user),
    ]

    matrix = []
    for key, u in users:
        accessible = list(DocumentAccessService.get_accessible_documents(u).values_list("title", flat=True))

        src_fin = query_sources(u, f"What is the key code RAGFIN-{suffix}?")
        src_hr = query_sources(u, f"What is the key code RAGHR-{suffix}?")
        src_user = query_sources(u, f"What is the key code RAGUSER-{suffix}?")

        matrix.append(
            {
                "user": key,
                "email": u.email,
                "accessible_titles": sorted(accessible),
                "rag_finance_role_sources": src_fin,
                "rag_hr_role_sources": src_hr,
                "rag_user_sources": src_user,
            }
        )

    output = {
        "mode": "single_process_backend",
        "suffix": suffix,
        "tenant": {"id": str(tenant.id), "name": tenant.name, "slug": tenant.slug},
        "created": {
            "departments": [finance_dept.name, hr_dept.name],
            "roles": [finance_role.name, hr_role.name],
            "users": [finance_user.email, hr_user.email, direct_user.email],
            "documents": [finance_doc.title, hr_doc.title, user_doc.title],
            "processed_status": {
                k: {"status": v[0], "error": v[1]} for k, v in statuses.items()
            },
        },
        "matrix": matrix,
    }

    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
