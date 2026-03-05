#!/bin/bash
echo "========================================================="
echo "        KODEZERA RAG CHATBOT END-TO-END TEST"
echo "========================================================="
echo ""
echo "This test covers:"
echo " 1. Initializing DB with AI config for HuggingFace LLM & all-MiniLM-L6-v2 embeddings"
echo " 2. Uploading a simulated enterprise document"
echo " 3. Extracting and embedding the text natively (no API keys)"
echo " 4. Storing vectors in local Qdrant"
echo " 5. Running a RAG query through the mistralai HuggingFace pipeline"
echo ""

source venv/bin/activate
python test_rag.py
