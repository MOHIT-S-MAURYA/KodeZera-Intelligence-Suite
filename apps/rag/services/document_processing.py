"""
Document processing service for text extraction and chunking.
"""
import os
from typing import List, Dict
import PyPDF2
from docx import Document as DocxDocument
import tiktoken
from django.conf import settings
import logging

logger = logging.getLogger(__name__)


class DocumentProcessingService:
    """Service for extracting and chunking document text."""
    
    def __init__(self):
        """Initialize tokenizer for chunking."""
        self.tokenizer = tiktoken.get_encoding("cl100k_base")
        self.chunk_size = settings.RAG_CHUNK_SIZE
        self.chunk_overlap = settings.RAG_CHUNK_OVERLAP
    
    def extract_text(self, file_path: str) -> str:
        """
        Extract text from document based on file type.
        
        Args:
            file_path: Path to document file
            
        Returns:
            Extracted text
        """
        ext = os.path.splitext(file_path)[1].lower()
        
        try:
            if ext == '.pdf':
                return self._extract_from_pdf(file_path)
            elif ext in ['.docx', '.doc']:
                return self._extract_from_docx(file_path)
            elif ext == '.txt':
                return self._extract_from_txt(file_path)
            else:
                raise ValueError(f"Unsupported file type: {ext}")
        except Exception as e:
            logger.error(f"Error extracting text from {file_path}: {e}")
            raise
    
    def _extract_from_pdf(self, file_path: str) -> str:
        """Extract text from PDF."""
        text = []
        with open(file_path, 'rb') as file:
            pdf_reader = PyPDF2.PdfReader(file)
            for page in pdf_reader.pages:
                text.append(page.extract_text())
        return '\n'.join(text)
    
    def _extract_from_docx(self, file_path: str) -> str:
        """Extract text from DOCX."""
        doc = DocxDocument(file_path)
        return '\n'.join([para.text for para in doc.paragraphs])
    
    def _extract_from_txt(self, file_path: str) -> str:
        """Extract text from TXT."""
        with open(file_path, 'r', encoding='utf-8') as file:
            return file.read()
    
    def clean_text(self, text: str) -> str:
        """
        Clean and normalize text.
        
        Args:
            text: Raw text
            
        Returns:
            Cleaned text
        """
        # Remove excessive whitespace
        text = ' '.join(text.split())
        
        # Remove special characters that might cause issues
        text = text.replace('\x00', '')
        
        return text.strip()
    
    def chunk_text(self, text: str) -> List[Dict[str, any]]:
        """
        Chunk text into overlapping segments.
        
        Args:
            text: Text to chunk
            
        Returns:
            List of chunks with metadata
        """
        # Tokenize text
        tokens = self.tokenizer.encode(text)
        
        chunks = []
        chunk_index = 0
        
        start = 0
        while start < len(tokens):
            # Get chunk
            end = min(start + self.chunk_size, len(tokens))
            chunk_tokens = tokens[start:end]
            
            # Decode back to text
            chunk_text = self.tokenizer.decode(chunk_tokens)
            
            chunks.append({
                'text': chunk_text,
                'chunk_index': chunk_index,
                'token_count': len(chunk_tokens),
                'start_token': start,
                'end_token': end,
            })
            
            chunk_index += 1
            
            # Move start position with overlap
            start += self.chunk_size - self.chunk_overlap
            
            # Break if we've reached the end
            if end >= len(tokens):
                break
        
        logger.info(f"Created {len(chunks)} chunks from {len(tokens)} tokens")
        return chunks
    
    def process_document(self, file_path: str) -> List[Dict[str, any]]:
        """
        Complete document processing pipeline.
        
        Args:
            file_path: Path to document
            
        Returns:
            List of processed chunks
        """
        # Extract text
        raw_text = self.extract_text(file_path)
        
        # Clean text
        clean_text = self.clean_text(raw_text)
        
        # Chunk text
        chunks = self.chunk_text(clean_text)
        
        return chunks
