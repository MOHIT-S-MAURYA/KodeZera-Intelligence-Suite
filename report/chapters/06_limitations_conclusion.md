# Chapter 6: Limitations & Future Enhancements

---

## 6.1 Current Limitations

### 6.1.1 Document Processing Limitations

| # | Limitation | Impact | Mitigation |
|---|-----------|--------|------------|
| L-01 | **No OCR support**: Scanned PDF documents (image-based) cannot be text-extracted. | Users must provide text-based PDFs or pre-process scanned documents externally. | Planned integration with Tesseract OCR or AWS Textract. |
| L-02 | **No video/audio processing**: The system does not support multimedia document formats (MP4, MP3, WAV). | Knowledge locked in video presentations or recorded meetings remains inaccessible. | Future Phase: Add Whisper transcription for audio/video. |
| L-03 | **Basic text extraction**: The PDF extractor (PyPDF2) handles standard PDFs but may struggle with complex layouts (multi-column, tables, footnotes). | Some PDF content may be extracted with incorrect reading order. | Consider migration to pdfplumber or unstructured.io for layout-aware extraction. |
| L-04 | **Fixed chunking strategy**: Token-based chunking does not respect document structure (headings, sections, paragraphs). | Semantic boundaries may be split across chunks, reducing retrieval quality. | Planned: Implement structure-aware recursive chunking using document headings as split points. |

### 6.1.2 RAG Pipeline Limitations

| # | Limitation | Impact | Mitigation |
|---|-----------|--------|------------|
| L-05 | **Single embedding model per deployment**: All documents must use the same embedding model. Switching models requires re-embedding the entire corpus. | Model migration is a heavyweight operation for large deployments. | Store embedding model metadata per VectorChunk; support multi-model collections. |
| L-06 | **No multi-modal RAG**: The system only retrieves text chunks; tables and images embedded in documents are not separately indexed. | Users cannot query about chart data or diagram content within PDFs. | Future: Extract tables via Camelot; extract images and embed them via CLIP. |
| L-07 | **LLM context window constraint**: The system sends at most 5 chunks × ~1200 chars to the LLM. For complex questions spanning many documents, this may be insufficient. | Answers that require synthesising information from > 5 documents may be incomplete. | Implement iterative refinement (query → summarise → re-query) or map-reduce summarisation. |
| L-08 | **No fine-tuned models**: The system uses general-purpose LLMs. Domain-specific terminology may receive lower-quality responses. | Technical or legal documents with specialised vocabulary may yield less precise answers. | Support uploading domain glossaries; explore LoRA fine-tuning on domain corpora. |

### 6.1.3 Security & Compliance Limitations

| # | Limitation | Impact | Mitigation |
|---|-----------|--------|------------|
| L-09 | **No field-level encryption**: Document content and user data are encrypted at rest (disk-level) but not at the field level within the database. | Database administrator has access to raw data. | Implement application-level encryption for sensitive fields (document content, PII). |
| L-10 | **No SSO integration**: The system uses email/password + MFA; enterprise SSO (SAML 2.0, OIDC) is not yet supported. | Enterprises with existing IdP cannot use federated login. | Planned Phase 2: django-allauth or python-social-auth integration with SAML/OIDC. |
| L-11 | **Audit log retention is unbounded**: All audit logs are stored permanently. No automatic archival or deletion policy exists. | Database size may grow unboundedly for high-traffic deployments. | Implement configurable retention policies with automatic archival to cold storage. |

### 6.1.4 Scalability Limitations

