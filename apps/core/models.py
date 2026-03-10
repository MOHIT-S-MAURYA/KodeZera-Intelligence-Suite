"""
Core models for Kodezera Intelligence Suite.
Includes: Tenant, User, Department, AuditLog
"""
import uuid
from django.db import models
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.utils import timezone


class Tenant(models.Model):
    """
    Tenant model for multi-tenancy isolation.
    Every data record (except global tables) must belong to a tenant.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    slug = models.SlugField(max_length=100, unique=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'tenants'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['slug']),
            models.Index(fields=['is_active']),
        ]

    def __str__(self):
        return self.name


class Department(models.Model):
    """
    Department model with hierarchical structure.
    Supports unlimited nesting via parent_id.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name='departments'
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    parent = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='children'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'departments'
        ordering = ['name']
        unique_together = [['tenant', 'name', 'parent']]
        indexes = [
            models.Index(fields=['tenant', 'parent']),
        ]

    def __str__(self):
        return f"{self.tenant.name} - {self.name}"

    def get_ancestors(self):
        """Returns all parent departments up the hierarchy."""
        ancestors = []
        current = self.parent
        while current:
            ancestors.append(current)
            current = current.parent
        return ancestors

    def get_descendants(self):
        """Returns all child departments down the hierarchy."""
        descendants = []
        
        def collect_children(dept):
            for child in dept.children.all():
                descendants.append(child)
                collect_children(child)
        
        collect_children(self)
        return descendants


class UserManager(BaseUserManager):
    """Custom user manager for User model."""
    
    def create_user(self, email, password=None, **extra_fields):
        """Create and return a regular user."""
        if not email:
            raise ValueError('Users must have an email address')
        
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        """Create and return a superuser."""
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_active', True)
        
        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True')
        
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """
    Custom User model with tenant isolation.
    All users belong to a tenant (except superusers).
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name='users',
        null=True,
        blank=True  # Null for superusers only
    )
    username = models.CharField(max_length=150)
    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150, blank=True)
    department = models.ForeignKey(
        Department,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='users'
    )
    is_staff = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_login = models.DateTimeField(null=True, blank=True)
    profile_metadata = models.JSONField(default=dict, blank=True)

    # Enhanced org profile fields
    employee_id = models.CharField(max_length=50, blank=True, default='')
    job_title = models.CharField(max_length=200, blank=True, default='')
    manager = models.ForeignKey(
        'self', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='direct_reports',
    )
    clearance_level = models.PositiveIntegerField(
        default=0,
        help_text='Security clearance 0-5, matches document classification_level.',
    )
    EMPLOYMENT_TYPES = [
        ('full_time', 'Full Time'),
        ('part_time', 'Part Time'),
        ('contractor', 'Contractor'),
        ('intern', 'Intern'),
    ]
    employment_type = models.CharField(
        max_length=20, choices=EMPLOYMENT_TYPES, default='full_time',
    )
    hired_at = models.DateField(null=True, blank=True)

    # Authentication & security fields
    mfa_enabled = models.BooleanField(default=False)
    password_changed_at = models.DateTimeField(null=True, blank=True)
    force_password_change = models.BooleanField(default=False)
    failed_login_count = models.IntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']

    class Meta:
        db_table = 'users'
        ordering = ['-created_at']
        unique_together = [['tenant', 'username']]
        indexes = [
            models.Index(fields=['tenant', 'email']),
            models.Index(fields=['tenant', 'is_active']),
            models.Index(fields=['department']),
        ]

    def __str__(self):
        return f"{self.email} ({self.tenant.name if self.tenant else 'Superuser'})"

    @property
    def is_tenant_admin(self):
        """
        Dynamic replacement for the old BooleanField.
        Returns True if the user holds the system 'Tenant Administrator' role.
        Cached per-request via _is_tenant_admin_cache attribute.
        """
        cached = getattr(self, '_is_tenant_admin_cache', None)
        if cached is not None:
            return cached
        if not self.tenant_id:
            self._is_tenant_admin_cache = False
            return False
        from apps.rbac.services.authorization import RoleResolutionService
        result = RoleResolutionService.is_tenant_administrator(self)
        self._is_tenant_admin_cache = result
        return result

    @property
    def full_name(self):
        """Return the user's full name."""
        return f"{self.first_name} {self.last_name}".strip() or self.username

    def get_department_chain(self):
        """Returns all departments in the hierarchy including parent departments."""
        if not self.department:
            return []
        
        chain = [self.department]
        chain.extend(self.department.get_ancestors())
        return chain


