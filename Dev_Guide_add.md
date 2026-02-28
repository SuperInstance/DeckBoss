 I'll create a comprehensive supplemental document that breaks down the first parts of the developer guide into granular, actionable components. This will serve as a reference for implementation details that couldn't fit in the main guide.

---

# Deckboss Implementation Supplement

## Granular Breakdown of Core Systems

---

## Part 1: The MCP Protocol (Deep Implementation)

### 1.1 JSON-RPC Message Format

Every message between Claude Code and Deckboss CLI is newline-delimited JSON:

```
Content-Length: 156\r\n
\r\n
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"deckboss_launch","arguments":{"agent":"scout","mission":"fetch"}}}\r\n
```

**Content-Length header is required** for stdio transport. Claude Code's MCP client expects this.

### 1.2 Complete Message Types

**Request (Claude → Deckboss):**
```typescript
interface McpRequest {
  jsonrpc: "2.0";
  id: number;           // Incrementing integer, unique per session
  method: string;       // "tools/list", "tools/call", etc.
  params?: unknown;     // Method-specific parameters
}
```

**Response (Deckboss → Claude):**
```typescript
interface McpResponse {
  jsonrpc: "2.0";
  id: number;           // Matches request id
  result?: unknown;     // Success payload
  error?: {             // Present if failed
    code: number;       // Standard JSON-RPC error codes
    message: string;
    data?: unknown;
  };
}
```

**Notification (either direction, no response expected):**
```typescript
interface McpNotification {
  jsonrpc: "2.0";
  method: string;       // No "id" field
  params?: unknown;
}
```

### 1.3 Standard Error Codes

| Code | Meaning | Usage |
|------|---------|-------|
| -32700 | Parse error | Invalid JSON received |
| -32600 | Invalid request | JSON is valid but not JSON-RPC |
| -32601 | Method not found | Unknown tool name |
| -32602 | Invalid params | Schema validation failed |
| -32603 | Internal error | Unexpected exception |
| -32000 to -32099 | Server error | Application-specific |

### 1.4 Initialization Sequence

```
Claude Code                    Deckboss CLI
     │                              │
     ├─► initialize request ───────▶│
     │  {"jsonrpc":"2.0","id":0,
     │   "method":"initialize",
     │   "params":{"protocolVersion":"2024-11-05",
     │             "capabilities":{},"clientInfo":{...}}}
     │                              │
     │◄─ initialize response ───────┤
     │  {"jsonrpc":"2.0","id":0,
     │   "result":{"protocolVersion":"2024-11-05",
     │             "capabilities":{"tools":{}},
     │             "serverInfo":{"name":"deckboss","version":"1.0.0"}}}
     │                              │
     ├─► initialized notification ─▶
     │  {"jsonrpc":"2.0","method":"notifications/initialized"}
     │                              │
     ▼                              ▼
   [Ready for tools/list, tools/call]
```

### 1.5 Tool Definition Schema (Complete)

```typescript
// apps/cli/src/mcp/types.ts

export interface McpTool {
  name: string;                    // Unique identifier, lowercase_with_underscores
  description: string;             // Claude reads this to decide tool selection
  
  inputSchema: {
    type: "object";
    properties: {
      [key: string]: {
        type: string;              // "string", "number", "boolean", "object", "array"
        description?: string;      // Claude uses this to understand parameter
        enum?: string[];           // Restricted values, shown as dropdown in some UIs
        default?: unknown;         // Default if not provided
        items?: {                  // For array type
          type: string;
        };
        properties?: {             // For object type (recursive)
          [key: string]: SchemaProperty;
        };
        required?: string[];       // Required sub-properties for object
      };
    };
    required: string[];            // Required top-level properties
  };
}

// Claude-specific: description quality determines usage accuracy
export const DECKBOSS_LAUNCH_TOOL: McpTool = {
  name: "deckboss_launch",
  description: `Launch an agent mission to run on Cloudflare's edge.
  
