"""
Storage abstraction layer for document files.

Pluggable backends: LocalStorage (default), S3, GCS, Azure can be added later.
All file operations go through this service so the rest of the codebase is
storage-backend-agnostic.
"""

import hashlib
import os
import uuid
from datetime import datetime
from typing import BinaryIO, Optional

from django.conf import settings


class StorageService:
    """Facade that delegates to the configured storage backend."""

    # ── File key generation ───────────────────────────────────────────

    @staticmethod
    def generate_file_key(tenant_id, original_filename: str, content_hash: str = '') -> str:
        """
        Build a deterministic, collision-free storage key.
        Format: {tenant_id}/{YYYY}/{MM}/{hash_prefix}/{uuid}{ext}
        """
        ext = os.path.splitext(original_filename)[1].lower()
        now = datetime.utcnow()
        hash_prefix = content_hash[:8] if content_hash else 'nohash'
        unique = uuid.uuid4().hex[:12]
        return f"{tenant_id}/{now.year}/{now.month:02d}/{hash_prefix}/{unique}{ext}"

    @staticmethod
    def compute_hash(file_obj: BinaryIO) -> str:
        """Compute SHA-256 hex digest of file contents; rewinds file pointer."""
        sha = hashlib.sha256()
        for chunk in iter(lambda: file_obj.read(8192), b''):
            sha.update(chunk)
        file_obj.seek(0)
        return sha.hexdigest()

    # ── CRUD operations ───────────────────────────────────────────────

    @classmethod
    def save(cls, file_key: str, file_obj: BinaryIO) -> str:
        """Persist *file_obj* at *file_key*. Returns the absolute path on disk."""
        abs_path = cls._resolve(file_key)
        os.makedirs(os.path.dirname(abs_path), exist_ok=True)
        with open(abs_path, 'wb') as dest:
            for chunk in iter(lambda: file_obj.read(8192), b''):
                dest.write(chunk)
        return abs_path

    @classmethod
    def open(cls, file_key: str) -> Optional[BinaryIO]:
        """Return an open file handle for reading (caller must close)."""
        abs_path = cls._resolve(file_key)
        if not os.path.isfile(abs_path):
            return None
        return open(abs_path, 'rb')

    @classmethod
    def delete(cls, file_key: str) -> bool:
        """Remove the file at *file_key*. Returns True if it existed."""
        abs_path = cls._resolve(file_key)
        if os.path.isfile(abs_path):
            os.remove(abs_path)
            return True
        return False

    @classmethod
    def exists(cls, file_key: str) -> bool:
        return os.path.isfile(cls._resolve(file_key))

    @classmethod
    def size(cls, file_key: str) -> int:
        abs_path = cls._resolve(file_key)
        return os.path.getsize(abs_path) if os.path.isfile(abs_path) else 0

    # ── Internal helpers ──────────────────────────────────────────────

    @classmethod
    def _resolve(cls, file_key: str) -> str:
        """Map a storage key to an absolute filesystem path."""
        media_root = getattr(settings, 'MEDIA_ROOT', 'media')
        return os.path.join(media_root, file_key)
