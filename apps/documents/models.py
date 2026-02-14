"""
Document management models.
Includes: Document, DocumentAccess
"""
import uuid
from django.db import models
from apps.core.models import Tenant, User, Department
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
    Polymorphic access control for documents.
    Can grant access to roles, departments, or individual users.
    """
    ACCESS_TYPE_CHOICES = [
        ('role', 'Role'),
        ('department', 'Department'),
        ('user', 'User'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        related_name='access_grants'
    )
    access_type = models.CharField(max_length=20, choices=ACCESS_TYPE_CHOICES)
    access_id = models.UUIDField(
        help_text='UUID of the role, department, or user'
    )
    granted_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name='granted_accesses'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'document_access'
        unique_together = [['document', 'access_type', 'access_id']]
        indexes = [
            models.Index(fields=['document', 'access_type', 'access_id']),
            models.Index(fields=['access_type', 'access_id']),
        ]

    def __str__(self):
        return f"{self.document.title} - {self.access_type}:{self.access_id}"

    def get_access_entity(self):
        """Returns the actual entity (Role, Department, or User) this grant refers to."""
        if self.access_type == 'role':
            return Role.objects.filter(id=self.access_id).first()
        elif self.access_type == 'department':
            return Department.objects.filter(id=self.access_id).first()
        elif self.access_type == 'user':
            return User.objects.filter(id=self.access_id).first()
        return None