Use this when:
- Task can run independently (doesn't need human clarification mid-flight)
- Task benefits from parallel execution (multiple agents simultaneously)
- Task should survive laptop closure (background execution)
- Task involves web fetching, code indexing, or long-running analysis

Do NOT use when:
- Task requires complex reasoning (keep in Claude context)
- Task is interactive (needs human input)
- Task is simple and fast (overhead not worth it)

Available agents:
- scout: Web fetch, API calls, content summarization
- archivist: Code indexing, semantic search, pattern matching  
- machinist: Code execution, transformation, generation
- sentry: Scheduled monitoring, health checks, cron jobs

Examples:
- "Launch scout to fetch https://api.example.com/docs and summarize"
- "Background: archivist to index entire codebase"
- "Squadron: scout, archivist, machinist for security audit"`,

  inputSchema: {
    type: "object",
    properties: {
      agent: {
        type: "string",
        enum: ["scout", "archivist", "machinist", "sentry"],
        description: "Which agent to launch. Each has specialized capabilities."
      },
      mission: {
        type: "string",
        description: "Mission type identifier. Agent-specific. Examples: 'fetch', 'summarize', 'index', 'audit'."
      },
      payload: {
        type: "object",
        description: "Mission parameters. Varies by mission type. Scout 'fetch' needs {url: string}. Archivist 'index' needs {scope: string[]}.",
        additionalProperties: true
      },
      background: {
        type: "boolean",
        default: false,
        description: "If true, mission queues and executes independently. Survives laptop closure, terminal exit, network changes. Check status later with deckboss_status."
      }
    },
    required: ["agent", "mission"]
  }
};
```

### 1.6 Response Content Types

Claude Code accepts multiple content types in tool responses:

```typescript
interface ToolResult {
  content: ContentItem[];
  isError?: boolean;    // If true, Claude treats as failure
}

type ContentItem = 
  | { type: "text"; text: string; }
  | { type: "image"; data: string; mimeType: string; }  // Base64 encoded
  | { type: "resource"; resource: { uri: string; mimeType: string; text?: string; blob?: string; }; };

// Examples:

// Simple text result
{
  content: [{ type: "text", text: "Mission completed. Found 47 issues." }]
}

// Structured data (Claude formats for human)
{
  content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
}

// Error (Claude sees failure, may retry or explain)
{
  content: [{ type: "text", text: "Agent execution failed: timeout after 30s" }],
  isError: true
}
```

### 1.7 Stdio Transport Implementation Details

```typescript
// apps/cli/src/mcp/stdio.ts

import { Readable, Writable } from 'stream';

export class StdioTransport {
  private reader: Readable;
  private writer: Writable;
  private buffer: string = '';
  private contentLength: number | null = null;
  private onMessage: (msg: unknown) => void;
  
  constructor(options: { stdin: Readable; stdout: Writable; onMessage: (msg: unknown) => void }) {
    this.reader = options.stdin;
    this.writer = options.stdout;
    this.onMessage = options.onMessage;
    
    this.reader.on('data', (chunk: Buffer) => this.onData(chunk));
    this.reader.on('end', () => this.onEnd());
  }
  
  private onData(chunk: Buffer): void {
    this.buffer += chunk.toString('utf-8');
    this.processBuffer();
  }
  
  private processBuffer(): void {
    // Parse Content-Length header
    if (this.contentLength === null) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) return; // Incomplete header
      
      const header = this.buffer.slice(0, headerEnd);
      const match = header.match(/Content-Length: (\d+)/i);
      if (!match) throw new Error('Missing Content-Length header');
      
      this.contentLength = parseInt(match[1], 10);
      this.buffer = this.buffer.slice(headerEnd + 4); // Remove header + \r\n\r\n
    }
    
    // Wait for full body
    if (this.buffer.length < this.contentLength) return;
    
    // Extract and parse
    const body = this.buffer.slice(0, this.contentLength);
    this.buffer = this.buffer.slice(this.contentLength);
    this.contentLength = null;
    
    try {
      const message = JSON.parse(body);
      this.onMessage(message);
    } catch (err) {
      console.error('Failed to parse JSON-RPC message:', err);
    }
    
    // Process remaining buffer (may contain next message)
    this.processBuffer();
  }
  
  send(message: unknown): void {
    const body = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(body, 'utf-8')}\r\n\r\n`;
    this.writer.write(header + body);
  }
  
  private onEnd(): void {
    // Clean shutdown
  }
}
```

### 1.8 Handling Claude's Context Window

Claude Code has ~200K token context. Deckboss must be mindful:

```typescript
// In tool handler: keep responses concise
if (result.text && result.text.length > 10000) {
  return {
    content: [{
      type: "text",
      text: `Result truncated. Full output: ${result.url || 'see logs'}\n\nSummary: ${result.text.slice(0, 5000)}`
    }]
  };
}

// For large structured data, summarize
if (Array.isArray(result.matches) && result.matches.length > 50) {
  return {
    content: [{
      type: "text",
      text: `Found ${result.matches.length} matches. Top 10:\n${result.matches.slice(0, 10).map(m => `- ${m.file}:${m.line}: ${m.preview}`).join('\n')}`
    }]
  };
}
```

---

## Part 2: WebSocket Protocol (CLI ↔ Director)

### 2.1 Message Format

WebSocket messages are JSON without framing (unlike MCP's Content-Length):

```typescript
interface WsMessage {
  id?: string;              // Optional: for request/response correlation
  type: string;             // Message type discriminator
  
  // Response tracking
  inResponseTo?: string;    // Present in responses, matches request id
  
  // Error handling
  error?: string;           // Present if failed
  stack?: string;           // Debug stack (development only)
  
