# RAG (Retrieval-Augmented Generation)

## Overview

LLMPanel includes a built-in RAG pipeline that allows users to upload documents, generate embeddings, chat with their data, and connect knowledge bases to agents. The system supports two vector store backends:

- **Local (zvec)**: In-process vector database ([alibaba/zvec](https://github.com/alibaba/zvec), `@zvec/zvec`) with an on-disk HNSW index per collection (`apps/api/src/services/vector-store.service.ts`, data dir `ZVEC_DATA_DIR`, default `./zvec-data`). SQLite `rag_chunks` remains the source of truth — the zvec index is lazily rebuilt (backfilled) from SQLite when empty, which also migrates pre-zvec collections. If the native binding is unavailable, search degrades to a linear cosine scan over SQLite.
- **Qdrant**: Bring-your-own-cluster integration with Qdrant (REST) for external deployments.

Embedding sources:

- **`builtin`** (default): runs locally in the API via Transformers.js (ONNX, q8). Curated registry in `rag.service.ts` (`BUILTIN_EMBEDDING_MODELS`): `all-MiniLM-L6-v2`, `bge-small-en-v1.5`, `gte-small`, `multilingual-e5-small` (all 384d; e5 gets `query:`/`passage:` prefixes automatically). Weights download on first use.
- **`deployment`**: the deployment's own `/v1/embeddings` endpoint.
- **`external`**: any OpenAI-compatible embeddings endpoint (BYO URL + key).

## Architecture

```
Document Upload → Extraction → Chunking → Embedding → Vector Store → Retrieval → LLM Chat / Agents
   (.pdf via unpdf,             (recursive) (builtin ONNX, (zvec HNSW    (topK +      (streaming SSE /
    .txt .md .csv .json .html)               deployment,    or Qdrant)    threshold)   knowledge_search)
                                             or external)
```

### Data Flow

1. **Upload**: User uploads a document (`.pdf`, `.txt`, `.md`, `.csv`, `.json`, `.html`) — text is extracted in `document-extract.service.ts` (PDF via `unpdf`)
2. **Chunk**: Text is split using recursive text splitting (Mastra-style) with configurable size/overlap
3. **Embed**: Chunks are embedded via the collection's embedding source (built-in local ONNX by default)
4. **Store**: Chunks + embeddings are stored in SQLite and indexed in zvec (local) or Qdrant
5. **Query**: User message is embedded, similar chunks are retrieved via the unified `retrieveFromCollection()` honoring the collection's `topK` / `scoreThreshold`
6. **Chat / Agents**: Retrieved context is injected into a system prompt (RAG chat, streamed via SSE), or served to agents through the `knowledge_search` tool — an agent can attach multiple collections via the `agent_collections` join table and results are merged by similarity

## Database Schema

### `rag_collections`

| Column | Type | Description |
|--------|------|-------------|
| `id` | text (PK) | UUID |
| `deploymentId` | text (FK) | Parent deployment |
| `userId` | text (FK) | Owner |
| `name` | text | Collection name |
| `description` | text | Optional description |
| `vectorStoreType` | text | `"local"` or `"qdrant"` |
| `embeddingSource` | text | `"deployment"` or `"external"` |
| `embeddingModel` | text | Model name (e.g. "text-embedding-3-small") |
| `embeddingDimensions` | integer | Vector dimensions (default 1536) |
| `externalEmbeddingUrl` | text | External embedding API URL |
| `encryptedExternalEmbeddingKey` | text | Encrypted API key |
| `chunkSize` | integer | Max chunk size in chars (default 512) |
| `chunkOverlap` | integer | Overlap between chunks (default 50) |
| `chunkStrategy` | text | Chunking strategy (default "recursive") |
| `topK` | integer | Chunks retrieved per query (default 5) |
| `scoreThreshold` | real | Minimum similarity score (default 0.3) |
| `qdrantUrl` | text | Qdrant cluster URL |
| `encryptedQdrantApiKey` | text | Encrypted Qdrant API key |
| `qdrantCollectionName` | text | Qdrant collection name |
| `documentCount` | integer | Number of documents |
| `totalChunks` | integer | Total chunk count |

### `rag_documents`

| Column | Type | Description |
|--------|------|-------------|
| `id` | text (PK) | UUID |
| `collectionId` | text (FK) | Parent collection |
| `fileName` | text | Original file name |
| `fileType` | text | MIME type |
| `fileSize` | integer | Size in bytes |
| `status` | text | `"processing"` / `"ready"` / `"failed"` |
| `chunkCount` | integer | Number of chunks generated |
| `errorMessage` | text | Error details if failed |

### `rag_chunks`

| Column | Type | Description |
|--------|------|-------------|
| `id` | text (PK) | `{docId}_chunk_{index}` |
| `documentId` | text (FK) | Parent document |
| `collectionId` | text (FK) | Parent collection |
| `content` | text | Chunk text content |
| `embedding` | text | JSON-encoded float array |
| `metadata` | text | JSON metadata |
| `chunkIndex` | integer | Position in document |

## API Endpoints

All routes are mounted at `/api/v1/deployments/:id/rag/` with session authentication.

### Collections

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/collections` | List all collections for deployment |
| `POST` | `/collections` | Create a new collection |
| `GET` | `/collections/:cid` | Get collection with documents |
| `PUT` | `/collections/:cid` | Update collection settings |
| `DELETE` | `/collections/:cid` | Soft-delete collection |

### Documents

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/collections/:cid/documents` | List documents |
| `POST` | `/collections/:cid/documents` | Upload document (multipart form) |
| `DELETE` | `/collections/:cid/documents/:did` | Delete document and chunks |

### Chat

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/chat` | RAG chat with streaming SSE response |

**Chat request body:**
```json
{
  "message": "What does the document say about X?",
  "collectionId": "uuid",
  "history": [
    { "role": "user", "content": "previous question" },
    { "role": "assistant", "content": "previous answer" }
  ]
}
```

**SSE events:**
- `sources` — Retrieved document chunks with scores
- `content` — Streamed response tokens
- `error` — Error message
- `done` — Stream complete

## Embedding Sources

### Deployment Endpoint (default)
Uses the deployment's own `/v1/embeddings` endpoint. Works with vLLM and SGLang which both expose OpenAI-compatible embedding APIs.

### External API
Configure an external OpenAI-compatible embedding endpoint:
- URL: `https://api.openai.com` or any compatible API
- API Key: Encrypted and stored securely
- Model: e.g. `text-embedding-3-small`, `text-embedding-3-large`

## Chunking

Uses Mastra-style recursive text splitting with configurable parameters:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `chunkSize` | 512 | Maximum chunk size in characters |
| `chunkOverlap` | 50 | Overlap between consecutive chunks |
| `chunkStrategy` | "recursive" | Splitting strategy |

**Recursive separators** (tried in order): `\n\n`, `\n`, `. `, ` `, ``

## Vector Search

### Local (SQLite)
- Embeddings stored as JSON arrays in SQLite
- Cosine similarity computed in JavaScript
- All chunks for a collection loaded into memory for search
- Best for small-to-medium collections (< 100k chunks)

### Qdrant Cloud
- Embeddings stored in Qdrant's optimized vector index
- Cosine distance metric
- Supports filtered search and payload queries
- Auto-creates Qdrant collection on first document upload
- Batch upserts (100 points per request)

## Frontend Components

All in `apps/web/components/rag/`:

| Component | File | Description |
|-----------|------|-------------|
| `RagHeader` | `rag-header.tsx` | Back button, title, collection count badge |
| `RagEmptyState` | `rag-empty-state.tsx` | Onboarding state with feature highlights |
| `CollectionForm` | `collection-form.tsx` | Create dialog with vector store + embedding config |
| `CollectionSidebar` | `collection-sidebar.tsx` | Collection list with type icons and stats |
| `CollectionDetail` | `collection-detail.tsx` | Tabs for Documents and Chat |
| `DocumentUpload` | `document-upload.tsx` | Drag-and-drop file upload with progress |
| `DocumentList` | `document-list.tsx` | Document list with status badges and delete |
| `RagChat` | `rag-chat.tsx` | Chat interface using prompt-kit components |

### Chat UI (prompt-kit)

The chat interface uses the pre-installed prompt-kit components:
- `ChatContainerRoot/Content/ScrollAnchor` — Auto-scrolling chat container
- `Message/MessageAvatar/MessageContent` — Message bubbles with markdown support
- `PromptInput/PromptInputTextarea/PromptInputActions` — Auto-resizing input with send button
- `Loader` (typing variant) — Streaming indicator

## Key Files

```
packages/db/src/schema/rag.ts                      — Database schema (3 tables)
apps/api/src/services/rag.service.ts                — Chunking, embedding, vector search
apps/api/src/controllers/rag.controller.ts          — API endpoints
apps/api/src/routes/rag.route.ts                    — Route definitions
apps/web/hooks/use-rag.ts                           — Frontend hooks + mutations
apps/web/app/dashboard/deployments/[id]/rag/        — RAG page
apps/web/components/rag/                            — All RAG UI components
```
