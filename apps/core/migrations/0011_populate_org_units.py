"""
Data migration: Populate OrgUnit from existing Department data,
build OrgUnitClosure table, and create UserOrgUnit primary memberships.
"""
from django.db import migrations


def forwards(apps, schema_editor):
    Department = apps.get_model('core', 'Department')
    OrgUnit = apps.get_model('core', 'OrgUnit')
    OrgUnitClosure = apps.get_model('core', 'OrgUnitClosure')
    UserOrgUnit = apps.get_model('core', 'UserOrgUnit')
    User = apps.get_model('core', 'User')

    # ── Step 1: Create OrgUnit for each Department ────────────────────────
    dept_to_org = {}  # dept.id -> OrgUnit.id

    # Process root depts first (no parent), then children
    all_depts = list(Department.objects.all().order_by('parent_id'))
    roots = [d for d in all_depts if d.parent_id is None]
    children = [d for d in all_depts if d.parent_id is not None]

    def get_depth(dept, memo={}):
        if dept.id in memo:
            return memo[dept.id]
        if dept.parent_id is None:
            memo[dept.id] = 0
            return 0
        parent = Department.objects.get(id=dept.parent_id)
        memo[dept.id] = get_depth(parent, memo) + 1
        return memo[dept.id]

    def get_path(dept):
        parts = [dept.name]
        current = dept
        while current.parent_id:
            current = Department.objects.get(id=current.parent_id)
            parts.insert(0, current.name)
        return '/'.join(parts)

    for dept in roots:
        org_unit = OrgUnit.objects.create(
            id=dept.id,  # Reuse UUID for easy FK migration
            tenant_id=dept.tenant_id,
            name=dept.name,
            description=dept.description,
            unit_type='department',
            parent=None,
            depth=0,
            path=dept.name,
            sibling_order=0,
            is_active=True,
        )
        dept_to_org[dept.id] = org_unit.id

    # Process children level by level
    remaining = list(children)
    max_iterations = 100
    iteration = 0
    while remaining and iteration < max_iterations:
        iteration += 1
        still_remaining = []
        for dept in remaining:
            if dept.parent_id in dept_to_org:
                parent_org_id = dept_to_org[dept.parent_id]
                parent_org = OrgUnit.objects.get(id=parent_org_id)
                org_unit = OrgUnit.objects.create(
                    id=dept.id,
                    tenant_id=dept.tenant_id,
                    name=dept.name,
                    description=dept.description,
                    unit_type='department',
                    parent=parent_org,
                    depth=parent_org.depth + 1,
                    path=f"{parent_org.path}/{dept.name}",
                    sibling_order=0,
                    is_active=True,
                )
                dept_to_org[dept.id] = org_unit.id
            else:
                still_remaining.append(dept)
        remaining = still_remaining

    # ── Step 2: Build OrgUnitClosure table ────────────────────────────────
    for org_unit in OrgUnit.objects.all():
        # Self-reference
        OrgUnitClosure.objects.create(
            ancestor=org_unit, descendant=org_unit, depth=0,
        )
        # Walk up parent chain
        current = org_unit.parent
        d = 1
        visited = set()
        while current and current.id not in visited:
            OrgUnitClosure.objects.create(
                ancestor=current, descendant=org_unit, depth=d,
            )
            visited.add(current.id)
            current = current.parent
            d += 1

    # ── Step 3: Create UserOrgUnit for each User with a department ────────
    for user in User.objects.filter(department__isnull=False):
        if user.department_id in dept_to_org:
            org_unit_id = dept_to_org[user.department_id]
            UserOrgUnit.objects.create(
                user=user,
                org_unit_id=org_unit_id,
                membership_type='primary',
                is_active=True,
            )


def backwards(apps, schema_editor):
    # Clear migrated data (schema rollback will drop tables anyway)
    OrgUnitClosure = apps.get_model('core', 'OrgUnitClosure')
    UserOrgUnit = apps.get_model('core', 'UserOrgUnit')
    OrgUnit = apps.get_model('core', 'OrgUnit')
    UserOrgUnit.objects.all().delete()
    OrgUnitClosure.objects.all().delete()
    OrgUnit.objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [
        ('core', '0010_org_rbac_redesign'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