  // Payload (varies by type)
  [key: string]: unknown;
}
```

### 2.2 Complete Message Types

**Client → Director (CLI requests):**

| Type | Purpose | Key Fields |
|------|---------|------------|
| `register_agent` | Add/update squadron member | `agent: {name, type, url, config}` |
| `unregister_agent` | Remove from squadron | `name: string` |
| `launch_immediate` | Synchronous execution | `args: {agent, mission, payload}` |
| `queue_mission` | Background execution | `args, scheduledAt: number` |
| `cancel_mission` | Abort pending | `missionId: string` |
| `get_mission_status` | Check progress | `missionId: string` |
| `get_mission_result` | Retrieve completed | `missionId: string` |
| `query_memory` | Search cognitive model | `query: string, filters?: object` |
| `get_full_status` | Fleet overview | (none) |
| `ping` | Keepalive | `timestamp: number` |

**Director → Client (responses and server-initiated):**

| Type | Purpose | Key Fields |
|------|---------|------------|
| `agent_registered` | Confirm registration | `name: string, success: boolean` |
| `mission_queued` | Confirm queue | `id: string, shortId: string` |
| `mission_complete` | Execution finished | `missionId, status, result/error` |
| `mission_cancelled` | Confirm cancel | `missionId, wasRunning: boolean` |
| `memory_results` | Search results | `results: MemoryItem[]` |
| `full_status` | Fleet snapshot | `agents, missions, quota` |
| `pong` | Keepalive response | `timestamp, directorTime` |
| `quota_warning` | Approaching limits | `resource, percentage, limit` |
| `error` | Operation failed | `message, operation?: string` |

### 2.3 Connection Lifecycle

```
[CLI starts] ──► [DNS lookup] ──► [TCP connect] ──► [TLS handshake]
     │                                                  │
     │◄─────────────────────────────────────────────────┘
     │              WSS established
     │
     ├─► send: {type: "ping", id: "1", timestamp: 1234567890}
     │
     │◄─ receive: {type: "pong", inResponseTo: "1", timestamp: 1234567891, directorTime: 1234567000}
     │
     │              [Connection verified, clock sync known]
     │
     ├─► send: {type: "get_full_status", id: "2"}
     │
     │◄─ receive: {type: "full_status", inResponseTo: "2", agents: [...], missions: [...]}
     │
     │              [Normal operation: launch, queue, receive completions]
     │
     ├─► [Network blip: connection drops]
     │
     │              [CLI detects close event]
     │
     ├─► [Exponential backoff: 1s, 2s, 4s, 8s... max 30s]
     │
     ├─► [Reconnect attempt]
     │
     │◄─ [Success: WebSocket re-established]
     │
     ├─► send: {type: "get_full_status", id: "3"}  // Re-sync state
     │
     │◄─ receive: {type: "full_status", inResponseTo: "3", ...}
     │            + any `mission_complete` messages for missed completions
     │
     ▼
[Resume normal operation]
```

### 2.4 Reconnection State Synchronization

```typescript
// apps/cli/src/director/client.ts

class DirectorClient {
  private missedMessages: any[] = [];
  private lastSyncTime: number = 0;
  
  async reconnect(): Promise<void> {
    await this.connectWebSocket();
    
    // Request full state sync
    const status = await this.request('get_full_status', {});
    this.lastSyncTime = Date.now();
    
    // Reconcile: check for missions completed while disconnected
    for (const mission of status.missions.completed) {
      if (mission.completedAt > this.lastDisconnectTime) {
        this.emit('mission_complete', mission);
      }
    }
    
    // Process any queued messages that arrived during reconnect
    for (const msg of this.missedMessages) {
      this.handleMessage(msg);
    }
    this.missedMessages = [];
  }
  
  private handleMessage(msg: any): void {
    if (!this.isReady && msg.type !== 'pong') {
      // Queue until reconnected
      this.missedMessages.push(msg);
      return;
    }
    // Normal handling...
  }
}
```

### 2.5 Ping/Pong Keepalive

```typescript
// Client-side ping every 30s
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'ping',
      id: crypto.randomUUID(),
      timestamp: Date.now()
    }));
  }
}, 30000);

