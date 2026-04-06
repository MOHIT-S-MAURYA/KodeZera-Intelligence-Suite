# Chapter 4: Coding and I/O Screens

---

## 4.1 Key Algorithms

### 4.1.1 Algorithm: Document Chunking (Token-Based Segmentation)

**Purpose**: Split extracted document text into overlapping chunks that fit within the LLM's context window while preserving semantic coherence at chunk boundaries.

**Input**: Raw text string, `chunk_size` (default: 500 tokens), `chunk_overlap` (default: 50 tokens)

**Output**: List of chunk dictionaries containing `text`, `chunk_index`, `token_count`, `start_token`, `end_token`

```python
# Source: apps/rag/services/document_processing.py

class DocumentProcessingService:
    def __init__(self):
        self.tokenizer = tiktoken.get_encoding("cl100k_base")
        self.chunk_size = settings.RAG_CHUNK_SIZE      # 500
        self.chunk_overlap = settings.RAG_CHUNK_OVERLAP # 50

    def chunk_text(self, text: str) -> List[Dict[str, any]]:
        tokens = self.tokenizer.encode(text)
        chunks = []
        chunk_index = 0
        start = 0

        while start < len(tokens):
            end = min(start + self.chunk_size, len(tokens))
            chunk_tokens = tokens[start:end]
            chunk_text = self.tokenizer.decode(chunk_tokens)

            chunks.append({
                'text': chunk_text,
                'chunk_index': chunk_index,
                'token_count': len(chunk_tokens),
                'start_token': start,
                'end_token': end,
            })

            chunk_index += 1
            start += self.chunk_size - self.chunk_overlap

            if end >= len(tokens):
                break

        return chunks
```

**Complexity**: O(N) where N = total token count. Each token is processed exactly once.

**Design Rationale**: Token-based chunking (rather than character or sentence-based) ensures consistent chunk sizes regardless of whitespace distribution. The 50-token overlap ensures that information spanning chunk boundaries is not lost entirely, as it will appear in at least one complete chunk. The `cl100k_base` encoding is used because it is the standard tokeniser for OpenAI's GPT-4 family, ensuring accurate token counting for cost estimation.

---

### 4.1.2 Algorithm: Hybrid Re-ranking (Semantic + Lexical Fusion)

**Purpose**: Improve retrieval precision by combining dense vector similarity scores with sparse lexical overlap, mitigating the "semantic drift" problem where vector-similar chunks may not contain the query's key terms.

**Input**: Query string, list of vector search results with `score` and `text` fields

**Output**: Re-ranked list with `combined_score` = 0.8 × semantic + 0.2 × lexical

```python
# Source: apps/rag/services/retriever.py

class RAGRetriever:
    def _tokenize(self, text: str) -> set[str]:
        return {t.lower() for t in re.findall(r"[A-Za-z0-9']+", text or '')
                if len(t) > 2}

    def _rerank_results(self, query: str, results: List[Dict]) -> List[Dict]:
        if not results:
            return []

        q_terms = self._tokenize(query)
        if not q_terms:
            return results

        reranked = []
        for r in results:
            semantic = float(r.get('score', 0.0))
            # Normalise Qdrant cosine score from [-1,1] to [0,1]
            semantic_norm = max(min((semantic + 1.0) / 2.0, 1.0), 0.0)

            text = r.get('full_text') or r.get('text', '')
            t_terms = self._tokenize(text)
            overlap = (len(q_terms & t_terms) / len(q_terms)) if q_terms else 0.0

            combined = (0.8 * semantic_norm) + (0.2 * overlap)
            nr = dict(r)
            nr['semantic_score'] = round(semantic_norm, 4)
            nr['lexical_score'] = round(overlap, 4)
            nr['combined_score'] = round(combined, 4)
            reranked.append(nr)

        reranked.sort(key=lambda x: x.get('combined_score', 0.0), reverse=True)
        return reranked
```

**Complexity**: O(K·T) where K = number of candidate results, T = average query term count.

**Design Rationale**: Pure vector similarity can rank a document about "machine learning algorithms" highly for a query about "deep learning methods" — the semantic nearness is correct, but the specific terms "deep" and "learning" may not appear. By adding a 20% weight for exact term overlap, the re-ranker biases toward chunks that contain the user's actual vocabulary, improving perceived relevance.

---

### 4.1.3 Algorithm: Closure-Table Role Resolution (O(1) Ancestor Lookup)

