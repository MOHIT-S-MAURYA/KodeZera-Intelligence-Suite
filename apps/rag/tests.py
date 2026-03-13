from django.test import SimpleTestCase

from apps.rag.services.citation_verifier import CitationVerifier
from apps.rag.services.retriever import RAGRetriever


class CitationVerifierTests(SimpleTestCase):
	def setUp(self):
		self.verifier = CitationVerifier()

	def test_verify_passes_with_valid_citations_and_grounding(self):
		answer = "The policy requires MFA for admins [1]."
		sources = [{"document_id": "doc-1", "title": "Security Policy"}]
		chunks = [{"text": "Security policy states admins must use MFA for access."}]

		result = self.verifier.verify(answer=answer, sources=sources, retrieved_chunks=chunks)

		self.assertTrue(result["has_citations"])
		self.assertEqual(result["invalid_citation_indices"], [])
		self.assertTrue(result["passed"])

	def test_verify_fails_on_out_of_range_citation(self):
		answer = "See the handbook guidance [3]."
		sources = [{"document_id": "doc-1", "title": "Handbook"}]
		chunks = [{"text": "The employee handbook covers leave guidance."}]

		result = self.verifier.verify(answer=answer, sources=sources, retrieved_chunks=chunks)

		self.assertEqual(result["invalid_citation_indices"], [3])
		self.assertFalse(result["passed"])


class RetrieverRerankTests(SimpleTestCase):
	def test_rerank_promotes_lexically_relevant_chunk(self):
		# We bypass __init__ to unit test pure ranking logic without services.
		retriever = RAGRetriever.__new__(RAGRetriever)

		query = "mfa policy requirements"
		results = [
			{"document_id": "doc-a", "score": 0.91, "text": "quarterly finance report"},
			{"document_id": "doc-b", "score": 0.80, "text": "MFA policy requirements for administrators"},
		]

		reranked = retriever._rerank_results(query, results)
		self.assertEqual(reranked[0]["document_id"], "doc-b")