// If no pong within 10s, consider connection dead
this.pingTimeout = setTimeout(() => {
  ws.terminate(); // Force close to trigger reconnect
}, 10000);
```

---

## Part 3: The Director's SQLite (Detailed Schema)

### 3.1 Table Specifications

**squadron** — Agent registry

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| name | TEXT | PRIMARY KEY | User-defined identifier |
| type | TEXT | NOT NULL, CHECK | Built-in or 'custom' |
| url | TEXT | NOT NULL | HTTPS endpoint |
| config | TEXT | | JSON blob, agent-specific |
| status | TEXT | DEFAULT 'active' | 'active', 'paused', 'error' |
| deployed_at | INTEGER | NOT NULL | Unix timestamp (ms) |
| last_heartbeat | INTEGER | | Last health check |

**missions** — Task queue and history

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PRIMARY KEY | Full UUID (short ID is derived) |
| agent_name | TEXT | FK → squadron(name) | Nullable if agent deleted |
| type | TEXT | NOT NULL | Mission type identifier |
| payload | TEXT | | JSON blob |
| status | TEXT | DEFAULT 'queued' | Enum with CHECK constraint |
| result | TEXT | | JSON blob (success) |
| error | TEXT | | Error message (failure) |
| created_at | INTEGER | NOT NULL | Submission time |
| scheduled_at | INTEGER | NOT NULL | Execution time (may be future) |
| started_at | INTEGER | | Actual start time |
| completed_at | INTEGER | | Finish time |
| retry_count | INTEGER | DEFAULT 0 | Current retry attempt |
| max_retries | INTEGER | DEFAULT 3 | Configurable per mission |
| notified | BOOLEAN | DEFAULT FALSE | CLI notified of completion? |

**memory** — Cognitive model

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PRIMARY KEY | UUID, matches Vectorize ID |
| concept | TEXT | NOT NULL | Normalized concept name |
| shorthand | TEXT | | User's personal term |
| context | TEXT | | JSON: explanation style, analogies, etc. |
| embedding_id | TEXT | | References Vectorize (same as id) |
| frequency | INTEGER | DEFAULT 1 | Usage count |
| last_accessed | INTEGER | | For LRU eviction (if needed) |
| created_at | INTEGER | NOT NULL | First seen |

### 3.2 Query Patterns

**Enqueue mission:**
```sql
INSERT INTO missions (id, agent_name, type, payload, created_at, scheduled_at)
VALUES (?, ?, ?, ?, ?, ?);
-- Then: SELECT scheduled_at FROM missions WHERE status = 'queued' ORDER BY scheduled_at ASC LIMIT 1;
-- Then: ctx.storage.setAlarm(earliest_scheduled_at);
```

**Dequeue for execution:**
```sql
SELECT * FROM missions 
WHERE status = 'queued' AND scheduled_at <= ? 
ORDER BY scheduled_at ASC 
LIMIT 5;
-- For each: UPDATE missions SET status = 'active', started_at = ? WHERE id = ?;
```

**Complete mission:**
```sql
UPDATE missions 
SET status = 'completed', result = ?, completed_at = ?, notified = FALSE 
WHERE id = ?;
-- Then: broadcast to all WebSocket sessions
-- Then: mark notified = TRUE when ACK received or after timeout
```

**Search memory (hybrid):**
```sql
-- Keyword part (D1)
SELECT * FROM memory 
WHERE concept LIKE '%' || ? || '%' OR shorthand LIKE '%' || ? || '%'
ORDER BY frequency DESC 
LIMIT 10;

-- Vector part (Vectorize, separate query)
-- Then fuse with RRF algorithm
```

### 3.3 Index Strategy

```sql
-- Mission queue performance
CREATE INDEX idx_missions_status_scheduled ON missions(status, scheduled_at);
-- Covers: WHERE status = 'queued' AND scheduled_at <= ? ORDER BY scheduled_at

-- Agent lookup
CREATE INDEX idx_missions_agent ON missions(agent_name);
-- Covers: agent-specific history queries

-- Memory search
CREATE INDEX idx_memory_concept ON memory(concept);
CREATE INDEX idx_memory_shorthand ON memory(shorthand);
-- Covers: WHERE concept LIKE ? OR shorthand LIKE ?
```

### 3.4 Migration Strategy

```typescript
// packages/director/src/migrations.ts

const MIGRATIONS = [
  {
    version: 1,
    sql: `
      CREATE TABLE squadron (...);
      CREATE TABLE missions (...);
      CREATE TABLE memory (...);
      CREATE INDEX ...;
    `
  },
  {
    version: 2,
    sql: `
      ALTER TABLE missions ADD COLUMN max_retries INTEGER DEFAULT 3;
      ALTER TABLE missions ADD COLUMN notified BOOLEAN DEFAULT FALSE;
    `
  }
  // Future migrations append here
];

export async function migrate(sql: SqlStorage): Promise<void> {
  // Check current version
  const currentVersion = sql.exec(`
    SELECT MAX(version) as v FROM schema_migrations
  `).one()?.v || 0;
  
  for (const migration of MIGRATIONS) {
    if (migration.version > currentVersion) {
      sql.exec(migration.sql);
      sql.exec(`INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)`,
        migration.version, Date.now());
    }
  }
}
```

---

## Part 4: Cloudflare Workers AI (Detailed)

### 4.1 Available Models

| Model | ID | Use Case | Free Tier |
|-------|-----|----------|-----------|
| Llama 3.2 3B Instruct | `@cf/meta/llama-3.2-3b-instruct` | Text generation, summarization, extraction | Included in 10K neurons |
| Llama 3.2 1B Instruct | `@cf/meta/llama-3.2-1b-instruct` | Faster, lower quality | Included |
| BGE Large EN v1.5 | `@cf/baai/bge-large-en-v1.5` | Text embeddings | Included |
| FLUX.1 Schnell | `@cf/black-forest-labs/flux-1-schnell` | Image generation | 1000 images/day |
| Mistral 7B Instruct | `@cf/mistral/mistral-7b-instruct-v0.1` | Higher quality, more neurons | Included |
| Whisper | `@cf/openai/whisper` | Audio transcription | Included |

### 4.2 Neuron Calculation

```typescript
// Approximate neuron costs (Cloudflare internal, subject to change)

