"""
Document management models.
Includes: Document, DocumentVersion, DocumentAccess, DocumentFolder,
          DocumentTag, DocumentTagAssignment
"""
import uuid
from django.db import models
from apps.core.models import Tenant, User, Department, OrgUnit
from apps.rbac.models import Role


# ── DocumentFolder ───────────────────────────────────────────────────────

class DocumentFolder(models.Model):
    """Nested folder structure for organising documents within a tenant."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='document_folders')
    name = models.CharField(max_length=255)
    parent = models.ForeignKey(
        'self', on_delete=models.SET_NULL, null=True, blank=True, related_name='children',
    )
    owner = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='owned_folders')
    is_shared = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'document_folders'
        unique_together = [['tenant', 'name', 'parent']]
        ordering = ['name']

    def __str__(self):
        return self.name


# ── Document ─────────────────────────────────────────────────────────────

class Document(models.Model):
    """
    Document model with classification, visibility, versioning and soft-delete.
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
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='documents')
    title = models.CharField(max_length=500)
    description = models.TextField(blank=True, default='')

    # Storage — file_key replaces the legacy absolute file_path
    file_path = models.CharField(max_length=1000, blank=True, default='')
    file_key = models.CharField(
        max_length=500, blank=True, default='',
        help_text='Storage key (e.g. tenant_id/YYYY/MM/sha256prefix/uuid.ext)',
    )
    file_size = models.BigIntegerField(default=0)
    file_type = models.CharField(max_length=100, blank=True)
    original_filename = models.CharField(max_length=500, blank=True, default='')
    content_hash = models.CharField(
        max_length=64, blank=True, default='',
        help_text='SHA-256 hex digest of the file content',
    )
    mime_type = models.CharField(max_length=255, blank=True, default='')

    # Metadata
    page_count = models.IntegerField(default=0)
    language = models.CharField(max_length=10, blank=True, default='')
    author = models.CharField(max_length=255, blank=True, default='')

    # Ownership / organisation
    uploaded_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name='uploaded_documents',
    )
    department = models.ForeignKey(
        Department, on_delete=models.SET_NULL, null=True, blank=True, related_name='documents',
    )
    folder = models.ForeignKey(
        DocumentFolder, on_delete=models.SET_NULL, null=True, blank=True, related_name='documents',
    )

    # Classification & visibility
    classification_level = models.IntegerField(
        default=0, help_text='0=Public, 1-5=Increasing restriction levels',
    )
    visibility_type = models.CharField(max_length=20, choices=VISIBILITY_CHOICES, default='restricted')

    # Processing
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    processing_error = models.TextField(blank=True)
    processing_progress = models.IntegerField(
        default=0, help_text='0-100 percent of processing completed',
    )
    chunk_count = models.IntegerField(default=0)

    # Versioning
    current_version = models.OneToOneField(
        'DocumentVersion', on_delete=models.SET_NULL,
        null=True, blank=True, related_name='+',
    )

    # Soft delete
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)

    # Retention
    retention_until = models.DateTimeField(
        null=True, blank=True,
        help_text='Do not permanently delete before this date.',
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'documents'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'status']),
            models.Index(fields=['tenant', 'visibility_type']),
            models.Index(fields=['tenant', 'is_deleted']),
            models.Index(fields=['department']),
            models.Index(fields=['uploaded_by']),
            models.Index(fields=['classification_level']),
            models.Index(fields=['folder']),
            models.Index(fields=['content_hash']),
        ]

    def __str__(self):
        return f"{self.title} ({self.tenant.name})"


# ── DocumentVersion ──────────────────────────────────────────────────────

class DocumentVersion(models.Model):
    """Immutable snapshot of a document file at a point in time."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='versions')
    version_number = models.PositiveIntegerField()
    file_key = models.CharField(max_length=500)
    file_size = models.BigIntegerField(default=0)
    content_hash = models.CharField(max_length=64, blank=True, default='')
    original_filename = models.CharField(max_length=500, blank=True, default='')
    mime_type = models.CharField(max_length=255, blank=True, default='')
    change_note = models.CharField(max_length=500, blank=True, default='')
    uploaded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'document_versions'
        unique_together = [['document', 'version_number']]
        ordering = ['-version_number']

    def __str__(self):
        return f"{self.document.title} v{self.version_number}"


# ── DocumentAccess ───────────────────────────────────────────────────────

class DocumentAccess(models.Model):
    """
    Access control for documents with proper FK references.
    Can grant access to roles, org units, or individual users.
    Only one of role/org_unit/user FK should be non-null per row.
    """
    ACCESS_TYPE_CHOICES = [
        ('role', 'Role'),
        ('department', 'Department'),  # Legacy — use org_unit
        ('org_unit', 'Org Unit'),
        ('user', 'User'),
    ]

    PERMISSION_LEVELS = [
        ('read', 'Read'),
        ('write', 'Write'),
        ('manage', 'Manage'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='access_grants')
    access_type = models.CharField(max_length=20, choices=ACCESS_TYPE_CHOICES)
    # Legacy polymorphic field — kept for backward compat during migration
    access_id = models.UUIDField(
        help_text='UUID of the role, department, or user',
        null=True, blank=True,
    )
    # Proper FK references
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
    permission_level = models.CharField(
        max_length=10, choices=PERMISSION_LEVELS, default='read',
    )
    include_descendants = models.BooleanField(
        default=True, help_text='For org_unit grants: include child units?',
    )
    granted_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name='granted_accesses',
    )
    expires_at = models.DateTimeField(
        null=True, blank=True, help_text='Time-bound access. Null = permanent.',
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
        return f"{self.document.title} - {self.access_type} ({self.permission_level})"


# ── DocumentTag ──────────────────────────────────────────────────────────

class DocumentTag(models.Model):
    """Tenant-scoped tag for categorising documents."""
    TAG_CATEGORIES = [
        ('manual', 'Manual'),
        ('auto', 'Auto-classified'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='document_tags')
    name = models.CharField(max_length=100)
    color = models.CharField(max_length=7, default='#6366f1')
    category = models.CharField(max_length=10, choices=TAG_CATEGORIES, default='manual')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'document_tags'
        unique_together = [['tenant', 'name']]
        ordering = ['name']

    def __str__(self):
        return self.name


class DocumentTagAssignment(models.Model):
    """M2M through table linking documents to tags."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name='tag_assignments')
    tag = models.ForeignKey(DocumentTag, on_delete=models.CASCADE, related_name='assignments')
    assigned_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'document_tag_assignments'
        unique_together = [['document', 'tag']]

    def __str__(self):
        return f"{self.document.title} → {self.tag.name}"
