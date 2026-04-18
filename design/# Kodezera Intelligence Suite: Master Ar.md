# Kodezera Intelligence Suite: Master Architecture & Implementation Specification

## 1. System Overview

The Kodezera Intelligence Suite is a stateful, multimodal, multi-agent AI conversational platform. It features strict pre-filtered Document-Bound Role-Based Access Control (RBAC), multi-hop reasoning, deterministic mathematical execution via sandboxing, and Generative UI delivery.

### 1.1 Core Technology Stack & Trusted Libraries

All implementations must strictly utilize the following enterprise-grade, verified libraries. Do not introduce unverified or experimental third-party packages.

- **Frontend:** React (v18+), TypeScript, TailwindCSS (for styling).
- **Backend Framework:** Python 3.11+, FastAPI (high-performance async API), Uvicorn (ASGI server), Pydantic (data validation).
- **Orchestration:** LangGraph (stateful multi-agent workflows), LangChain Core (prompt/tool abstraction).
- **Database (Relational/Auth):** PostgreSQL, asyncpg (driver), SQLAlchemy (ORM).
- **Database (Caching/Broker):** Redis, redis.asyncio.
- **Database (Vector Memory):** Qdrant (qdrant-client).
- **Asynchronous Processing:** Celery (task queue).
- **Multimodal Parsing:** pdfplumber (text extraction), unstructured (layout parsing), google-generativeai (Gemini Pro Vision for image-to-text).
- **Cloud Storage:** boto3 (AWS S3 integration for secure object storage).
- **Code Sandbox:** Docker SDK for Python (isolated Pandas execution).

---

## 2. Feature Implementation Plans

### Feature 1: High-Scale Authentication & Routing Gateway

**Objective:** Intercept user queries, resolve complex permissions in <5ms, and pass a flat array of approved document IDs to the orchestrator.

- **Technical Logic:**
  1. Extract JWT from the incoming request.
  2. Check Redis cache for the user's `allowed_docs` array.
  3. If cache miss, query PostgreSQL via SQLAlchemy to evaluate ABAC/RBAC (Role + Request + Overrides).
  4. Store the resulting flat array `["doc_id_1", "doc_id_2"]` in Redis with a 1-hour TTL.
  5. Pass the prompt and `allowed_docs` to the LangGraph Supervisor via FastAPI dependency injection.
- **Implementation Steps:**
  - Set up FastAPI middleware for JWT validation.
  - Implement async PostgreSQL queries for permission resolution.
  - Implement Redis caching layer.

### Feature 2: Multimodal Ingestion Pipeline (PDF to Vector)

**Objective:** Parse complex enterprise PDFs asynchronously, extract tables/charts via Vision models, and store them securely.

- **Technical Logic:**
  1. FastAPI receives the PDF and uploads it to an S3 bucket (using `boto3`).
  2. FastAPI pushes an ingestion task to the Celery queue (backed by Redis).
  3. Celery worker pulls the task and uses `unstructured`/`pdfplumber` to segment the PDF.
  4. Standard text undergoes Parent-Child chunking (store large context, embed small chunk).
  5. Images/Tables are sent to Gemini Pro Vision to generate dense Markdown descriptions.
  6. Raw extracted images are saved to a secure S3 path.
  7. Embeddings are generated and pushed to Qdrant, strictly tagged with metadata: `{"doc_id": "doc_x", "parent_id": "block_y", "image_s3_path": "s3://..."}`.
- **Implementation Steps:**
  - Configure Celery worker application.
  - Build the Layout Segmentation module.
  - Build the Gemini VLM API connector for table/chart transcription.
  - Build the Qdrant insertion module.

### Feature 3: LangGraph Multi-Agent Orchestrator

**Objective:** Route user queries to specialized cognitive workers and synthesize the final answer.

- **Technical Logic:**
  1. **Supervisor Node:** Receives user query. Uses an LLM to rewrite/expand temporal jargon (e.g., "Q3" to "July, August, September"). Evaluates intent and routes to sub-agents.
  2. **RAG Agent:** Receives the expanded query and the `allowed_docs` array. Queries Qdrant using a strict metadata filter (`WHERE doc_id IN allowed_docs`). Implements Small-to-Big retrieval by fetching the `parent_id` block for any matched child chunk.
  3. **Data Analyst Agent:** Uses LLM to generate Python (Pandas) code based on the query. Executes the code inside an isolated Docker container via the Docker Python SDK to ensure deterministic math calculations. Returns the raw numerical output.
  4. **Action Agent (HITL):** Drafts internal API calls (e.g., POST requests to update department data). Emits a "WAITING_ON_HUMAN" state to the frontend.
  5. **Synthesizer Agent:** Acts as the Map-Reduce node. Ingests all data from the RAG and Data agents, correlates the facts, and formats a final structured JSON response.
- **Implementation Steps:**
  - Define the LangGraph `StateGraph` and node functions.
  - Implement the Qdrant retriever tool with strict metadata filtering.
  - Set up the Docker execution sandbox tool.
  - Format output schema strictly as JSON for Generative UI consumption.

### Feature 4: Secure Image Delivery (Presigned URLs)

**Objective:** Serve images parsed during ingestion without exposing static public URLs.

- **Technical Logic:**
  1. During the RAG process, if a vector containing an `image_s3_path` is retrieved, it is passed to the Synthesizer.
  2. The Synthesizer determines if the image should be shown to the user.
  3. If yes, the FastAPI backend intercepts the `image_s3_path` before sending the final payload.
  4. FastAPI uses `boto3` to generate a temporary (15-minute) presigned URL for that specific S3 object.
  5. The final JSON payload sent to the frontend includes the presigned URL, not the raw S3 path.
- **Implementation Steps:**
  - Create a utility function using `boto3.client('s3').generate_presigned_url`.
  - Integrate this utility into the final FastAPI response formatting step.

### Feature 5: Generative UI Frontend (React + TypeScript)

**Objective:** Consume Server-Sent Events (SSE) from FastAPI and natively render text, tables, charts, and HITL confirmation modals.

- **Technical Logic:**
  1. React establishes an SSE connection (via native `EventSource` or `fetch` with streaming) to the FastAPI `/chat/stream` endpoint.
  2. The frontend maintains a dynamic message array in state.
  3. As JSON chunks arrive, React parses the `type` field (e.g., `text`, `table`, `image`, `action_required`).
  4. React dynamically mounts the corresponding component (e.g., rendering a custom Recharts component if numerical data is passed, or an `<img src={presigned_url} />` tag).
  5. If `action_required` is received, mount a Modal component with "Approve" or "Reject" buttons, which posts back to the FastAPI backend to resume the LangGraph state.
- **Implementation Steps:**
  - Build the SSE streaming client hook.
  - Create strongly typed interfaces for the incoming JSON payload.
  - Build isolated, modular React components for rendering diverse data types.

---

## 3. Strict Security Protocols (Must Not Deviate)

1. **Zero LLM Auth-Checking:** The LLM must NEVER be tasked with determining if a user can see a document. Auth filtering must happen deterministically at the Qdrant Vector DB query level.
2. **No Global Trees:** Document summaries must be bound to individual `doc_id` boundaries. Cross-document correlation occurs only at query time via the Synthesizer Agent.
3. **Sandbox Isolation:** Python execution for data analysis must run in an ephemeral Docker container with network access disabled to prevent remote code execution (RCE) vulnerabilities.