function estimateNeurons(model: string, inputTokens: number, outputTokens: number): number {
  const rates: Record<string, { input: number; output: number }> = {
    '@cf/meta/llama-3.2-3b-instruct': { input: 0.15, output: 0.6 },
    '@cf/meta/llama-3.2-1b-instruct': { input: 0.08, output: 0.3 },
    '@cf/baai/bge-large-en-v1.5': { input: 0.1, output: 0 }, // Embedding, no output
    '@cf/mistral/mistral-7b-instruct-v0.1': { input: 0.2, output: 0.8 }
  };
  
  const rate = rates[model] || rates['@cf/meta/llama-3.2-3b-instruct'];
  return Math.ceil(inputTokens * rate.input + outputTokens * rate.output);
}

// Usage: estimateNeurons('@cf/meta/llama-3.2-3b-instruct', 1000, 500) ≈ 450 neurons
```

### 4.3 Invocation API

```typescript
// In Agent Worker
const result = await env.AI.run('@cf/meta/llama-3.2-3b-instruct', {
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'Summarize this: ' + text }
  ],
  max_tokens: 1024,        // Hard limit on output
  temperature: 0.7,        // 0 = deterministic, 1 = creative
  top_p: 0.9,              // Nucleus sampling
  top_k: 40,               // Top-k sampling
  seed: 12345,             // For reproducibility (optional)
  repetition_penalty: 1.1  // Reduce repetition
});

// result.response: string (generated text)
// result.tool_calls?: any[] (if using function calling)
```

### 4.4 Embedding Generation

```typescript
const embedding = await env.AI.run('@cf/baai/bge-large-en-v1.5', {
  text: 'The text to embed'
});

// embedding.data: number[] (1024 dimensions for BGE-large)
// embedding.shape: [1024]

// For batch (more efficient)
const batch = await env.AI.run('@cf/baai/bge-large-en-v1.5', {
  text: ['text 1', 'text 2', 'text 3'] // Returns array of embeddings
});
```

### 4.5 Error Handling

```typescript
try {
  const result = await env.AI.run('@cf/meta/llama-3.2-3b-instruct', { messages });
} catch (error) {
  if (error.message.includes('quota')) {
    // 10K neurons exceeded
    return { error: 'AI quota exhausted. Try again tomorrow or upgrade Cloudflare plan.' };
  }
  if (error.message.includes('timeout')) {
    // Model took too long
    return { error: 'AI inference timeout. Try shorter input or simpler model.' };
  }
  throw error; // Unexpected, propagate
}
```

---

## Part 5: Vectorize (Vector Database)

### 5.1 Index Configuration

```typescript
// wrangler.toml configuration
[[vectorize]]
binding = "VECTORIZE"
index_name = "deckboss-memory"

// Index must be created via API or dashboard first:
// POST https://api.cloudflare.com/client/v4/accounts/{account}/vectorize/v2/indexes
// {
//   "name": "deckboss-memory",
//   "description": "Cognitive model and code embeddings",
//   "metric": "cosine",  // or "euclidean"
//   "dimensions": 1024,   // Match your embedding model (BGE-large = 1024)
//   "metadata_indexed": ["concept", "shorthand", "timestamp"]  // Filterable fields
// }
```

### 5.2 Operations

```typescript
// Insert vectors
await env.VECTORIZE.insert([
  {
    id: 'uuid-1',
    values: [0.1, 0.2, ..., 0.1024], // 1024 floats
    metadata: {
      concept: 'react-useeffect',
      shorthand: 'ghost effect',
      timestamp: Date.now()
    }
  },
  {
    id: 'uuid-2',
    values: [0.3, 0.4, ..., 0.1024],
    metadata: {
      concept: 'sql-injection',
      shorthand: 'bad input thing',
      timestamp: Date.now()
    }
  }
]);

// Query (similarity search)
const results = await env.VECTORIZE.query(queryVector, {
  topK: 10,                    // Return top 10 matches
  filter: {                    // Optional metadata filter
    concept: { $eq: 'react-useeffect' }  // Only this concept
  },
  returnValues: false,          // Don't return vectors (save bandwidth)
  returnMetadata: true          // Return metadata
});

// results: Array<{ id: string; score: number; metadata: object }>
// score: 0-1 (higher = more similar, depends on metric)

// Delete by ID
await env.VECTORIZE.deleteByIds(['uuid-1', 'uuid-2']);