class AuditLog(models.Model):
    """
    Audit log for tracking all critical operations.
    Captures who did what, when, and on which resource.
    """
    ACTION_CHOICES = [
        ('create', 'Create'),
        ('update', 'Update'),
        ('delete', 'Delete'),
        ('read', 'Read'),
        ('login', 'Login'),
        ('logout', 'Logout'),
        ('upload', 'Upload'),
        ('download', 'Download'),
        ('query', 'Query'),
        ('grant_access', 'Grant Access'),
        ('revoke_access', 'Revoke Access'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name='audit_logs',
        null=True,
        blank=True
    )
    user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_logs'
    )
    action = models.CharField(max_length=50, choices=ACTION_CHOICES)
    resource_type = models.CharField(max_length=100)
    resource_id = models.UUIDField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'audit_logs'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'created_at']),
            models.Index(fields=['user', 'created_at']),
            models.Index(fields=['resource_type', 'resource_id']),
            models.Index(fields=['action']),
        ]

    def __str__(self):
        return f"{self.user} - {self.action} - {self.resource_type} at {self.created_at}"


# Platform Owner Models - Subscription & Billing

from django.core.validators import MinValueValidator
from decimal import Decimal


class SubscriptionPlan(models.Model):
    """Subscription plans for tenants (Basic, Pro, Enterprise)"""
    
    PLAN_TYPES = [
        ('basic', 'Basic'),
        ('pro', 'Pro'),
        ('enterprise', 'Enterprise'),
    ]
    
    name = models.CharField(max_length=50, unique=True)
    plan_type = models.CharField(max_length=20, choices=PLAN_TYPES)
    description = models.TextField(blank=True)
    
    # Limits
    max_users = models.IntegerField(validators=[MinValueValidator(1)])
    max_storage_gb = models.IntegerField(validators=[MinValueValidator(1)])
    max_queries_per_month = models.IntegerField(validators=[MinValueValidator(1)])
    max_tokens_per_month = models.IntegerField(validators=[MinValueValidator(1)])
    
    # Pricing
    price_monthly = models.DecimalField(
        max_digits=10, 
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))]
    )
    
    # Features
    features = models.JSONField(default=list, blank=True)
    
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'subscription_plans'
        ordering = ['price_monthly']
        
    def __str__(self):
        return f"{self.name} (${self.price_monthly}/month)"


class TenantSubscription(models.Model):
    """Tenant subscription status and billing information"""
    
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('suspended', 'Suspended'),
        ('cancelled', 'Cancelled'),
        ('trial', 'Trial'),
    ]
    
    tenant = models.OneToOneField(
        Tenant,
        on_delete=models.CASCADE,
        related_name='subscription'
    )
    plan = models.ForeignKey(
        SubscriptionPlan,
        on_delete=models.PROTECT,
        related_name='subscriptions'
    )
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='trial')
    
    # Billing period
    current_period_start = models.DateTimeField()
    current_period_end = models.DateTimeField()
    
    # Payment
    last_payment_date = models.DateTimeField(null=True, blank=True)
    next_payment_date = models.DateTimeField(null=True, blank=True)
    payment_method = models.CharField(max_length=50, blank=True)
    
    # Tracking
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        db_table = 'tenant_subscriptions'
        
    def __str__(self):
        return f"{self.tenant.name} - {self.plan.name} ({self.status})"


class UsageMetrics(models.Model):
    """Daily usage metrics for each tenant"""
    
    tenant = models.ForeignKey(
        Tenant,
        on_delete=models.CASCADE,
        related_name='usage_metrics'
    )
    
    date = models.DateField()
    
    # Query metrics
    queries_count = models.IntegerField(default=0)
    failed_queries_count = models.IntegerField(default=0)
    avg_response_time_ms = models.FloatField(default=0.0)
    
    # Token usage
    tokens_used = models.IntegerField(default=0)
    embedding_tokens = models.IntegerField(default=0)
    completion_tokens = models.IntegerField(default=0)
    
    # Storage
    storage_used_bytes = models.BigIntegerField(default=0)
    documents_count = models.IntegerField(default=0)
    
    # Activity
    active_users_count = models.IntegerField(default=0)
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'usage_metrics'
        unique_together = ['tenant', 'date']
        ordering = ['-date']
        indexes = [
            models.Index(fields=['tenant', '-date']),
            models.Index(fields=['date']),
        ]
        
    def __str__(self):
        return f"{self.tenant.name} - {self.date}"