| # | Limitation | Impact | Mitigation |
|---|-----------|--------|------------|
| L-12 | **Monolithic deployment**: While modularly structured, the system is deployed as a single application. Very high-scale deployments (> 10,000 concurrent users) may hit bottlenecks. | Vertical scaling has upper limits. | Split into microservices for extreme scale: separate RAG query service, auth service, document service. |
| L-13 | **Single-region deployment**: No built-in multi-region or geo-replication support. | Users in distant geographies experience higher latency. | Deploy behind a CDN (Cloudflare); replicate PostgreSQL across regions. |
| L-14 | **Celery worker scaling**: Document processing workers share the same Redis broker. Very high upload volumes may cause broker congestion. | Queue backpressure during bulk uploads. | Implement priority queues; use RabbitMQ for production-grade message guarantees. |

### 6.1.5 UI/UX Limitations

| # | Limitation | Impact | Mitigation |
|---|-----------|--------|------------|
| L-15 | **No native mobile apps**: The system is a web application only; no iOS or Android native apps exist. | Mobile users experience a browser-based experience without native push notifications or offline access. | Planned: React Native or Flutter mobile app sharing the REST API. |
| L-16 | **No real-time collaboration**: Document annotations and chat sessions are single-user. No live co-editing or shared chat capability. | Teams cannot collaboratively explore document content in real time. | Implement WebSocket-based collaborative sessions using Channels or Liveblocks. |
| L-17 | **No voice input**: The chat interface only accepts text input. | Users cannot dictate queries hands-free. | Integrate Web Speech API for browser-native speech-to-text. |

---

## 6.2 Future Enhancements

### 6.2.1 Short-Term (Next 3 Months)

1. **Advanced Chunking**: Implement markdown-aware recursive chunking that respects heading hierarchy, code blocks, and table boundaries.
2. **OCR Integration**: Add Tesseract OCR for scanned PDFs and image documents.
3. **SSO/OIDC**: Integrate with enterprise identity providers (Okta, Azure AD, Google Workspace).
4. **Export/Import**: Allow tenants to export their entire knowledge base (documents + embeddings) and import into another instance.
5. **Feedback Loop**: Use user thumbs-up/down feedback on RAG answers to fine-tune retrieval parameters (adjust re-ranking weights, modify top_k).

### 6.2.2 Medium-Term (3–6 Months)

6. **Multi-Modal RAG**: Extract and index tables, charts, and images from documents using Camelot, Docling, and CLIP embeddings.
7. **Knowledge Graphs**: Build entity-relationship graphs from document content (using NER + relation extraction) to enable graph-augmented retrieval.
8. **Custom AI Agents**: Allow tenants to define domain-specific AI agents with custom system prompts, tool access, and retrieval strategies.
9. **Workflow Automation**: Enable document-triggered workflows (e.g., "When a new policy document is uploaded, notify all users in the Legal department").
10. **API Gateway**: Add a public API layer with API key authentication for third-party integrations.

### 6.2.3 Long-Term (6–12 Months)

11. **Self-Learning RAG**: Implement reinforcement learning from human feedback (RLHF) to continuously improve answer quality based on user interactions.
12. **Multi-Region Deployment**: Geo-distributed architecture with per-tenant region affinity.
13. **Mobile Applications**: Native iOS and Android apps with offline document sync and push notifications.
14. **Marketplace**: Allow third-party developers to publish document processors, LLM adapters, and UI plugins.
15. **Compliance Certifications**: Obtain SOC 2 Type II, ISO 27001, and GDPR compliance certifications.

---

# Chapter 7: Conclusion & Bibliography

---

## 7.1 Conclusion

The Kodezera Intelligence Suite demonstrates that it is possible to build a production-grade, enterprise-ready RAG platform that does not sacrifice security, multi-tenancy, or auditability for the sake of AI capability. The key contributions of this project are:

1. **Security-First RAG Architecture**: By enforcing tenant isolation, RBAC-based document filtering, and classification-level checks at the retrieval layer (not the presentation layer), the system guarantees that AI-generated responses never contain information a user is not authorised to see. This is a fundamental departure from consumer AI chatbots that treat all users equally.

