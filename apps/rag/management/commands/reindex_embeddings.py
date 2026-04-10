"""
Bulk reindex command for document embeddings.

Usage examples:
  python manage.py reindex_embeddings
  python manage.py reindex_embeddings --tenant-id <uuid>
  python manage.py reindex_embeddings --tenant-id <uuid> --limit 100 --dry-run
"""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.core.cache import cache

from apps.documents.models import Document
from apps.documents.tasks import process_document_task
from apps.documents.services.access import DocumentAccessService


class Command(BaseCommand):
    help = "Queue document reprocessing jobs to rebuild embedding vectors."

    def add_arguments(self, parser):
        parser.add_argument(
            '--tenant-id',
            type=str,
            default='',
            help='Optional tenant UUID. If omitted, all tenants are reindexed.',
        )
        parser.add_argument(
            '--limit',
            type=int,
            default=0,
            help='Optional max number of documents to queue.',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Only print how many documents would be queued.',
        )

    def handle(self, *args, **options):
        tenant_id = (options.get('tenant_id') or '').strip()
        limit = int(options.get('limit') or 0)
        dry_run = bool(options.get('dry_run'))

        queryset = Document.objects.filter(
            is_deleted=False).exclude(status='processing')
        if tenant_id:
            queryset = queryset.filter(tenant_id=tenant_id)

        queryset = queryset.order_by('created_at')
        if limit > 0:
            queryset = queryset[:limit]

        documents = list(queryset.only('id', 'tenant_id', 'status'))
        if not documents:
            scope = f"tenant={tenant_id}" if tenant_id else 'all tenants'
            self.stdout.write(self.style.WARNING(
                f'No documents found for reindex ({scope}).'))
            return

        if dry_run:
            self.stdout.write(self.style.SUCCESS(
                f"Dry-run: would queue {len(documents)} documents."))
            return

        queued = 0
        affected_tenant_ids: set[str] = set()

        for doc in documents:
            doc.status = 'pending'
            doc.processing_progress = 0
            doc.processing_error = ''
            doc.save(update_fields=[
                     'status', 'processing_progress', 'processing_error'])

            process_document_task.apply_async(
                args=[str(doc.id)], queue='embedding')
            affected_tenant_ids.add(str(doc.tenant_id))
            queued += 1

        for tid in affected_tenant_ids:
            DocumentAccessService.invalidate_tenant_cache(tid)

        # Reindex workflow has started; clear the pending-flag.
        cache.delete('rag:reindex_required')

        self.stdout.write(self.style.SUCCESS(
            f'Queued {queued} documents for embedding reindex.'))
