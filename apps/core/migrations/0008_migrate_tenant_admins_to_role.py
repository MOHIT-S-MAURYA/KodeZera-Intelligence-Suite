"""
Data migration: convert legacy is_tenant_admin=True users to the
'Tenant Administrator' system role.

For each tenant that has at least one user with is_tenant_admin=True:
  1. Get-or-create the system 'Tenant Administrator' role.
  2. Assign all permissions to the role.
  3. Create a UserRole for each admin user who doesn't already have it.

This must run *before* the column is dropped.
"""
from django.db import migrations


def migrate_admins_forward(apps, schema_editor):
    User = apps.get_model('core', 'User')
    Role = apps.get_model('rbac', 'Role')
    Permission = apps.get_model('rbac', 'Permission')
    RolePermission = apps.get_model('rbac', 'RolePermission')
    UserRole = apps.get_model('rbac', 'UserRole')

    SYSTEM_ADMIN_ROLE_NAME = 'Tenant Administrator'

    admin_users = User.objects.filter(is_tenant_admin=True, tenant__isnull=False)
    tenant_ids = set(admin_users.values_list('tenant_id', flat=True))

    all_permissions = list(Permission.objects.all())

    for tenant_id in tenant_ids:
        # Get or create system admin role
        role, created = Role.objects.get_or_create(
            tenant_id=tenant_id,
            name=SYSTEM_ADMIN_ROLE_NAME,
            defaults={
                'description': 'Auto-created system administrator role with all permissions.',
                'is_system_role': True,
            },
        )
        if not created and not role.is_system_role:
            role.is_system_role = True
            role.save(update_fields=['is_system_role'])

        # Ensure the role has all permissions
        existing_perm_ids = set(
            RolePermission.objects.filter(role=role).values_list('permission_id', flat=True)
        )
        new_role_perms = [
            RolePermission(role=role, permission=p)
            for p in all_permissions
            if p.id not in existing_perm_ids
        ]
        if new_role_perms:
            RolePermission.objects.bulk_create(new_role_perms, ignore_conflicts=True)

        # Assign the role to each admin user in this tenant
        tenant_admins = admin_users.filter(tenant_id=tenant_id)
        for user in tenant_admins:
            UserRole.objects.get_or_create(user=user, role=role)


def migrate_admins_reverse(apps, schema_editor):
    """Reverse: mark users who hold the system admin role as is_tenant_admin=True."""
    User = apps.get_model('core', 'User')
    UserRole = apps.get_model('rbac', 'UserRole')

    admin_user_ids = UserRole.objects.filter(
        role__is_system_role=True,
        role__name='Tenant Administrator',
    ).values_list('user_id', flat=True)

    User.objects.filter(id__in=admin_user_ids).update(is_tenant_admin=True)


class Migration(migrations.Migration):
    dependencies = [
        ('core', '0007_add_local_llm_provider'),
        ('rbac', '0002_role_is_system_role'),
    ]

    operations = [
        migrations.RunPython(migrate_admins_forward, migrate_admins_reverse),
    ]
