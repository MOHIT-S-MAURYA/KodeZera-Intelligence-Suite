"""
Citation verification helpers for RAG responses.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List


class CitationVerifier:
    """Performs lightweight citation integrity checks on generated answers."""

    _CITATION_PATTERN = re.compile(r"\[(\d+)\]")
    _TOKEN_PATTERN = re.compile(r"[A-Za-z0-9']+")

    def verify(
        self,
        answer: str,
        sources: List[Dict[str, Any]],
        retrieved_chunks: List[Dict[str, Any]] | None = None,
    ) -> Dict[str, Any]:
        """
        Verify whether citations are structurally valid and grounded.

        Checks performed:
        1. Citation index validity against available source count.
        2. Basic lexical grounding between answer and retrieved context.
        """
        citations = [int(m.group(1)) for m in self._CITATION_PATTERN.finditer(answer or "")]
        unique_citations = sorted(set(citations))
        source_count = len(sources or [])

        invalid = [idx for idx in unique_citations if idx < 1 or idx > source_count]
        valid = [idx for idx in unique_citations if idx not in invalid]

        grounding = self._grounding_score(answer or "", retrieved_chunks or [])
        has_citations = len(unique_citations) > 0

        # Pass criteria is intentionally strict enough to catch obvious failures,
        # but permissive for short answers where overlap can be sparse.
        passed = bool(valid) and not invalid and grounding >= 0.08

        return {
            "has_citations": has_citations,
            "citation_count": len(citations),
            "unique_citations": unique_citations,
            "valid_citation_indices": valid,
            "invalid_citation_indices": invalid,
            "source_count": source_count,
            "grounding_score": round(grounding, 4),
            "passed": passed,
        }

    def _grounding_score(self, answer: str, retrieved_chunks: List[Dict[str, Any]]) -> float:
        """
        Compute overlap ratio of answer terms with retrieved context terms.
        """
        answer_terms = self._terms(answer)
        if not answer_terms:
            return 0.0

        context_blob = " ".join(
            (chunk.get("full_text") or chunk.get("text") or "")
            for chunk in retrieved_chunks
            if isinstance(chunk, dict)
        )
        context_terms = self._terms(context_blob)
        if not context_terms:
            return 0.0

        overlap = answer_terms & context_terms
        return len(overlap) / len(answer_terms)

    def _terms(self, text: str) -> set[str]:
        """Tokenize with small stopword filtering for stable overlap scores."""
        stopwords = {
            "the", "and", "for", "with", "this", "that", "from", "are", "was",
            "were", "have", "has", "had", "you", "your", "about", "into", "onto",
            "what", "when", "where", "which", "who", "whom", "why", "how", "can",
            "could", "would", "should", "will", "shall", "may", "might", "not", "only",
        }
        terms = {
            t.lower()
            for t in self._TOKEN_PATTERN.findall(text or "")
            if len(t) > 2
        }
        return {t for t in terms if t not in stopwords}
