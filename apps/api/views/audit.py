"""
Views for the Audit Logging & Compliance module.

Tenant admin endpoints:   /api/audit/*
Platform owner endpoints: /api/platform/audit/*
"""
from datetime import timedelta

from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.api.permissions import IsTenantAdmin
from apps.core.permissions import IsPlatformOwner
from apps.api.serializers.audit import (
    AuditEventDetailSerializer,
    AuditEventListSerializer,
    AuditExportRequestSerializer,
    AuditRetentionPolicySerializer,
    ComplianceLogSerializer,
    DataDeletionLogSerializer,
    DataDeletionStatusUpdateSerializer,
    SecurityAlertListSerializer,
    SecurityAlertUpdateSerializer,
)
from apps.core.models import (
    AuditEvent,
    AuditRetentionPolicy,
    SecurityAlert,
)
from apps.core.services.audit_service import AuditService
from apps.core.services.compliance import (
    ComplianceService,
    DataDeletionService,
    ExportService,
    RetentionService,
)
from apps.core.services.hash_chain import HashChainService


# ═══════════════════════════════════════════════════════════════════════════
# Tenant admin audit endpoints
# ═══════════════════════════════════════════════════════════════════════════

@api_view(['GET'])
@permission_classes([IsAuthenticated, IsTenantAdmin])
def audit_events_list(request):
    """List audit events for the current tenant with filters."""
    tenant_id = request.user.tenant_id

    events, total = AuditService.get_events(
        tenant_id=tenant_id,
        action=request.query_params.get('action'),
        resource_type=request.query_params.get('resource_type'),
        user_id=request.query_params.get('user_id'),
        outcome=request.query_params.get('outcome'),
        date_from=request.query_params.get('date_from'),
        date_to=request.query_params.get('date_to'),
        search=request.query_params.get('search'),
        limit=int(request.query_params.get('limit', 50)),
        offset=int(request.query_params.get('offset', 0)),
    )

    serializer = AuditEventListSerializer(events, many=True)
    return Response({'count': total, 'results': serializer.data})


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsTenantAdmin])
def audit_event_detail(request, event_id):
    """Get full details for a single audit event."""
    event = AuditService.get_event_detail(event_id, tenant_id=request.user.tenant_id)
    if not event:
        return Response({'error': 'Event not found'}, status=status.HTTP_404_NOT_FOUND)
    serializer = AuditEventDetailSerializer(event)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsTenantAdmin])
def audit_events_export(request):
    """Export audit events as CSV or JSON."""
    ser = AuditExportRequestSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    data = ser.validated_data

    fmt = data.get('format', 'csv')
    tenant_id = request.user.tenant_id

    if fmt == 'csv':
        csv_content = ExportService.export_csv(
            tenant_id=tenant_id,
            date_from=data.get('date_from'),
            date_to=data.get('date_to'),
        )
        response = HttpResponse(csv_content, content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="audit_events.csv"'
        return response
    else:
        json_data = ExportService.export_json(
            tenant_id=tenant_id,
            date_from=data.get('date_from'),
            date_to=data.get('date_to'),
        )
        return Response(json_data)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsTenantAdmin])
def audit_security_alerts(request):
    """List security alerts for the current tenant."""
    tenant_id = request.user.tenant_id
    qs = SecurityAlert.objects.filter(tenant_id=tenant_id)

    severity = request.query_params.get('severity')
    alert_status = request.query_params.get('status')
    if severity:
        qs = qs.filter(severity=severity)
    if alert_status:
        qs = qs.filter(status=alert_status)

    limit = int(request.query_params.get('limit', 50))
    offset = int(request.query_params.get('offset', 0))
    total = qs.count()
    alerts = qs.order_by('-created_at')[offset:offset + limit]

    serializer = SecurityAlertListSerializer(alerts, many=True)
    return Response({'count': total, 'results': serializer.data})


@api_view(['PATCH'])
@permission_classes([IsAuthenticated, IsTenantAdmin])
def audit_security_alert_update(request, alert_id):
    """Update a security alert's status (acknowledge, resolve, false positive)."""
    try:
        alert = SecurityAlert.objects.get(id=alert_id, tenant_id=request.user.tenant_id)
    except SecurityAlert.DoesNotExist:
        return Response({'error': 'Alert not found'}, status=status.HTTP_404_NOT_FOUND)

    ser = SecurityAlertUpdateSerializer(data=request.data)
    ser.is_valid(raise_exception=True)

    alert.status = ser.validated_data['status']
    alert.resolution_notes = ser.validated_data.get('resolution_notes', '')
    if alert.status in ('resolved', 'false_positive'):
        alert.resolved_by = request.user
        alert.resolved_at = timezone.now()
    alert.save()

    return Response(SecurityAlertListSerializer(alert).data)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsTenantAdmin])
def audit_compliance_records(request):
    """List GDPR Art 30 processing records for the current tenant."""
    records = ComplianceService.get_records(request.user.tenant_id)
    serializer = ComplianceLogSerializer(records, many=True)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsTenantAdmin])
def audit_compliance_report(request):
    """Generate a compliance report for the current tenant."""
    report = ComplianceService.generate_compliance_report(request.user.tenant_id)
    return Response(report)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsTenantAdmin])
def audit_stats(request):
    """Get audit statistics for the tenant dashboard."""
    days = int(request.query_params.get('days', 7))
    stats = AuditService.get_stats(tenant_id=request.user.tenant_id, days=days)
    return Response(stats)


