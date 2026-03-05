import os, sys, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
sys.path.insert(0, '/Users/mohitmaurya/dev/internship')
django.setup()

from apps.core.models import Tenant, User, Department, AuditLog
from apps.rbac.models import Role, Permission, UserRole, RolePermission
from apps.documents.models import Document
from apps.rag.models import ChatSession, ChatMessage

print("=== DB Row Counts ===")
print(f"Tenants:      {Tenant.objects.count()}")
print(f"Users:        {User.objects.count()}")
print(f"Departments:  {Department.objects.count()}")
print(f"Roles:        {Role.objects.count()}")
print(f"Permissions:  {Permission.objects.count()}")
print(f"UserRoles:    {UserRole.objects.count()}")
print(f"RolePerms:    {RolePermission.objects.count()}")
print(f"Documents:    {Document.objects.count()}")
print(f"AuditLogs:    {AuditLog.objects.count()}")
print(f"ChatSessions: {ChatSession.objects.count()}")
print(f"ChatMessages: {ChatMessage.objects.count()}")

print("\n=== Tenants & Admins ===")
for t in Tenant.objects.all():
    admins = list(User.objects.filter(tenant=t, is_tenant_admin=True).values_list('email', flat=True))
    users_count = User.objects.filter(tenant=t).count()
    print(f"  {t.name} | id={t.id} | active={t.is_active} | users={users_count} | admins={admins}")

print("\n=== Superusers ===")
for u in User.objects.filter(is_superuser=True):
    print(f"  {u.email} | tenant={u.tenant}")

print("\n=== Recent AuditLogs (last 5) ===")
for a in AuditLog.objects.order_by('-created_at')[:5]:
    print(f"  {a.created_at:%Y-%m-%d %H:%M} | action={a.action} | resource={a.resource_type} | user={a.user_id} | tenant={a.tenant_id}")

print("\n=== Roles breakdown ===")
for r in Role.objects.select_related('tenant').all():
    uc = UserRole.objects.filter(role=r).count()
    pc = RolePermission.objects.filter(role=r).count()
    print(f"  [{r.tenant.name}] {r.name} | users={uc} perms={pc} parent={r.parent_id}")
