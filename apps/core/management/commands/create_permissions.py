"""
Management command to create initial permissions.
"""
from django.core.management.base import BaseCommand
from apps.rbac.models import Permission


class Command(BaseCommand):
    help = 'Create initial system permissions'

    def handle(self, *args, **kwargs):
        """Create all system permissions."""
        permissions = [
            # Document permissions
            ('view_document', 'document', 'read', 'View documents'),
            ('create_document', 'document', 'create', 'Create documents'),
            ('update_document', 'document', 'update', 'Update documents'),
            ('delete_document', 'document', 'delete', 'Delete documents'),
            ('upload_document', 'document', 'upload', 'Upload documents'),
            ('download_document', 'document', 'download', 'Download documents'),
            ('share_document', 'document', 'share', 'Share documents'),
            ('manage_document_access', 'document', 'manage', 'Manage document access'),
            
            # Role permissions
            ('view_role', 'role', 'read', 'View roles'),
            ('create_role', 'role', 'create', 'Create roles'),
            ('update_role', 'role', 'update', 'Update roles'),
            ('delete_role', 'role', 'delete', 'Delete roles'),
            ('manage_role', 'role', 'manage', 'Manage roles'),
            
            # User permissions
            ('view_user', 'user', 'read', 'View users'),
            ('create_user', 'user', 'create', 'Create users'),
            ('update_user', 'user', 'update', 'Update users'),
            ('delete_user', 'user', 'delete', 'Delete users'),
            ('manage_user', 'user', 'manage', 'Manage users'),
            
            # Department permissions
            ('view_department', 'department', 'read', 'View departments'),
            ('create_department', 'department', 'create', 'Create departments'),
            ('update_department', 'department', 'update', 'Update departments'),
            ('delete_department', 'department', 'delete', 'Delete departments'),
            
            # RAG permissions
            ('query_rag', 'document', 'query', 'Query RAG system'),
            
            # Audit log permissions
            ('view_audit_log', 'audit_log', 'read', 'View audit logs'),
        ]
        
        created_count = 0
        for name, resource_type, action, description in permissions:
            permission, created = Permission.objects.get_or_create(
                name=name,
                defaults={
                    'resource_type': resource_type,
                    'action': action,
                    'description': description
                }
            )
            if created:
                created_count += 1
                self.stdout.write(
                    self.style.SUCCESS(f'Created permission: {name}')
                )
        
        self.stdout.write(
            self.style.SUCCESS(f'Successfully created {created_count} permissions')
        )