// Delete by filter
await env.VECTORIZE.deleteByFilter({
  timestamp: { $lt: Date.now() - 30 * 24 * 60 * 60 * 1000 } // Older than 30 days
});
```

### 5.3 Hybrid Search Implementation

```typescript
async function hybridSearch(
  env: Env,
  query: string,
  options: { topK?: number; filter?: object } = {}
): Promise<SearchResult[]> {
  const topK = options.topK || 10;
  
  // 1. Generate query embedding
  const embedding = await env.AI.run('@cf/baai/bge-large-en-v1.5', { text: query });
  const queryVector = embedding.data[0];
  
  // 2. Vector search (semantic)
  const vectorResults = await env.VECTORIZE.query(queryVector, {
    topK: topK * 2, // Over-fetch for fusion
    filter: options.filter,
    returnMetadata: true
  });
  
  // 3. Keyword search (D1)
  // Note: D1 doesn't have native FTS, so we use LIKE or implement BM25 manually
  const keywordResults = await env.D1.prepare(`
    SELECT id, concept, shorthand, frequency,
           (CASE WHEN concept LIKE ? THEN 10 ELSE 0 END +
            CASE WHEN shorthand LIKE ? THEN 5 ELSE 0 END +
            frequency) as score
    FROM memory
    WHERE concept LIKE ? OR shorthand LIKE ?
    ORDER BY score DESC
    LIMIT ?
  `).bind(`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, topK * 2).all();
  
  // 4. Reciprocal Rank Fusion (RRF)
  const k = 60; // Constant, typically 60
  const scores = new Map<string, { score: number; item: any }>();
  
  // Add vector scores
  vectorResults.forEach((r, i) => {
    const id = r.id;
    const rrfScore = 1 / (k + i + 1);
    scores.set(id, { score: rrfScore, item: r });
  });
  
  // Add keyword scores
  keywordResults.results.forEach((r: any, i: number) => {
    const id = r.id as string;
    const rrfScore = 1 / (k + i + 1);
    const existing = scores.get(id);
    if (existing) {
      existing.score += rrfScore; // Fuse scores
    } else {
      scores.set(id, { score: rrfScore, item: r });
    }
  });
  
  // 5. Sort and return topK
  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ score, item }) => ({
      id: item.id,
      score,
      concept: item.metadata?.concept || item.concept,
      shorthand: item.metadata?.shorthand || item.shorthand
    }));
}
```

---

## Part 6: D1 (SQLite Database)

### 6.1 Connection and Querying

```typescript
// In Agent Worker or Director
const result = await env.D1.prepare(`
  SELECT * FROM missions WHERE status = ? ORDER BY scheduled_at ASC
`).bind('queued').all();

// result.results: Array<Record<string, unknown>>
// result.success: boolean
// result.meta: { duration: number; changes: number; last_row_id: number }

// First row only
const single = await env.D1.prepare(`
  SELECT * FROM missions WHERE id = ?
`).bind(missionId).first();

// Insert with return
const insert = await env.D1.prepare(`
  INSERT INTO missions (id, agent_name, type, payload, created_at, scheduled_at)
  VALUES (?, ?, ?, ?, ?, ?)
  RETURNING id
`).bind(id, agent, type, payload, now, scheduled).first();

// Batch for efficiency
const batch = await env.D1.batch([
  env.D1.prepare('UPDATE missions SET status = ? WHERE id = ?').bind('active', id1),
  env.D1.prepare('UPDATE missions SET status = ? WHERE id = ?').bind('active', id2),
  env.D1.prepare('UPDATE missions SET status = ? WHERE id = ?').bind('active', id3)
]);
```

### 6.2 Schema Management

```typescript
// Schema versioning in Director
const CURRENT_SCHEMA_VERSION = 2;

async function ensureSchema(sql: SqlStorage): Promise<void> {
  // Check if schema_migrations exists
  try {
    sql.exec('SELECT 1 FROM schema_migrations LIMIT 1');
  } catch {
    // First run, create migrations table
    sql.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      )
    `);
  }
  
  const current = sql.exec('SELECT MAX(version) as v FROM schema_migrations').one()?.v || 0;
  
  if (current < 1) {
    sql.exec(SCHEMA_V1);
    sql.exec('INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)', Date.now());
  }
  
  if (current < 2) {
    sql.exec(SCHEMA_V2_MIGRATION);
    sql.exec('INSERT INTO schema_migrations (version, applied_at) VALUES (2, ?)', Date.now());
  }
}
```

---

## Part 7: KV (Key-Value Cache)

### 7.1 Use Cases

| Pattern | Example | TTL |
|---------|---------|-----|
| Response caching | `summary:${urlHash}` | 24 hours |
| Session state | `session:${sessionId}` | 1 hour |
| Rate limiting | `ratelimit:${ip}` | 1 minute |
| Config caching | `config:${agentName}` | 5 minutes |

### 7.2 Operations

```typescript
// Simple get/put
await env.KV.put('key', 'value');
const value = await env.KV.get('key'); // Returns string or null

// With metadata and expiration
await env.KV.put('key', 'value', {
  expirationTtl: 3600,        // Seconds from now
  // OR expiration: 1234567890  // Unix timestamp
  metadata: { createdBy: 'scout', missionId: '7A3F' }
});