**Purpose**: Resolve all roles a user holds, including inherited roles from the parent chain, using a pre-computed closure table for O(1) database query performance.

**Input**: User object with direct role assignments

**Output**: Set of all role UUIDs (direct + inherited via closure table)

```python
# Source: apps/rbac/services/authorization.py

class RoleResolutionService:
    CACHE_TIMEOUT = 3600  # 1 hour

    @classmethod
    def resolve_user_roles(cls, user: User) -> Set[UUID]:
        cache_key = f"user:{user.id}:roles"
        cached_roles = cache.get(cache_key)
        if cached_roles is not None:
            return set(cached_roles)

        now = timezone.now()
        # Step 1: Get active, non-expired direct role assignments
        direct_role_ids = set(
            UserRole.objects.filter(
                user=user, is_active=True,
            ).filter(
                Q(expires_at__isnull=True) | Q(expires_at__gt=now),
            ).values_list('role_id', flat=True)
        )

        if not direct_role_ids:
            cache.set(cache_key, [], cls.CACHE_TIMEOUT)
            return set()

        # Step 2: Use closure table for O(1) ancestor expansion
        all_role_ids = set(
            RoleClosure.objects.filter(
                descendant_id__in=direct_role_ids,
            ).values_list('ancestor_id', flat=True)
        )

        cache.set(cache_key, list(all_role_ids), cls.CACHE_TIMEOUT)
        return all_role_ids
```

**Complexity**: O(1) database queries (single JOIN on the closure table). Cache hit path: O(1).

**Design Rationale**: Naive recursive tree traversal for role hierarchies requires O(D) queries where D is the hierarchy depth — unacceptable for high-traffic permission checks. The closure table pre-computes all ancestor-descendant pairs, enabling a single query to resolve the entire inherited role set. This is the same pattern used by PostgreSQL's `ltree` extension and Google's Zanzibar authorisation system.

---

### 4.1.4 Algorithm: Permission Evaluation (Deny-First with ABAC Conditions)

**Purpose**: Determine whether a user has a specific permission, evaluating deny rules before allow rules and applying ABAC conditions where applicable.

```python
# Source: apps/rbac/services/authorization.py

class PermissionService:
    @classmethod
    def has_permission(cls, user: User, resource_type: str, action: str,
                       context: Optional[dict] = None) -> bool:
        # Superuser and tenant admin bypass
        if user.is_superuser or user.is_tenant_admin:
            return True

        # Cache check for context-free queries
        if context is None:
            cached_result = cache.get(cls.get_cache_key(user.id, resource_type, action))
            if cached_result is not None:
                return cached_result

        role_ids = RoleResolutionService.resolve_user_roles(user)
        if not role_ids:
            return False

        # Get matching permissions
        matching_perms = Permission.objects.filter(
            resource_type=resource_type,
            action=action,
            role_permissions__role_id__in=role_ids,
        ).distinct()

        # DENY FIRST — deny always wins
        for perm in matching_perms:
            if perm.is_deny:
                if context is None or ConditionEngine.evaluate(perm.conditions, context):
                    return False

        # ALLOW rules
        for perm in matching_perms:
            if not perm.is_deny:
                if not perm.conditions or context is None:
                    return True
                if ConditionEngine.evaluate(perm.conditions, context):
                    return True

        return False
```

**Evaluation Order**: Deny → Superuser bypass → Admin bypass → Deny rules (with ABAC) → Allow rules (with ABAC) → Default deny.

---

### 4.1.5 Algorithm: Document Access Resolution (Multi-Rule Aggregation)

**Purpose**: Compute the complete set of document IDs a user is authorised to access, considering six distinct resolution rules.