class SystemAuditLog(models.Model):
    """Platform-level audit logs for owner actions"""
    
    ACTION_TYPES = [
        ('tenant_created', 'Tenant Created'),
        ('tenant_updated', 'Tenant Updated'),
        ('tenant_suspended', 'Tenant Suspended'),
        ('tenant_activated', 'Tenant Activated'),
        ('tenant_deleted', 'Tenant Deleted'),
        ('plan_changed', 'Subscription Plan Changed'),
        ('service_restarted', 'Service Restarted'),
        ('config_updated', 'System Configuration Updated'),
        ('emergency_access_granted', 'Emergency Access Granted'),
        ('emergency_access_revoked', 'Emergency Access Revoked'),
        ('platform_overview_viewed', 'Platform Overview Viewed'),
    ]
    
    action = models.CharField(max_length=50, choices=ACTION_TYPES)
    performed_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        related_name='platform_actions'
    )
    
    # Affected resources
    tenant_affected = models.ForeignKey(
        Tenant,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='system_audit_logs'
    )
    
    # Additional context
    details = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    
    timestamp = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'system_audit_logs'
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['-timestamp']),
            models.Index(fields=['action']),
            models.Index(fields=['performed_by', '-timestamp']),
            models.Index(fields=['tenant_affected', '-timestamp']),
        ]
        
    def __str__(self):
        user = self.performed_by.email if self.performed_by else 'System'
        return f"{self.action} by {user} at {self.timestamp}"


class AIProviderConfig(models.Model):
    """
    Singleton model for platform-wide AI provider configuration.
    Platform Owner can update this from the UI to switch between
    OpenAI, HuggingFace, Anthropic, and Ollama without touching .env.
    Only one row is ever created (enforced via get_or_create in service layer).
    """

    LLM_PROVIDERS = [
        ('openai',       'OpenAI'),
        ('huggingface',  'HuggingFace Inference API'),
        ('anthropic',    'Anthropic'),
        ('ollama',       'Ollama (Local)'),
        ('local',        'Local Transformers (No API key)'),
    ]

    EMBEDDING_PROVIDERS = [
        ('openai',               'OpenAI'),
        ('huggingface',          'HuggingFace Inference API'),
        ('sentence_transformers','Sentence Transformers (Local)'),
    ]

    # ── LLM settings ──────────────────────────────────────────
    llm_provider = models.CharField(
        max_length=30, choices=LLM_PROVIDERS, default='openai',
        help_text='Which LLM provider to use for chat responses.'
    )
    llm_model = models.CharField(
        max_length=200, default='gpt-3.5-turbo',
        help_text='Model identifier, e.g. gpt-4, mistralai/Mistral-7B-Instruct-v0.1, llama3'
    )
    llm_api_key = models.CharField(
        max_length=500, blank=True, default='',
        help_text='API key for the LLM provider (stored in DB, shown masked in UI).'
    )
    llm_api_base = models.CharField(
        max_length=500, blank=True, default='',
        help_text='Custom API base URL (required for Ollama, optional for HuggingFace endpoints).'
    )

    # ── Embedding settings ────────────────────────────────────
    embedding_provider = models.CharField(
        max_length=30, choices=EMBEDDING_PROVIDERS, default='openai',
        help_text='Which provider to use for document/query embeddings.'
    )
    embedding_model = models.CharField(
        max_length=200, default='text-embedding-3-small',
        help_text='Embedding model identifier.'
    )
    embedding_api_key = models.CharField(
        max_length=500, blank=True, default='',
        help_text='API key for the embedding provider (can differ from LLM key).'
    )
    embedding_api_base = models.CharField(
        max_length=500, blank=True, default='',
        help_text='Custom API base URL for the embedding provider.'
    )

    # ── Rate / token limits ───────────────────────────────────
    max_tokens_per_request = models.IntegerField(
        default=1000, help_text='Maximum tokens in a single LLM response.'
    )
    requests_per_minute = models.IntegerField(
        default=60, help_text='Global rate limit for LLM requests.'
    )

    # ── Metadata ──────────────────────────────────────────────
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        'User', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='ai_config_updates'
    )

    class Meta:
        db_table = 'ai_provider_config'
        verbose_name = 'AI Provider Configuration'

    def __str__(self):
        return f"AI Config: LLM={self.llm_provider}/{self.llm_model}, Embed={self.embedding_provider}/{self.embedding_model}"

    @classmethod
    def get_config(cls):
        """
        Return the singleton config, creating it with defaults if it doesn't exist.
        Always use this method instead of objects.first() to avoid None checks.
        """
        config, _ = cls.objects.get_or_create(id=1)
        return config

    def llm_api_key_masked(self) -> str:
        """Return masked key for display in the UI."""
        if not self.llm_api_key:
            return ''
        return self.llm_api_key[:6] + '***' + self.llm_api_key[-2:]

    def embedding_api_key_masked(self) -> str:
        """Return masked embedding key for display in the UI."""
        if not self.embedding_api_key:
            return ''
        return self.embedding_api_key[:6] + '***' + self.embedding_api_key[-2:]