// Get with metadata
const { value, metadata } = await env.KV.getWithMetadata('key');

// List keys (with prefix)
const list = await env.KV.list({ prefix: 'summary:' });
for (const key of list.keys) {
  console.log(key.name, key.expiration);
}

// Delete
await env.KV.delete('key');

// Bulk operations
await env.KV.put([
  { key: 'k1', value: 'v1', expirationTtl: 60 },
  { key: 'k2', value: 'v2', expirationTtl: 60 }
]);
```

### 7.3 Caching Strategy for AI Responses

```typescript
async function cachedSummarize(env: Env, text: string, options: object): Promise<string> {
  const cacheKey = `summary:${await hash(text + JSON.stringify(options))}`;
  
  // Check cache
  const cached = await env.KV.get(cacheKey);
  if (cached) return cached;
  
  // Generate
  const result = await env.AI.run('@cf/meta/llama-3.2-3b-instruct', {
    messages: [{ role: 'user', content: text }],
    ...options
  });
  
  // Store with TTL
  await env.KV.put(cacheKey, result.response, { expirationTtl: 86400 });
  
  return result.response;
}
```

---

## Part 8: Error Handling & Retry Logic

### 8.1 Mission Retry Strategy

```typescript
// In Director: executeBackgroundMission

const MAX_RETRIES = 3;
const BACKOFF_BASE = 60000; // 1 minute

if (error) {
  const retries = (mission.retry_count || 0) + 1;
  
  if (retries <= MAX_RETRIES) {
    // Exponential backoff with jitter
    const delay = Math.pow(2, retries) * BACKOFF_BASE;
    const jitter = Math.random() * 0.1 * delay; // ±10% jitter
    const newScheduled = Date.now() + delay + jitter;
    
    sql.exec(`
      UPDATE missions 
      SET retry_count = ?, scheduled_at = ?, status = 'queued'
      WHERE id = ?
    `, retries, newScheduled, mission.id);
    
    this.scheduleAlarmIfNeeded(newScheduled);
    
    // Log retry
    console.log(`Mission ${mission.id} failed, retry ${retries}/${MAX_RETRIES} at ${new Date(newScheduled)}`);
  } else {
    // Final failure
    this.failMission(mission.id, error.message);
    
    // Alert if critical (optional)
    if (mission.payload.critical) {
      this.notifyUrgentFailure(mission);
    }
  }
}
```

### 8.2 Error Classification

```typescript
function classifyError(error: Error): { retryable: boolean; reason: string } {
  const message = error.message.toLowerCase();
  
  // Retryable: transient issues
  if (message.includes('timeout')) return { retryable: true, reason: 'timeout' };
  if (message.includes('econnreset')) return { retryable: true, reason: 'network' };
  if (message.includes('quota') && message.includes('rate')) return { retryable: true, reason: 'rate_limit' };
  if (message.includes('5')) return { retryable: true, reason: 'server_error' };
  
  // Non-retryable: permanent failures
  if (message.includes('quota') && message.includes('exhausted')) return { retryable: false, reason: 'quota_exhausted' };
  if (message.includes('not found')) return { retryable: false, reason: 'agent_not_found' };
  if (message.includes('invalid')) return { retryable: false, reason: 'invalid_request' };
  
  // Default: retry once
  return { retryable: true, reason: 'unknown' };
}
```

---

## Part 9: Security Considerations

### 9.1 API Token Scoping

Minimum required permissions for `CF_API_TOKEN`:

| Permission | Level | Purpose |
|------------|-------|---------|
| Cloudflare Workers Scripts | Edit | Deploy agents |
| Cloudflare Workers Routes | Edit | Configure routes |
| Account | Read | Verify account |
| D1 | Edit | Create/query databases |
| Vectorize | Edit | Manage indexes |
| KV Storage | Edit | Read/write KV |
| R2 Storage | Edit | Read/write objects (optional) |

### 9.2 Local Credential Storage

```typescript
// apps/cli/src/config/storage.ts
import { keytar } from 'keytar'; // OS keychain integration

export async function storeCredentials(accountId: string, apiToken: string): Promise<void> {
  // Store in OS keychain (macOS: Keychain, Linux: Secret Service, Windows: Credential Locker)
  await keytar.setPassword('deckboss', 'api-token', apiToken);
  
  // Store account ID in plain config (not sensitive)
  const config = await readConfig();
  config.accountId = accountId;
  await writeConfig(config);
}

