"""
Data migration: Build RoleClosure table from existing Role parent relationships.
"""
from django.db import migrations


def forwards(apps, schema_editor):
    Role = apps.get_model('rbac', 'Role')
    RoleClosure = apps.get_model('rbac', 'RoleClosure')

    for role in Role.objects.all():
        # Self-reference
        RoleClosure.objects.create(
            ancestor=role, descendant=role, depth=0,
        )
        # Walk up parent chain
        current = role.parent
        d = 1
        visited = set()
        while current and current.id not in visited:
            RoleClosure.objects.create(
                ancestor=current, descendant=role, depth=d,
            )
            visited.add(current.id)
            current = current.parent
            d += 1


def backwards(apps, schema_editor):
    RoleClosure = apps.get_model('rbac', 'RoleClosure')
    RoleClosure.objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ('rbac', '0003_org_rbac_redesign'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