class SupportTicket(models.Model):
    """
    Support tickets created by users and managed by platform owners.
    """
    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('medium', 'Medium'),
        ('high', 'High'),
        ('critical', 'Critical'),
    ]
    STATUS_CHOICES = [
        ('open', 'Open'),
        ('in_progress', 'In Progress'),
        ('resolved', 'Resolved'),
    ]

    CATEGORY_CHOICES = [
        ('bug', 'Bug / Error'),
        ('feature', 'Feature Request'),
        ('access', 'Access Issue'),
        ('performance', 'Performance Problem'),
        ('data', 'Data Issue'),
        ('other', 'Other'),
    ]

    id = models.CharField(max_length=20, primary_key=True, editable=False)
    subject = models.CharField(max_length=255)
    description = models.TextField()
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES, default='other')
    # Stores auto-captured context: tenant_id, user_id, page_url, browser, timestamp
    context_info = models.JSONField(default=dict, blank=True)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='support_tickets', null=True, blank=True)
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='support_tickets')
    
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='medium')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='open')
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'support_tickets'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', 'status']),
            models.Index(fields=['created_by']),
        ]

    def save(self, *args, **kwargs):
        if not self.id:
            # Generate a simple ticket ID like T-1001
            last_ticket = SupportTicket.objects.order_by('-created_at').first()
            if last_ticket and last_ticket.id.startswith('T-'):
                try:
                    last_num = int(last_ticket.id.split('-')[1])
                    self.id = f"T-{last_num + 1}"
                except ValueError:
                    self.id = f"T-1001"
            else:
                self.id = "T-1001"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"[{self.id}] {self.subject} ({self.status})"


class Notification(models.Model):
    """
    Targeted notification system inspired by Workday architecture.

    Notifications are sent only to the users who need them:
      - user-level:       specific user (e.g. "Your account was created")
      - department-level:  all users in a department (e.g. "New HR document uploaded")
      - role-level:        all users with a specific role
      - tenant-level:      all users in the tenant (e.g. admin broadcast)

    The (target_type, target_id) pair identifies the audience.
    Each row in NotificationReceipt tracks per-user read state.
    """

    CATEGORY_CHOICES = [
        ('user_management', 'User Management'),
        ('document', 'Document'),
        ('role', 'Role & Permission'),
        ('department', 'Department'),
        ('system', 'System'),
    ]

    TARGET_TYPE_CHOICES = [
        ('user', 'Specific User'),
        ('department', 'Department'),
        ('role', 'Role'),
        ('tenant', 'Entire Tenant'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name='notifications',
    )
    title = models.CharField(max_length=255)
    message = models.TextField()
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES, default='system')

    # Targeting — who should see this notification
    target_type = models.CharField(max_length=20, choices=TARGET_TYPE_CHOICES)
    target_id = models.UUIDField(
        help_text='UUID of the user / department / role / tenant this targets.',
    )

    # Who triggered it
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='created_notifications',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'notifications'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['tenant', '-created_at']),
            models.Index(fields=['target_type', 'target_id']),
        ]

    def __str__(self):
        return f"[{self.category}] {self.title}"