export async function getCredentials(): Promise<{ accountId: string; apiToken: string } | null> {
  const config = await readConfig();
  if (!config.accountId) return null;
  
  const apiToken = await keytar.getPassword('deckboss', 'api-token');
  if (!apiToken) return null;
  
  return { accountId: config.accountId, apiToken };
}
```

### 9.3 Agent Sandbox

Agents run in Cloudflare's isolate runtime:

- No filesystem access (use R2 for blobs)
- No raw sockets (use fetch)
- CPU time limited (50ms soft, 300ms hard for free tier)
- Memory isolated per request

**Security best practices:**
- Validate all inputs (JSON Schema)
- Sanitize URLs before fetch
- Never log sensitive data (tokens, PII)
- Use `ctx.waitUntil()` for async cleanup, not blocking response

---

## Part 10: Performance Optimization

### 10.1 Cold Start Minimization

| Technique | Impact |
|-----------|--------|
| Keep Workers warm (cron trigger every 5 min) | ~50ms → ~5ms |
| Minimize dependencies (bundle size) | Faster parse/compile |
| Use `compatibility_date` latest | Latest optimizations |
| Lazy load heavy modules | Only pay for what you use |

```typescript
// Lazy load heavy module
let heavyModule: any;

async function needsHeavyModule() {
  if (!heavyModule) {
    heavyModule = await import('./heavy');
  }
  return heavyModule;
}
```

### 10.2 Database Query Optimization

```typescript
// Bad: N+1 queries
for (const id of missionIds) {
  await env.D1.prepare('SELECT * FROM missions WHERE id = ?').bind(id).first();
}

// Good: Single batch query
const placeholders = missionIds.map(() => '?').join(',');
const results = await env.D1.prepare(`
  SELECT * FROM missions WHERE id IN (${placeholders})
`).bind(...missionIds).all();

// Good: Covering index
// CREATE INDEX idx_missions_status_scheduled ON missions(status, scheduled_at);
// Query: SELECT id, agent_name FROM missions WHERE status = 'queued' AND scheduled_at <= ?
// Index covers all selected columns, no table lookup
```

### 10.3 Caching Hierarchy

```
L1: In-memory (DO instance variables) — fastest, ephemeral
L2: KV — fast, edge-distributed, 1GB free
L3: D1 — structured, 5GB free, higher latency
L4: R2 — large blobs, 10GB free, highest latency
```

---

## Part 11: Monitoring & Observability

### 11.1 Structured Logging

```typescript
// Consistent log format for parsing
interface LogEntry {
  timestamp: string;      // ISO 8601
  level: 'debug' | 'info' | 'warn' | 'error';
  component: 'cli' | 'director' | 'agent' | 'web';
  event: string;          // Structured event name
  missionId?: string;
  agentName?: string;
  durationMs?: number;
  error?: string;
  context?: object;       // Additional structured data
}

// Usage
console.log(JSON.stringify({
  timestamp: new Date().toISOString(),
  level: 'info',
  component: 'director',
  event: 'mission_completed',
  missionId: '7A3F',
  agentName: 'archivist',
  durationMs: 4523
}));
```

### 11.2 Health Checks

```typescript
// Agent health endpoint
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.url.endsWith('/health')) {
      // Check dependencies
      const checks = await Promise.all([
        checkAI(env).catch(e => ({ name: 'ai', status: 'fail', error: e.message })),
        checkVectorize(env).catch(e => ({ name: 'vectorize', status: 'fail', error: e.message })),
        checkD1(env).catch(e => ({ name: 'd1', status: 'fail', error: e.message }))
      ]);
      
      const allHealthy = checks.every(c => c.status === 'ok');
      
      return Response.json({
        status: allHealthy ? 'healthy' : 'degraded',
        timestamp: Date.now(),
        version: '1.0.0',
        checks
      }, { status: allHealthy ? 200 : 503 });
    }
  }
};

async function checkAI(env: Env) {
  const start = Date.now();
  await env.AI.run('@cf/meta/llama-3.2-3b-instruct', {
    messages: [{ role: 'user', content: 'Hi' }],
    max_tokens: 1
  });
  return { name: 'ai', status: 'ok', latencyMs: Date.now() - start };
}
```

---

## Quick Reference: File Locations

| File | Purpose |
|------|---------|
| `apps/cli/src/mcp/server.ts` | MCP server entry |
| `apps/cli/src/mcp/tools/*.ts` | Individual tool implementations |
| `apps/cli/src/director/client.ts` | WebSocket client |
| `packages/director/src/index.ts` | Durable Object implementation |
| `packages/agents/*/src/index.ts` | Agent implementations |
| `packages/core/src/a2a.ts` | A2A protocol types |
| `packages/core/src/mcp.ts` | MCP protocol types |

---

## Quick Reference: Common Tasks

| Task | Command/Code |
|------|--------------|
| Test MCP locally | `echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \| npx deckboss mcp-server` |
| Tail Director logs | `wrangler tail deckboss-director` |
| Query D1 locally | `wrangler d1 execute deckboss-d1 --local --command="SELECT * FROM missions"` |
| Reset Director state | `wrangler d1 execute deckboss-d1 --local --command="DELETE FROM missions"` |
| Force alarm | Send RPC to `/rpc` with `{"method":"forceAlarm"}` |

---

This supplement provides implementation depth for the architecture described in the main Developer Guide. For high-level concepts and usage patterns, refer to that document.