```python
# Source: apps/documents/services/access.py (simplified)

class DocumentAccessService:
    @classmethod
    def get_accessible_document_ids(cls, user: User) -> Set[UUID]:
        document_ids = set()

        # Rule 1: Public documents
        document_ids.update(Document.objects.filter(
            tenant=user.tenant, visibility_type='public', status='completed',
        ).values_list('id', flat=True))

        # Rule 2: Own uploads
        document_ids.update(Document.objects.filter(
            tenant=user.tenant, uploaded_by=user, status='completed',
        ).values_list('id', flat=True))

        # Rule 3: Role-based grants
        role_ids = RoleResolutionService.resolve_user_roles(user)
        if role_ids:
            document_ids.update(DocumentAccess.objects.filter(
                document__tenant=user.tenant, access_type='role',
                role_id__in=role_ids,
            ).values_list('document_id', flat=True))

        # Rule 4: Org-unit grants (with descendant cascading)
        user_org_ids = cls._get_user_org_unit_ids(user)
        if user_org_ids:
            document_ids.update(DocumentAccess.objects.filter(
                document__tenant=user.tenant, access_type='org_unit',
                org_unit_id__in=user_org_ids,
            ).values_list('document_id', flat=True))

        # Rule 5: User-direct grants
        document_ids.update(DocumentAccess.objects.filter(
            document__tenant=user.tenant, access_type='user', user=user,
        ).values_list('document_id', flat=True))

        # Classification enforcement
        if user.clearance_level < 5:
            too_classified = set(Document.objects.filter(
                id__in=document_ids,
                classification_level__gt=user.clearance_level,
            ).values_list('id', flat=True))
            document_ids -= too_classified

        return document_ids
```

---

### 4.1.6 Algorithm: Citation Verification (Grounding Score)

**Purpose**: Verify that LLM-generated answers are grounded in the retrieved source documents by computing lexical overlap between the answer and the context.

```python
# Source: apps/rag/services/citation_verifier.py

class CitationVerifier:
    _CITATION_PATTERN = re.compile(r"\[(\d+)\]")

    def verify(self, answer: str, sources: List[Dict], 
               retrieved_chunks: List[Dict] = None) -> Dict:
        citations = [int(m.group(1)) for m in self._CITATION_PATTERN.finditer(answer)]
        unique_citations = sorted(set(citations))
        source_count = len(sources or [])

        invalid = [i for i in unique_citations if i < 1 or i > source_count]
        valid = [i for i in unique_citations if i not in invalid]

        grounding = self._grounding_score(answer, retrieved_chunks or [])
        passed = bool(valid) and not invalid and grounding >= 0.08

        return {
            "has_citations": len(unique_citations) > 0,
            "valid_citation_indices": valid,
            "invalid_citation_indices": invalid,
            "grounding_score": round(grounding, 4),
            "passed": passed,
        }

    def _grounding_score(self, answer: str, chunks: List[Dict]) -> float:
        answer_terms = self._terms(answer)
        context_terms = self._terms(" ".join(
            c.get("full_text") or c.get("text", "") for c in chunks
        ))
        if not answer_terms or not context_terms:
            return 0.0
        return len(answer_terms & context_terms) / len(answer_terms)
```

**Pass Criteria**: At least one valid citation index, no invalid indices, and grounding score ≥ 0.08.

---

## 4.2 Input/Output Screens

### 4.2.1 Login Screen
- **Input**: Email address, Password
- **Output**: JWT access token + refresh token (on success); MFA challenge (if MFA enabled); error message with lock status (on failure)
- **Security**: Rate-limited at 5 attempts per minute; account locked after 5 consecutive failures

### 4.2.2 Admin Dashboard
- **Input**: N/A (auto-loads on authentication)
- **Output**: Stat cards (total users, documents, queries, storage usage); recent activity feed; quick-action buttons

### 4.2.3 Document Upload
- **Input**: File (drag-and-drop or file picker); title; classification level (dropdown); visibility type (dropdown); department/org unit (dropdown); tags (multi-select)
- **Output**: Upload progress bar; real-time status updates (pending → processing → completed); error message if processing fails
- **Validation**: Max file size 50MB; allowed MIME types enforced server-side

### 4.2.4 AI Chat Interface
- **Input**: Natural-language query text; optional session selection
- **Output**: Streaming Markdown response with syntax highlighting; source citation cards (document title, file type, confidence level, relevance score); metadata panel (chunks retrieved, average confidence, query rewrite indicator)

### 4.2.5 Role Management
- **Input**: Role name; description; parent role (dropdown); permissions (checkbox matrix organised by resource type)
- **Output**: Role list with hierarchy visualisation; permission summary; user assignment count

### 4.2.6 Analytics Dashboard
- **Input**: Date range filter; metric type selector
- **Output**: Line charts (query volume, latency trends); bar charts (top users, document usage); stat cards (total queries, avg latency, error rate, active users)

### 4.2.7 Audit Log Viewer
- **Input**: Filters (date range, user, action type, resource type); search query; pagination controls
- **Output**: Tabular log entries with expandable detail panels; JSON metadata viewer; CSV export capability

---