class NotificationReceipt(models.Model):
    """
    Per-user read/dismiss state for a notification.
    Created lazily when the notification list is fetched,
    or eagerly by the notification service for user-targeted ones.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    notification = models.ForeignKey(
        Notification, on_delete=models.CASCADE, related_name='receipts',
    )
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name='notification_receipts',
    )
    is_read = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'notification_receipts'
        unique_together = [['notification', 'user']]
        indexes = [
            models.Index(fields=['user', 'is_read', '-created_at']),
        ]


# ─── Organisation Hierarchy (Closure Table Pattern) ──────────────────────────


class OrgUnit(models.Model):
    """
    Unified organisational unit supporting multiple hierarchy types.
    Replaces the flat Department model with a typed, closure-table-backed tree.
    """
    ORG_UNIT_TYPES = [
        ('company', 'Company'),
        ('division', 'Division'),
        ('department', 'Department'),
        ('team', 'Team'),
        ('cost_center', 'Cost Center'),
        ('location', 'Location'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(
        Tenant, on_delete=models.CASCADE, related_name='org_units',
    )
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=50, blank=True, default='')
    description = models.TextField(blank=True, default='')
    unit_type = models.CharField(max_length=20, choices=ORG_UNIT_TYPES, default='department')
    parent = models.ForeignKey(
        'self', on_delete=models.CASCADE, null=True, blank=True,
        related_name='children',
    )
    depth = models.PositiveIntegerField(default=0)
    path = models.CharField(max_length=1000, blank=True, default='')
    sibling_order = models.PositiveIntegerField(default=0)
    head = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='headed_units',
    )
    is_active = models.BooleanField(default=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    MAX_DEPTH = 15

    class Meta:
        db_table = 'org_units'
        ordering = ['path', 'sibling_order', 'name']
        indexes = [
            models.Index(fields=['tenant', 'unit_type']),
            models.Index(fields=['tenant', 'parent']),
            models.Index(fields=['tenant', 'depth']),
            models.Index(fields=['tenant', 'is_active']),
            models.Index(fields=['path']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['tenant', 'code'],
                condition=~models.Q(code=''),
                name='unique_org_unit_code_per_tenant',
            ),
        ]

    def __str__(self):
        return f"{self.name} ({self.get_unit_type_display()})"

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.parent and self.parent.depth >= self.MAX_DEPTH - 1:
            raise ValidationError(
                f'Maximum hierarchy depth of {self.MAX_DEPTH} exceeded.'
            )
        if self.parent and self.parent.tenant_id != self.tenant_id:
            raise ValidationError('Parent must belong to the same tenant.')


class OrgUnitClosure(models.Model):
    """
    Closure table for O(1) subtree and ancestor queries.
    Every ancestor-descendant pair is stored as a row.
    Self-referencing row (depth=0) included for each node.
    """
    ancestor = models.ForeignKey(
        OrgUnit, on_delete=models.CASCADE, related_name='descendant_links',
    )
    descendant = models.ForeignKey(
        OrgUnit, on_delete=models.CASCADE, related_name='ancestor_links',
    )
    depth = models.PositiveIntegerField()

    class Meta:
        db_table = 'org_unit_closure'
        unique_together = [['ancestor', 'descendant']]
        indexes = [
            models.Index(fields=['ancestor', 'depth']),
            models.Index(fields=['descendant', 'depth']),
        ]

    def __str__(self):
        return f"{self.ancestor.name} -> {self.descendant.name} (depth={self.depth})"


class UserOrgUnit(models.Model):
    """
    User membership in org units. Supports multi-membership.
    One membership is marked as primary (for default context).
    """
    MEMBERSHIP_TYPES = [
        ('primary', 'Primary'),
        ('secondary', 'Secondary'),
        ('temporary', 'Temporary'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name='org_memberships',
    )
    org_unit = models.ForeignKey(
        OrgUnit, on_delete=models.CASCADE, related_name='members',
    )
    membership_type = models.CharField(
        max_length=20, choices=MEMBERSHIP_TYPES, default='primary',
    )
    started_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'user_org_units'
        unique_together = [['user', 'org_unit']]
        indexes = [
            models.Index(fields=['user', 'is_active']),
            models.Index(fields=['org_unit', 'is_active']),
            models.Index(fields=['expires_at']),
        ]

    def __str__(self):
        return f"{self.user.email} -> {self.org_unit.name} ({self.membership_type})"

    def __str__(self):
        return f"{self.user.email} — {self.notification.title} ({'read' if self.is_read else 'unread'})"


# ─── Authentication & Session Models ────────────────────────────────────────

class UserSession(models.Model):
    """Tracks active login sessions per device."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sessions')
    refresh_token_jti = models.CharField(max_length=64, unique=True, db_index=True)
    device_fingerprint = models.CharField(max_length=128, blank=True, default='')
    device_name = models.CharField(max_length=255, blank=True, default='')
    ip_address = models.GenericIPAddressField()
    location = models.CharField(max_length=255, blank=True, default='')
    is_active = models.BooleanField(default=True)
    last_active_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    class Meta:
        db_table = 'user_sessions'
        ordering = ['-last_active_at']
        indexes = [
            models.Index(fields=['user', 'is_active']),
            models.Index(fields=['expires_at']),
        ]

    def __str__(self):
        return f"{self.user.email} — {self.device_name} ({self.ip_address})"

    @property
    def is_expired(self):
        return timezone.now() >= self.expires_at


