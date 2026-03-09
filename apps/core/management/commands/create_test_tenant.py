"""
Management command to create a test tenant with sample data.
"""
from django.core.management.base import BaseCommand
from django.utils.text import slugify
from apps.core.models import Tenant, User, Department
from apps.rbac.models import Role, Permission, RolePermission, UserRole


class Command(BaseCommand):
    help = 'Create a test tenant with sample data'

    def add_arguments(self, parser):
        parser.add_argument('--name', type=str, default='Demo Organization', help='Tenant name')
        parser.add_argument('--admin-email', type=str, default='admin@demo.com', help='Admin email')
        parser.add_argument('--admin-password', type=str, default='admin123', help='Admin password')

    def handle(self, *args, **kwargs):
        """Create test tenant with sample data."""
        tenant_name = kwargs['name']
        admin_email = kwargs['admin_email']
        admin_password = kwargs['admin_password']
        
        # Create tenant
        tenant, created = Tenant.objects.get_or_create(
            slug=slugify(tenant_name),
            defaults={'name': tenant_name, 'is_active': True}
        )
        
        if created:
            self.stdout.write(self.style.SUCCESS(f'Created tenant: {tenant_name}'))
        else:
            self.stdout.write(self.style.WARNING(f'Tenant already exists: {tenant_name}'))
        
        # Create departments
        engineering, _ = Department.objects.get_or_create(
            tenant=tenant,
            name='Engineering',
            parent=None
        )
        
        backend, _ = Department.objects.get_or_create(
            tenant=tenant,
            name='Backend Team',
            parent=engineering
        )
        
        frontend, _ = Department.objects.get_or_create(
            tenant=tenant,
            name='Frontend Team',
            parent=engineering
        )
        
        self.stdout.write(self.style.SUCCESS('Created departments'))
        
        # Create roles
        admin_role, _ = Role.objects.get_or_create(
            tenant=tenant,
            name=Role.SYSTEM_ADMIN_ROLE_NAME,
            defaults={
                'description': 'System-created administrator role with full access.',
                'is_system_role': True,
            }
        )
        
        manager_role, _ = Role.objects.get_or_create(
            tenant=tenant,
            name='Manager',
            defaults={'description': 'Team manager', 'parent': admin_role}
        )
        
        developer_role, _ = Role.objects.get_or_create(
            tenant=tenant,
            name='Developer',
            defaults={'description': 'Software developer', 'parent': manager_role}
        )
        
        self.stdout.write(self.style.SUCCESS('Created roles'))
        
        # Assign all permissions to admin role
        all_permissions = Permission.objects.all()
        for permission in all_permissions:
            RolePermission.objects.get_or_create(
                role=admin_role,
                permission=permission
            )
        
        # Assign document permissions to developer role
        doc_permissions = Permission.objects.filter(resource_type='document')
        for permission in doc_permissions:
            RolePermission.objects.get_or_create(
                role=developer_role,
                permission=permission
            )
        
        self.stdout.write(self.style.SUCCESS('Assigned permissions to roles'))
        
        # Create admin user
        admin_user, created = User.objects.get_or_create(
            email=admin_email,
            defaults={
                'username': 'admin',
                'tenant': tenant,
                'is_active': True,
                'first_name': 'Admin',
                'last_name': 'User'
            }
        )
        
        if created:
            admin_user.set_password(admin_password)
            admin_user.save()
            self.stdout.write(self.style.SUCCESS(f'Created admin user: {admin_email}'))
        else:
            self.stdout.write(self.style.WARNING(f'Admin user already exists: {admin_email}'))
        
        # Assign admin role to admin user
        UserRole.objects.get_or_create(
            user=admin_user,
            role=admin_role
        )
        
        # Create sample users
        dev_user, created = User.objects.get_or_create(
            email='developer@demo.com',
            defaults={
                'username': 'developer',
                'tenant': tenant,
                'department': backend,
                'is_active': True,
                'first_name': 'John',
                'last_name': 'Developer'
            }
        )
        
        if created:
            dev_user.set_password('dev123')
            dev_user.save()
            UserRole.objects.get_or_create(user=dev_user, role=developer_role)
            self.stdout.write(self.style.SUCCESS('Created developer user'))
        
        self.stdout.write(
            self.style.SUCCESS(f'\n✅ Test tenant setup complete!')
        )
        self.stdout.write(f'Tenant: {tenant_name}')
        self.stdout.write(f'Admin: {admin_email} / {admin_password}')
        self.stdout.write(f'Developer: developer@demo.com / dev123')
