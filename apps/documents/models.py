"""
Document management models.
Includes: Document, DocumentAccess
"""
import uuid
from django.db import models
from apps.core.models import Tenant, User, Department, OrgUnit
from apps.rbac.models import Role


class Document(models.Model):
    """
    Document model with classification and visibility controls.
    """
    VISIBILITY_CHOICES = [
        ('public', 'Public'),
        ('restricted', 'Restricted'),
        ('private', 'Private'),
    ]

    STATUS_CHOICES = [
        ('pending', 'Pending Processing'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name='documents'
    )
    title = models.CharField(max_length=500)
    file_path = models.CharField(max_length=1000)
    file_size = models.BigIntegerField(default=0)
    file_type = models.CharField(max_length=100, blank=True)
    uploaded_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name='uploaded_documents'
    )
    department = models.ForeignKey(
        Department,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='documents'
    )
    classification_level = models.IntegerField(
        default=0,
        help_text='0=Public, 1-5=Increasing restriction levels'
    )
    visibility_type = models.CharField(
        max_length=20,
        choices=VISIBILITY_CHOICES,
        default='restricted'
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending'
    )
    processing_error = models.TextField(blank=True)
    chunk_count = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'documents'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'status']),
            models.Index(fields=['tenant', 'visibility_type']),
            models.Index(fields=['department']),
            models.Index(fields=['uploaded_by']),
            models.Index(fields=['classification_level']),
        ]

    def __str__(self):
        return f"{self.title} ({self.tenant.name})"


class DocumentAccess(models.Model):
    """
    Access control for documents with proper FK references.
    Can grant access to roles, org units, or individual users.
    Only one of role/org_unit/user FK should be non-null based on access_type.
    """
    ACCESS_TYPE_CHOICES = [
        ('role', 'Role'),
        ('department', 'Department'),  # Legacy — use org_unit
        ('org_unit', 'Org Unit'),
        ('user', 'User'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        related_name='access_grants'
    )
    access_type = models.CharField(max_length=20, choices=ACCESS_TYPE_CHOICES)
    # Legacy polymorphic field — kept for backward compat during migration
    access_id = models.UUIDField(
        help_text='UUID of the role, department, or user',
        null=True, blank=True,
    )
    # Proper FK references (new)
    role = models.ForeignKey(
        Role, on_delete=models.CASCADE, null=True, blank=True,
        related_name='document_grants',
    )
    org_unit = models.ForeignKey(
        OrgUnit, on_delete=models.CASCADE, null=True, blank=True,
        related_name='document_grants',
    )
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, null=True, blank=True,
        related_name='document_user_grants',
    )
    include_descendants = models.BooleanField(
        default=True,
        help_text='For org_unit grants: include child units?',
    )
    granted_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name='granted_accesses'
    )
    expires_at = models.DateTimeField(
        null=True, blank=True,
        help_text='Time-bound access. Null = permanent.',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'document_access'
        indexes = [
            models.Index(fields=['document', 'access_type']),
            models.Index(fields=['role']),
            models.Index(fields=['org_unit']),
            models.Index(fields=['user']),
            models.Index(fields=['expires_at']),
        ]

    def __str__(self):
        return f"{self.document.title} - {self.access_type}"