class LoginAttempt(models.Model):
    """Track login attempts for lockout and anomaly detection."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(db_index=True)
    ip_address = models.GenericIPAddressField()
    user_agent = models.TextField(blank=True, default='')
    success = models.BooleanField()
    failure_reason = models.CharField(max_length=50, blank=True, default='')
    mfa_method = models.CharField(max_length=20, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'login_attempts'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['email', 'created_at']),
            models.Index(fields=['ip_address', 'created_at']),
        ]

    def __str__(self):
        status = 'OK' if self.success else self.failure_reason
        return f"{self.email} — {status} — {self.created_at}"


class PasswordHistory(models.Model):
    """Stores hashed previous passwords to prevent reuse."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='password_history')
    password_hash = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'password_history'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.email} — {self.created_at}"


class MFADevice(models.Model):
    """User's registered MFA devices."""
    MFA_TYPES = [
        ('totp', 'TOTP'),
        ('webauthn', 'WebAuthn'),
        ('email', 'Email OTP'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='mfa_devices')
    device_type = models.CharField(max_length=20, choices=MFA_TYPES)
    name = models.CharField(max_length=100, default='')
    secret = models.TextField(blank=True, default='')
    is_primary = models.BooleanField(default=False)
    is_verified = models.BooleanField(default=False)
    last_used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'mfa_devices'
        indexes = [
            models.Index(fields=['user', 'device_type']),
        ]

    def __str__(self):
        return f"{self.user.email} — {self.device_type} — {self.name}"


class PasswordResetToken(models.Model):
    """Short-lived OTP for password reset flow."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='password_reset_tokens')
    otp_hash = models.CharField(max_length=128)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'password_reset_tokens'
        indexes = [
            models.Index(fields=['user', 'is_used']),
        ]

    def __str__(self):
        return f"Reset for {self.user.email} — expires {self.expires_at}"

    @property
    def is_expired(self):
        return timezone.now() >= self.expires_at


class TenantSSOConfig(models.Model):
    """Per-tenant SSO configuration."""
    SSO_PROVIDERS = [
        ('saml', 'SAML 2.0'),
        ('oidc', 'OpenID Connect'),
    ]
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.OneToOneField(Tenant, on_delete=models.CASCADE, related_name='sso_config')
    provider_type = models.CharField(max_length=10, choices=SSO_PROVIDERS)
    entity_id = models.URLField(blank=True, default='')
    login_url = models.URLField(blank=True, default='')
    certificate = models.TextField(blank=True, default='')
    role_mapping = models.JSONField(default=dict, blank=True)
    auto_provision = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'tenant_sso_configs'

    def __str__(self):
        return f"{self.tenant.name} — {self.provider_type}"

