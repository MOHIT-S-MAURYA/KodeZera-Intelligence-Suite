"""
Offline retrieval evaluation command for RAG tuning.

Input format (JSONL):
{
  "query": "...",
  "expected_document_ids": ["doc-a", "doc-b"],
  "candidates": [
    {"document_id": "doc-a", "score": 0.63, "text": "..."},
    {"document_id": "doc-x", "score": 0.71, "text": "..."}
  ]
}
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

from django.core.management.base import BaseCommand, CommandError

from apps.rag.services.retriever import RAGRetriever


class Command(BaseCommand):
    help = "Evaluate retrieval reranking quality using a labeled JSONL dataset."

    def add_arguments(self, parser):
        parser.add_argument("dataset", type=str, help="Path to JSONL dataset")
        parser.add_argument("--top-k", type=int, default=5, help="Top-k cut-off for Hit@K/MRR")

    def handle(self, *args, **options):
        dataset_path = Path(options["dataset"])
        top_k = int(options["top_k"])

        if not dataset_path.exists():
            raise CommandError(f"Dataset not found: {dataset_path}")
        if top_k <= 0:
            raise CommandError("--top-k must be a positive integer")

        rows = self._load_rows(dataset_path)
        if not rows:
            raise CommandError("Dataset is empty")

        # Bypass constructor side-effects; we only need deterministic reranking helpers.
        retriever = RAGRetriever.__new__(RAGRetriever)

        total = 0
        hits = 0
        reciprocal_ranks: List[float] = []

        for row in rows:
            query = row.get("query", "")
            expected = {str(x) for x in row.get("expected_document_ids", [])}
            candidates = row.get("candidates", [])
            if not query or not expected or not candidates:
                continue

            total += 1
            ranked = retriever._rerank_results(query, candidates)[:top_k]

            rr = 0.0
            for rank, item in enumerate(ranked, start=1):
                doc_id = str(item.get("document_id", ""))
                if doc_id in expected:
                    rr = 1.0 / rank
                    break

            if rr > 0:
                hits += 1
            reciprocal_ranks.append(rr)

        if total == 0:
            raise CommandError("No valid rows found. Ensure query/expected_document_ids/candidates are present.")

        hit_at_k = hits / total
        mrr = sum(reciprocal_ranks) / total

        self.stdout.write(self.style.SUCCESS("RAG retrieval evaluation complete"))
        self.stdout.write(f"Dataset: {dataset_path}")
        self.stdout.write(f"Evaluated rows: {total}")
        self.stdout.write(f"Hit@{top_k}: {hit_at_k:.4f}")
        self.stdout.write(f"MRR@{top_k}: {mrr:.4f}")

    def _load_rows(self, dataset_path: Path) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        with dataset_path.open("r", encoding="utf-8") as fh:
            for line_no, line in enumerate(fh, start=1):
                line = line.strip()
                if not line:
                    continue
                try:
                    rows.append(json.loads(line))
                except json.JSONDecodeError as exc:
                    raise CommandError(f"Invalid JSON on line {line_no}: {exc}") from exc
        return rows