# ═══════════════════════════════════════════════════════════════════════════
# Platform owner audit endpoints
# ═══════════════════════════════════════════════════════════════════════════

@api_view(['GET'])
@permission_classes([IsAuthenticated, IsPlatformOwner])
def platform_audit_events(request):
    """List audit events across all tenants (platform owner view)."""
    events, total = AuditService.get_events(
        tenant_id=request.query_params.get('tenant_id'),
        scope=request.query_params.get('scope'),
        action=request.query_params.get('action'),
        resource_type=request.query_params.get('resource_type'),
        user_id=request.query_params.get('user_id'),
        outcome=request.query_params.get('outcome'),
        date_from=request.query_params.get('date_from'),
        date_to=request.query_params.get('date_to'),
        search=request.query_params.get('search'),
        limit=int(request.query_params.get('limit', 50)),
        offset=int(request.query_params.get('offset', 0)),
    )

    serializer = AuditEventListSerializer(events, many=True)
    return Response({'count': total, 'results': serializer.data})


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsPlatformOwner])
def platform_audit_event_detail(request, event_id):
    """Get full details for a single audit event (platform-wide access)."""
    event = AuditService.get_event_detail(event_id)
    if not event:
        return Response({'error': 'Event not found'}, status=status.HTTP_404_NOT_FOUND)
    serializer = AuditEventDetailSerializer(event)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsPlatformOwner])
def platform_audit_verify_chain(request):
    """Verify the audit hash chain integrity."""
    limit = int(request.data.get('limit', 1000))
    offset = int(request.data.get('offset', 0))
    result = HashChainService.verify_chain(limit=limit, offset=offset)
    return Response(result)


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsPlatformOwner])
def platform_audit_export(request):
    """Export audit events across all tenants."""
    ser = AuditExportRequestSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    data = ser.validated_data

    fmt = data.get('format', 'csv')

    if fmt == 'csv':
        csv_content = ExportService.export_csv(
            scope=data.get('scope'),
            date_from=data.get('date_from'),
            date_to=data.get('date_to'),
        )
        response = HttpResponse(csv_content, content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="platform_audit_events.csv"'
        return response
    else:
        json_data = ExportService.export_json(
            scope=data.get('scope'),
            date_from=data.get('date_from'),
            date_to=data.get('date_to'),
        )
        return Response(json_data)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsPlatformOwner])
def platform_security_alerts(request):
    """List security alerts across all tenants."""
    qs = SecurityAlert.objects.select_related('tenant', 'resolved_by')

    tenant_id = request.query_params.get('tenant_id')
    severity = request.query_params.get('severity')
    alert_status = request.query_params.get('status')
    if tenant_id:
        qs = qs.filter(tenant_id=tenant_id)
    if severity:
        qs = qs.filter(severity=severity)
    if alert_status:
        qs = qs.filter(status=alert_status)

    limit = int(request.query_params.get('limit', 50))
    offset = int(request.query_params.get('offset', 0))
    total = qs.count()
    alerts = qs.order_by('-created_at')[offset:offset + limit]

    serializer = SecurityAlertListSerializer(alerts, many=True)
    return Response({'count': total, 'results': serializer.data})


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated, IsPlatformOwner])
def platform_retention_policies(request):
    """List or create audit retention policies."""
    if request.method == 'GET':
        policies = AuditRetentionPolicy.objects.filter(is_active=True).order_by('retention_class')
        serializer = AuditRetentionPolicySerializer(policies, many=True)
        return Response(serializer.data)

    # POST — create policy
    serializer = AuditRetentionPolicySerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated, IsPlatformOwner])
def platform_retention_policy_update(request, policy_id):
    """Update a retention policy."""
    try:
        policy = AuditRetentionPolicy.objects.get(id=policy_id)
    except AuditRetentionPolicy.DoesNotExist:
        return Response({'error': 'Policy not found'}, status=status.HTTP_404_NOT_FOUND)

    serializer = AuditRetentionPolicySerializer(policy, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsPlatformOwner])
def platform_data_deletion_requests(request):
    """List data deletion requests across all tenants."""
    tenant_id = request.query_params.get('tenant_id')
    limit = int(request.query_params.get('limit', 50))
    offset = int(request.query_params.get('offset', 0))

    items, total = DataDeletionService.get_requests(
        tenant_id=tenant_id, limit=limit, offset=offset,
    )
    serializer = DataDeletionLogSerializer(items, many=True)
    return Response({'count': total, 'results': serializer.data})


@api_view(['PATCH'])
@permission_classes([IsAuthenticated, IsPlatformOwner])
def platform_data_deletion_update(request, request_id):
    """Update the status of a data deletion request."""
    ser = DataDeletionStatusUpdateSerializer(data=request.data)
    ser.is_valid(raise_exception=True)

    result = DataDeletionService.update_status(
        request_id=request_id,
        status=ser.validated_data['status'],
        deletion_proof=ser.validated_data.get('deletion_proof'),
    )
    if not result:
        return Response({'error': 'Request not found'}, status=status.HTTP_404_NOT_FOUND)

    return Response(DataDeletionLogSerializer(result).data)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsPlatformOwner])
def platform_audit_stats(request):
    """Get cross-tenant audit statistics for the platform dashboard."""
    days = int(request.query_params.get('days', 7))
    stats = AuditService.get_stats(days=days)
    return Response(stats)