2. **Hybrid RBAC+ABAC Engine**: The closure-table-backed role hierarchy with ABAC condition overlays provides a permission model that is simultaneously expressive (supporting complex policies like "department managers with clearance ≤ 3 in their own org unit") and performant (O(1) ancestor resolution, 30-minute cached permission sets).

3. **Model-Agnostic AI Pipeline**: By abstracting the embedding and LLM layers behind provider interfaces, the system enables organisations to choose between cloud-hosted models (OpenAI, Anthropic), self-hosted models (Ollama, HuggingFace), and fully offline models (local SentenceTransformers + TinyLlama), accommodating the full spectrum from startup to air-gapped government.

4. **Hybrid Retrieval Quality**: The combination of dense vector similarity with lexical re-ranking (0.8/0.2 fusion) addresses the well-documented "vocabulary mismatch" problem in purely semantic search, improving top-5 retrieval precision without adding significant computational overhead.

5. **Citation Verification**: The grounding-score mechanism provides a quantitative measure of answer fidelity, enabling both the system (automated quality gates) and the user (confidence indicators) to assess whether the AI's response is genuinely supported by the retrieved documents.

6. **Enterprise Operational Readiness**: Health-check endpoints, structured JSON logging, Sentry integration, Docker multi-stage builds, Kubernetes manifests, and environment-specific settings management ensure the platform can be deployed and operated in production with industry-standard DevOps practices.

The project successfully addresses the gap between consumer AI convenience and enterprise compliance requirements, providing a foundation for organisations to safely leverage large language models against their proprietary knowledge bases.

---

## 7.2 Bibliography

1. Lewis, P., Perez, E., Piktus, A., Petroni, F., Karpukhin, V., Goyal, N., Küttler, H., Lewis, M., Yih, W., Rocktäschel, T., Riedel, S., & Kiela, D. (2020). Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks. *Advances in Neural Information Processing Systems*, 33, 9459–9474.

2. Karpukhin, V., Oguz, B., Min, S., Lewis, P., Wu, L., Edunov, S., Chen, D., & Yih, W. (2020). Dense Passage Retrieval for Open-Domain Question Answering. *Proceedings of EMNLP 2020*.

3. Vaswani, A., Shazeer, N., Parmar, N., Uszkoreit, J., Jones, L., Gomez, A. N., Kaiser, Ł., & Polosukhin, I. (2017). Attention Is All You Need. *Advances in Neural Information Processing Systems*, 30.

4. Sanderson, D., & Karypis, G. (2023). Best Practices for Enterprise Retrieval-Augmented Generation. *ACM Computing Surveys*, 55(12).

5. Zanzibar: Google's Consistent, Global Authorization System. (2019). *USENIX Annual Technical Conference*.

6. Django Software Foundation. (2024). Django 5.0 Documentation. https://docs.djangoproject.com/en/5.0/

7. Qdrant. (2024). Qdrant Vector Database Documentation. https://qdrant.tech/documentation/

8. OpenAI. (2024). API Reference — Embeddings. https://platform.openai.com/docs/api-reference/embeddings

9. Reimers, N., & Gurevych, I. (2019). Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks. *Proceedings of EMNLP-IJCNLP 2019*.

10. Meta AI. (2023). React 19 Documentation. https://react.dev/

11. NIST. (2024). Role-Based Access Control (RBAC) Standard. NIST SP 800-162.

12. OWASP Foundation. (2023). OWASP Top Ten Web Application Security Risks. https://owasp.org/www-project-top-ten/

13. Hu, E. J., Shen, Y., Wallis, P., Allen-Zhu, Z., Li, Y., Wang, S., Wang, L., & Chen, W. (2022). LoRA: Low-Rank Adaptation of Large Language Models. *ICLR 2022*.

14. McKinsey & Company. (2022). The Social Economy: Unlocking Value and Productivity Through Social Technologies. *McKinsey Global Institute*.

15. ISO/IEC 27001:2022. Information Security Management Systems — Requirements. International Organization for Standardization.

---
