"""
Serializers for the Document Management module.
"""
from rest_framework import serializers

from apps.documents.models import (
    Document, DocumentAccess, DocumentVersion,
    DocumentFolder, DocumentTag, DocumentTagAssignment,
)


# ── Document ─────────────────────────────────────────────────────────────

class DocumentSerializer(serializers.ModelSerializer):
    """Full read serializer for Document (list / detail)."""
    uploaded_by_name = serializers.CharField(source='uploaded_by.full_name', read_only=True)
    department_name = serializers.SerializerMethodField()
    folder_name = serializers.SerializerMethodField()
    current_version_number = serializers.SerializerMethodField()
    tags = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = [
            'id', 'title', 'description',
            'file_key', 'file_path', 'file_size', 'file_type',
            'original_filename', 'mime_type', 'content_hash',
            'page_count', 'language', 'author',
            'uploaded_by', 'uploaded_by_name',
            'department', 'department_name',
            'folder', 'folder_name',
            'classification_level', 'visibility_type',
            'status', 'processing_progress', 'processing_error',
            'chunk_count',
            'current_version_number',
            'tags',
            'is_deleted', 'deleted_at',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'uploaded_by', 'file_key', 'file_path',
            'file_size', 'file_type', 'original_filename',
            'mime_type', 'content_hash', 'page_count', 'language', 'author',
            'status', 'processing_progress', 'processing_error', 'chunk_count',
            'current_version_number', 'tags',
            'is_deleted', 'deleted_at',
            'created_at', 'updated_at',
        ]

    def get_department_name(self, obj):
        return obj.department.name if obj.department_id else None

    def get_folder_name(self, obj):
        return obj.folder.name if obj.folder_id else None

    def get_current_version_number(self, obj):
        if obj.current_version_id:
            return obj.current_version.version_number
        return 1

    def get_tags(self, obj):
        return list(
            obj.tag_assignments.select_related('tag')
            .values_list('tag__name', flat=True)
        )


class DocumentUploadSerializer(serializers.Serializer):
    """Serializer for document upload (multipart)."""
    file = serializers.FileField()
    title = serializers.CharField(max_length=500, required=False)
    description = serializers.CharField(required=False, default='')
    department = serializers.UUIDField(required=False, allow_null=True)
    folder = serializers.UUIDField(required=False, allow_null=True)
    classification_level = serializers.IntegerField(default=0, min_value=0, max_value=5)
    visibility_type = serializers.ChoiceField(
        choices=['public', 'restricted', 'private'], default='restricted',
    )


class DocumentUpdateSerializer(serializers.ModelSerializer):
    """Serializer for PATCH updates to document metadata."""

    class Meta:
        model = Document
        fields = ['title', 'description', 'department', 'folder',
                  'classification_level', 'visibility_type']


# ── DocumentVersion ──────────────────────────────────────────────────────

class DocumentVersionSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source='uploaded_by.full_name', read_only=True)

    class Meta:
        model = DocumentVersion
        fields = [
            'id', 'document', 'version_number',
            'file_key', 'file_size', 'content_hash',
            'original_filename', 'mime_type',
            'change_note', 'uploaded_by', 'uploaded_by_name',
            'created_at',
        ]
        read_only_fields = [
            'id', 'document', 'version_number',
            'file_key', 'file_size', 'content_hash',
            'original_filename', 'mime_type',
            'uploaded_by', 'created_at',
        ]


class DocumentVersionUploadSerializer(serializers.Serializer):
    """Upload a new version of an existing document."""
    file = serializers.FileField()
    change_note = serializers.CharField(max_length=500, required=False, default='')


# ── DocumentAccess ───────────────────────────────────────────────────────

class DocumentAccessSerializer(serializers.ModelSerializer):
    grantee_name = serializers.SerializerMethodField()

    class Meta:
        model = DocumentAccess
        fields = [
            'id', 'document', 'access_type',
            'role', 'org_unit', 'user',
            'permission_level', 'include_descendants',
            'granted_by', 'grantee_name',
            'expires_at', 'created_at',
        ]
        read_only_fields = ['id', 'granted_by', 'grantee_name', 'created_at']

    def get_grantee_name(self, obj):
        if obj.user_id:
            return obj.user.full_name
        if obj.role_id:
            return obj.role.name
        if obj.org_unit_id:
            return obj.org_unit.name
        return str(obj.access_id) if obj.access_id else ''

    def validate(self, attrs):
        request = self.context.get('request')
        if not request or not request.user:
            return attrs
        tenant = request.user.tenant

        document = attrs.get('document')
        role = attrs.get('role')
        org_unit = attrs.get('org_unit')
        user = attrs.get('user')

        from rest_framework.exceptions import PermissionDenied

        # 1. Ensure the document belongs to the requesting user's tenant
        if document and document.tenant != tenant:
            raise PermissionDenied("You cannot manage access for documents outside your tenant.")

        # 2. Ensure grantees belong to the same tenant
        if role and role.tenant != tenant:
            raise PermissionDenied("The specified role does not belong to your tenant.")
        if org_unit and org_unit.tenant != tenant:
            raise PermissionDenied("The specified department does not belong to your tenant.")
        if user and user.tenant != tenant:
            raise PermissionDenied("The specified user does not belong to your tenant.")

        return attrs


# ── DocumentFolder ───────────────────────────────────────────────────────

class DocumentFolderSerializer(serializers.ModelSerializer):
    document_count = serializers.SerializerMethodField()
    children_count = serializers.SerializerMethodField()

    class Meta:
        model = DocumentFolder
        fields = [
            'id', 'name', 'parent', 'owner', 'is_shared',
            'document_count', 'children_count', 'created_at',
        ]
        read_only_fields = ['id', 'owner', 'document_count', 'children_count', 'created_at']

    def get_document_count(self, obj):
        return obj.documents.filter(is_deleted=False).count()

    def get_children_count(self, obj):
        return obj.children.count()


# ── DocumentTag ──────────────────────────────────────────────────────────

class DocumentTagSerializer(serializers.ModelSerializer):

    class Meta:
        model = DocumentTag
        fields = ['id', 'name', 'color', 'category', 'created_at']
        read_only_fields = ['id', 'created_at']


class DocumentTagAssignmentSerializer(serializers.ModelSerializer):
    tag_name = serializers.CharField(source='tag.name', read_only=True)
    tag_color = serializers.CharField(source='tag.color', read_only=True)

    class Meta:
        model = DocumentTagAssignment
        fields = ['id', 'document', 'tag', 'tag_name', 'tag_color', 'assigned_by', 'created_at']
        read_only_fields = ['id', 'assigned_by', 'created_at']
