"""
Support views.
"""
from rest_framework import viewsets, permissions
from apps.core.models import SupportTicket
from apps.api.serializers import SupportTicketSerializer

class SupportTicketViewSet(viewsets.ModelViewSet):
    """
    ViewSet for viewing and creating support tickets.
    Platform owners see all tickets.
    Tenant admins see tickets for their tenant.
    Regular users see only their own tickets.
    """
    serializer_class = SupportTicketSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = SupportTicket.objects.select_related('tenant', 'created_by').all()
        
        if user.is_superuser and not user.tenant:
            # Platform owner sees all
            return qs
        
        if user.is_tenant_admin and user.tenant:
            # Tenant admin sees all tenant tickets
            return qs.filter(tenant=user.tenant)
            
        # Regular user sees only their own
        return qs.filter(created_by=user)

    def perform_create(self, serializer):
        user = self.request.user
        serializer.save(
            created_by=user,
            tenant=user.tenant
        )
