# Deckboss Developer Guide

## For Developers Who've Read the README

You know the concept: Deckboss adds a persistent, free crew of agents to Claude Code, running on your Cloudflare account. This guide shows you how to build it, extend it, and debug it.

---

## Table of Contents

1. [Development Environment Setup](#1-development-environment-setup)
2. [System Architecture](#2-system-architecture)
3. [The CLI (Bridge Layer)](#3-the-cli-bridge-layer)
4. [The Director (Stateful Core)](#4-the-director-stateful-core)
5. [Building Agents](#5-building-agents)
6. [Protocol Implementation](#6-protocol-implementation)
7. [Storage & Data Management](#7-storage--data-management)
8. [Testing & Debugging](#8-testing--debugging)
9. [Deployment & Operations](#9-deployment--operations)
10. [Extending Deckboss](#10-extending-deckboss)

---

## 1. Development Environment Setup

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20.x LTS | Runtime |
| pnpm | 8.x | Package manager, workspaces |
| Wrangler CLI | 3.22+ | Cloudflare deployment |
| Git | 2.40+ | Version control |

### Initial Setup

```bash
# Clone and install
git clone https://github.com/yourusername/deckboss.git
cd deckboss
pnpm install

# Authenticate with Cloudflare
npx wrangler login

# Configure environment
cp apps/cli/.env.example apps/cli/.env
# Edit: CF_ACCOUNT_ID=..., CF_API_TOKEN=...

# Verify
pnpm build
pnpm test
```

### Monorepo Structure

```
deckboss/
├── apps/
│   ├── cli/           # MCP server (npm package 'deckboss')
│   └── web/           # deckboss.ai platform (Next.js)
├── packages/
│   ├── core/          # Shared types, utilities
│   ├── agents/        # Agent source (scout, archivist, machinist, sentry)
│   └── director/      # Durable Object source
└── turbo.json         # Build orchestration
```

**Principle**: Apps are user-facing. Packages are infrastructure. Turborepo handles the dependency graph.

---

## 2. System Architecture

### The Data Flow

**Claude Code → CLI (MCP)**
```
Claude spawns: npx deckboss mcp-server
STDIO pipe (JSON-RPC)
Deckboss CLI (Node.js)
```

**CLI → Director (WebSocket)**
```
CLI opens WebSocket to Director DO
WSS connection stays open for real-time sync
If dropped: auto-reconnect, replay missed events from SQLite
```

**Director → Agents (HTTP)**
```
Alarm triggers (or immediate)
HTTP POST to Agent Worker (50ms cold start)
Agent executes, returns result
```

**Agents → Storage (Cloudflare APIs)**
```
env.AI.run()           → Workers AI (inference)
env.VECTORIZE.insert() → Vectorize (vectors)
env.D1.prepare()       → D1 (SQL)
env.KV.put()           → KV (cache)
env.R2.put()           → R2 (files)
```

### The Director's Lifecycle

```
[Created] → [Active] → [Hibernating] → [Active] → ...
              │           ▲              │
              │           │              │
              └─ WebSocket/Alarm ────────┘
              
(Auto-hibernates when no connections/alarms after 30s)
```

**Critical**: State survives hibernation. SQLite is persistent. Alarms wake the DO.

### Mission State Machine

```
[Queued] → [Scheduled] → [Active] → [Completed/Failed] → [Notified]
    │           │            │            │                │
    │           │            │            │                └─ WebSocket to CLI
    │           │            │            └─ Stored in D1
    │           │            └─ HTTP to Agent
    │           └─ Alarm set (if background)
    └─ Inserted by CLI or previous mission
```

---

## 3. The CLI (Bridge Layer)

### Three Modes

| Mode | Use Case | Entry |
|------|----------|-------|
| MCP Server | Claude Code integration | `deckboss mcp-server` |
| Interactive | Manual commands | `deckboss [command]` |
| Daemon | Persistent WebSocket | `deckboss daemon` |

### MCP Server Implementation

```typescript
// apps/cli/src/mcp/server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { DirectorClient } from '../director/client.js';

export async function startMcpServer(): Promise<void> {
  const config = await loadConfig();
  const director = new DirectorClient(config);
  await director.connect();

  const server = new Server(
    { name: 'deckboss', version: process.env.npm_package_version! },
    { capabilities: { tools: {} } }
  );

  registerTools(server, director);

  server.onerror = (error) => console.error('[Deckboss MCP]', error);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stdin.on('close', () => {
    director.disconnect();
    process.exit(0);
  });
}
```

### Tool Registration

```typescript
// apps/cli/src/mcp/tools/launch.ts
export function registerLaunchTool(server: Server, director: DirectorClient): void {
  server.setRequestHandler('tools/list', async () => ({
    tools: [{
      name: 'deckboss_launch',
      description: `Launch agent mission. Use background=true for long-running tasks.
Available: scout (web), archivist (code search), machinist (execution), sentry (monitoring).`,
      inputSchema: {
        type: 'object',
        properties: {
          agent: { 
            type: 'string', 
            enum: ['scout', 'archivist', 'machinist', 'sentry']
          },
          mission: { type: 'string' },
          payload: { type: 'object' },
          background: { 
            type: 'boolean', 
            default: false,
            description: 'Survives laptop closure'
          }
        },
        required: ['agent', 'mission']
      }
    }]
  }));

  server.setRequestHandler('tools/call', async (request) => {
    if (request.params.name !== 'deckboss_launch') return;

    const args = request.params.arguments;
    const quota = await director.checkQuota();

    if (quota.neurons > 8000) {
      return {
        content: [{
          type: 'text',
          text: `Warning: Daily AI quota 80% exhausted. Mission queued for tomorrow.`
        }],
        isError: true
      };
    }

    if (args.background) {
      const missionId = await director.queueMission(args);
      return {
        content: [{
          type: 'text',
          text: `Queued: ${missionId}\nCheck: deckboss_status ${missionId}`
        }]
      };
    }

    const result = await director.launchImmediate(args);
    return {
      content: [{ type: 'text', text: result.text || JSON.stringify(result, null, 2) }]
    };
  });
}
```

### Director Client

```typescript
// apps/cli/src/director/client.ts
import WebSocket from 'ws';

export class DirectorClient {
  private ws: WebSocket | null = null;
  private messageQueue: any[] = [];
  private pendingRequests: Map<string, { resolve: Function; reject: Function }> = new Map();
  private reconnectAttempts = 0;

  constructor(private config: Config) {}

  async connect(): Promise<void> {
    const directorId = await this.ensureDirector();
    const wsUrl = `wss://deckboss-director.${this.config.accountId}.workers.dev/${directorId}`;

    this.ws = new WebSocket(wsUrl);

    return new Promise((resolve, reject) => {
      this.ws!.on('open', () => {
        this.reconnectAttempts = 0;
        this.flushQueue();
        resolve();
      });

      this.ws!.on('message', (data) => this.handleMessage(JSON.parse(data.toString())));
      this.ws!.on('error', reject);
      this.ws!.on('close', () => {
        setTimeout(() => this.connect(), Math.min(1000 * 2 ** this.reconnectAttempts++, 30000));
      });
    });
  }

  async launchImmediate(args: LaunchArgs): Promise<MissionResult> {
    const id = crypto.randomUUID();
    this.send({ type: 'launch_immediate', id, args });

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('Mission timeout'));
      }, 30000);
    });
  }

  async queueMission(args: LaunchArgs): Promise<string> {
    const id = crypto.randomUUID();
    this.send({ type: 'queue_mission', id, args, scheduledAt: Date.now() });
    return id.slice(0, 4).toUpperCase(); // Short ID: "7A3F"
  }

  async checkQuota(): Promise<QuotaStatus> {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${this.config.accountId}/workers/subdomain`,
      { headers: { Authorization: `Bearer ${this.config.apiToken}` } }
    );
    return this.parseQuota(response);
  }

  private handleMessage(msg: any): void {
    if (msg.inResponseTo && this.pendingRequests.has(msg.inResponseTo)) {
      const { resolve, reject } = this.pendingRequests.get(msg.inResponseTo)!;
      this.pendingRequests.delete(msg.inResponseTo);
      msg.error ? reject(new Error(msg.error)) : resolve(msg.result);
    }

    if (msg.type === 'mission_complete') {
      console.error(`[Deckboss] Mission ${msg.missionId} completed`);
    }
  }

  private send(msg: any): void {
    this.ws?.readyState === WebSocket.OPEN
      ? this.ws.send(JSON.stringify(msg))
      : this.messageQueue.push(msg);
  }

  disconnect(): void { this.ws?.close(); }
}
```

---

## 4. The Director (Stateful Core)

### SQLite Schema

```sql
-- packages/director/migrations/0001_initial.sql

CREATE TABLE squadron (
  name TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK(type IN ('scout', 'archivist', 'machinist', 'sentry', 'custom')),
  url TEXT NOT NULL,
  config TEXT,
  deployed_at INTEGER NOT NULL,
  last_heartbeat INTEGER
);

CREATE TABLE missions (
  id TEXT PRIMARY KEY,
  agent_name TEXT,
  type TEXT NOT NULL,
  payload TEXT,
  status TEXT DEFAULT 'queued' CHECK(status IN ('queued', 'active', 'completed', 'failed')),
  result TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  scheduled_at INTEGER NOT NULL,
  completed_at INTEGER,
  retry_count INTEGER DEFAULT 0,
  notified BOOLEAN DEFAULT FALSE
);

CREATE TABLE memory (
  id TEXT PRIMARY KEY,
  concept TEXT NOT NULL,
  shorthand TEXT,
  context TEXT,
  embedding_id TEXT,
  frequency INTEGER DEFAULT 1,
  last_accessed INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_missions_status_scheduled ON missions(status, scheduled_at);
CREATE INDEX idx_memory_concept ON memory(concept);
```

### Implementation

```typescript
// packages/director/src/index.ts
import { DurableObject } from 'cloudflare:workers';

export class Director extends DurableObject<Env> {
  private sql: SqlStorage;
  private sessions: Map<string, WebSocket> = new Map();
  private squadron: Map<string, AgentInfo> = new Map();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;

    this.ctx.blockConcurrencyWhile(async () => {
      await this.initializeSchema();
      await this.loadSquadron();
      await this.processPendingMissions();
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/ws') {
      const [client, server] = Object.values(new WebSocketPair());
      await this.handleWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === '/rpc') {
      const { method, params } = await request.json();
      return Response.json({ result: await (this as any)[method](params) });
    }

    return new Response('Not Found', { status: 404 });
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    const due = this.sql.exec(`
      SELECT * FROM missions 
      WHERE status = 'queued' AND scheduled_at <= ?
      ORDER BY scheduled_at ASC LIMIT 5
    `, now).toArray();

    for (const mission of due) {
      await this.executeBackgroundMission(mission as MissionRecord);
    }

    const next = this.sql.exec(`
      SELECT scheduled_at FROM missions 
      WHERE status = 'queued' ORDER BY scheduled_at ASC LIMIT 1
    `).one();

    if (next) await this.ctx.storage.setAlarm(next.scheduled_at as number);
  }

  private async executeBackgroundMission(mission: MissionRecord): Promise<void> {
    this.sql.exec(`UPDATE missions SET status = 'active' WHERE id = ?`, mission.id);

    const agent = this.squadron.get(mission.agent_name!);
    if (!agent) {
      this.failMission(mission.id, `Agent ${mission.agent_name} not found`);
      return;
    }

    try {
      const response = await fetch(`${agent.url}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mission: mission.type,
          payload: JSON.parse(mission.payload!),
          context: await this.getCognitiveContext()
        })
      });

      const result = await response.json();

      this.sql.exec(`
        UPDATE missions 
        SET status = 'completed', result = ?, completed_at = ?, notified = FALSE
        WHERE id = ?
      `, JSON.stringify(result), Date.now(), mission.id);

      if (result.learning) await this.updateMemory(result.learning);

      this.broadcast({
        type: 'mission_complete',
        missionId: mission.id.slice(0, 4).toUpperCase(),
        status: 'completed',
        result
      });

    } catch (error) {
      const retries = (mission.retry_count || 0) + 1;
      if (retries < 3) {
        const backoff = Math.pow(2, retries) * 60000;
        const newScheduled = Date.now() + backoff;
        this.sql.exec(`
          UPDATE missions SET retry_count = ?, scheduled_at = ?, status = 'queued' WHERE id = ?
        `, retries, newScheduled, mission.id);
        await this.scheduleAlarmIfNeeded(newScheduled);
      } else {
        this.failMission(mission.id, error.message);
      }
    }
  }

  private async updateMemory(learning: LearningData): Promise<void> {
    const existing = this.sql.exec(`SELECT * FROM memory WHERE concept = ?`, learning.concept).one();

    if (existing) {
      this.sql.exec(`UPDATE memory SET frequency = frequency + 1, last_accessed = ? WHERE id = ?`,
        Date.now(), existing.id);
    } else {
      const id = crypto.randomUUID();
      this.sql.exec(`
        INSERT INTO memory (id, concept, shorthand, context, created_at)
        VALUES (?, ?, ?, ?, ?)
      `, id, learning.concept, learning.shorthand, JSON.stringify(learning.context), Date.now());

      const embedding = await this.env.AI.run('@cf/baai/bge-large-en-v1.5', {
        text: `${learning.concept}: ${learning.shorthand || ''}`
      });

      await this.env.VECTORIZE.insert([{
        id, values: embedding.data[0],
        metadata: { concept: learning.concept, shorthand: learning.shorthand, timestamp: Date.now() }
      }]);
    }
  }

  private async hybridSearch(query: string, filters?: any): Promise<MemoryResult[]> {
    const keywords = this.sql.exec(`
      SELECT * FROM memory WHERE concept LIKE ? OR shorthand LIKE ?
      ORDER BY frequency DESC LIMIT 10
    `, `%${query}%`, `%${query}%`).toArray();

    const embedding = await this.env.AI.run('@cf/baai/bge-large-en-v1.5', { text: query });
    const vectors = await this.env.VECTORIZE.query(query, { topK: 10, filter: filters });

    const scores = new Map<string, number>();
    const k = 60;

    keywords.forEach((r, i) => {
      const id = r.id as string;
      scores.set(id, (scores.get(id) || 0) + 1 / (k + i + 1));
    });

    vectors.forEach((r, i) => {
      const id = r.id as string;
      scores.set(id, (scores.get(id) || 0) + 1 / (k + i + 1));
    });

    return Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, score]) => ({ id, score }));
  }

  private broadcast(msg: any): void {
    const data = JSON.stringify(msg);
    for (const ws of this.sessions.values()) {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    }
  }

  private async scheduleAlarmIfNeeded(timestamp: number): Promise<void> {
    const current = await this.ctx.storage.getAlarm();
    if (!current || timestamp < current) await this.ctx.storage.setAlarm(timestamp);
  }
}
```

---

## 5. Building Agents

### Required Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /.well-known/agent.json` | A2A discovery (Agent Card) |
| `POST /execute` | Mission execution |
| `GET /health` | Health check |

### Scout Agent (Complete)

```typescript
// packages/agents/scout/src/index.ts
export interface Env { AI: Ai; VECTORIZE: Vectorize; KV: KVNamespace; }

const AGENT_CARD = {
  protocolVersion: '0.3.0',
  name: 'deckboss-scout',
  description: 'Web exploration: fetch, summarize, extract',
  url: '', // Runtime
  version: '1.0.0',
  capabilities: { streaming: false },
  skills: [
    { id: 'fetch', name: 'Fetch URL' },
    { id: 'summarize', name: 'Summarize Content' },
    { id: 'extract', name: 'Extract Structured Data' }
  ]
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    if (url.pathname === '/.well-known/agent.json') {
      AGENT_CARD.url = url.origin;
      return jsonResponse(AGENT_CARD);
    }

    if (url.pathname === '/health') {
      return jsonResponse({ status: 'healthy', timestamp: Date.now() });
    }

    if (url.pathname === '/execute' && request.method === 'POST') {
      return handleExecute(request, env);
    }

    return new Response('Not Found', { status: 404 });
  }
};

async function handleExecute(request: Request, env: Env): Promise<Response> {
  const { mission, payload, context } = await request.json();
  const handler = HANDLERS[mission];
  if (!handler) return jsonResponse({ error: `Unknown: ${mission}` }, 400);

  try {
    const result = await handler(payload, env, context);
    return jsonResponse(result);
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
}

const HANDLERS: Record<string, MissionHandler> = {
  async fetch(payload, env) {
    const response = await fetch(payload.url, {
      headers: { 'User-Agent': 'Deckboss Scout (+https://deckboss.ai/bot)' },
      cf: { cacheTtl: 3600 }
    });

    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

    const content = await response.text();
    return {
      url: payload.url,
      content: content.slice(0, 100000),
      size: content.length,
      contentType: response.headers.get('content-type')
    };
  },

  async summarize(payload, env, context) {
    let content = payload.content;
    if (!content && payload.url) {
      content = (await this.fetch(payload, env)).content;
    }

    const summary = await env.AI.run('@cf/meta/llama-3.2-3b-instruct', {
      messages: [
        {
          role: 'system',
          content: `Summarize in ${payload.maxLength || 500} words. ` +
                   `Style: ${context?.preferredStyle || 'technical'}.`
        },
        { role: 'user', content: content.slice(0, 15000) }
      ],
      max_tokens: 1024
    });

    return {
      summary: summary.response,
      source: payload.url || 'provided',
      wordCount: content.split(/\s+/).length,
      learning: {
        concept: `web:${new URL(payload.url).hostname}`,
        style: context?.preferredStyle
      }
    };
  },

  async extract(payload, env, context) {
    const extraction = await env.AI.run('@cf/meta/llama-3.2-3b-instruct', {
      messages: [
        {
          role: 'system',
          content: `Extract per schema: ${JSON.stringify(payload.schema)}. Return JSON only.`
        },
        { role: 'user', content: payload.content.slice(0, 15000) }
      ]
    });

    return {
      data: JSON.parse(extraction.response),
      schema: payload.schema
    };
  }
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}
```

### Configuration (wrangler.toml)

```toml
name = "deckboss-scout"
main = "src/index.ts"
compatibility_date = "2024-03-01"

[ai]
binding = "AI"

[[vectorize]]
binding = "VECTORIZE"
index_name = "deckboss-memory"

[[kv_namespaces]]
binding = "KV"
id = "your_kv_id"
```

---

## 6. Protocol Implementation

### A2A (Agent-to-Agent)

```typescript
// packages/core/src/a2a.ts
export interface AgentCard {
  protocolVersion: string;
  name: string;
  description: string;
  url: string;
  version: string;
  capabilities: { streaming?: boolean; pushNotifications?: boolean };
  skills: Skill[];
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  examples?: string[];
}

export interface Task {
  id: string;
  name: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  payload?: unknown;
  result?: { text?: string; json?: unknown; learning?: LearningData };
  error?: string;
}
```

### MCP (Model Context Protocol)

```typescript
// packages/core/src/mcp.ts
export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export const DECKBOSS_TOOLS: McpTool[] = [
  {
    name: 'deckboss_launch',
    description: 'Launch agent mission. Use background=true for persistence.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', enum: ['scout', 'archivist', 'machinist', 'sentry'] },
        mission: { type: 'string' },
        payload: { type: 'object' },
        background: { type: 'boolean', default: false }
      },
      required: ['agent', 'mission']
    }
  },
  {
    name: 'deckboss_status',
    description: 'Check mission status',
    inputSchema: {
      type: 'object',
      properties: { missionId: { type: 'string' } },
      required: ['missionId']
    }
  }
];
```

---

## 7. Storage & Data Management

### Cross-Store Strategy

| Store | Use | Avoid | Free Tier |
|-------|-----|-------|-----------|
| Vectorize | Semantic search, similarity | Exact lookup, filtering | 200K vectors |
| D1 | Structured data, SQL, BM25 text | High-write throughput | 5GB, 5M ops |
| KV | Fast reads, session state | Complex queries | 1GB, 100K ops |
| R2 | Large blobs, exports | Small frequent reads | 10GB |

### Hybrid Search (Archivist Pattern)

```typescript
const [keywords, vectors] = await Promise.all([
  env.D1.prepare(`
    SELECT * FROM code_index WHERE content LIKE ? LIMIT 20
  `).bind(`%${query}%`).all(),
  
  env.VECTORIZE.query(queryVector, { topK: 20 })
]);

// Reciprocal Rank Fusion
const scores = new Map<string, number>();
const k = 60;

keywords.results.forEach((r, i) => {
  scores.set(r.id as string, (scores.get(r.id) || 0) + 1 / (k + i + 1));
});

vectors.forEach((r, i) => {
  scores.set(r.id, (scores.get(r.id) || 0) + 1 / (k + i + 1));
});

return Array.from(scores.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);
```

---

## 8. Testing & Debugging

### Unit Tests (Vitest)

```typescript
// packages/agents/scout/src/index.test.ts
import { describe, it, expect, vi } from 'vitest';

describe('Scout', () => {
  it('summarizes', async () => {
    const mockEnv = { AI: { run: vi.fn().mockResolvedValue({ response: 'Test' }) } };
    const result = await HANDLERS.summarize(
      { url: 'https://example.com ' }, 
      mockEnv, 
      {}
    );
    expect(result.summary).toBe('Test');
  });
});
```

### Integration (Miniflare)

```bash
cd packages/agents/scout
miniflare src/index.ts --modules

curl http://localhost:8787/.well-known/agent.json
curl -X POST http://localhost:8787/execute \
  -d '{"mission":"fetch","payload":{"url":"https://example.com "}}'
```

### Debugging

| Issue | Check | Fix |
|-------|-------|-----|
| WebSocket drops | `ws.readyState`, network idle | Auto-reconnect in CLI |
| Mission stuck queued | `ctx.storage.setAlarm()` called? | Verify alarm timestamp |
| AI quota exceeded | `env.AI.run()` call count | Implement KV caching |
| Agent 404 | Worker deployed? | `wrangler deploy` |

### Observability

```typescript
console.log(JSON.stringify({
  level: 'info',
  component: 'director',
  event: 'mission_completed',
  missionId,
  duration: Date.now() - startTime
}));
```

Cloudflare Workers Analytics aggregates automatically.

---

## 9. Deployment & Operations

### Development

```bash
# Deploy Director (one-time)
cd packages/director && wrangler deploy

# Deploy agents
pnpm deploy:agents  # All agents
# OR individually:
cd packages/agents/scout && wrangler deploy
```

### Production Release

```bash
# 1. Changeset
pnpm changeset  # Interactive

# 2. Version
pnpm version-packages

# 3. Build & test
pnpm build && pnpm test

# 4. Publish npm (CLI, core)
pnpm release

# 5. Deploy edge
pnpm deploy:director && pnpm deploy:agents
```

### CI/CD

```yaml
# .github/workflows/release.yml
name: Release
on: { push: { branches: [main] } }

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install && pnpm test && pnpm build

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install
      - run: cd packages/director && wrangler deploy
        env: { CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }} }
      - run: pnpm deploy:agents
        env: { CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }} }
```

---

## 10. Extending Deckboss

### New Agent Template

```bash
cd packages/agents
cp -r template my-agent
# Edit src/index.ts: define SKILLS, HANDLERS
# Add to apps/web/src/lib/agents.ts for registry
```

### External Agent (A2A)

```typescript
// Register non-Deckboss agent
await director.registerExternalAgent({
  name: 'manus-bridge',
  url: 'https://manus-bridge.example.com ',
  protocol: 'a2a'
});

// Launch via standard interface
await director.queueMission({
  agent: 'manus-bridge',
  type: 'research_task',
  payload: { query: '...' }
});
```

---

## Quick Reference

### Commands

| Command | Purpose |
|---------|---------|
| `deckboss init` | Link Cloudflare account |
| `deckboss launch <agent> <mission>` | Execute now |
| `deckboss launch ... --background` | Queue for later |
| `deckboss status <id>` | Check mission |
| `deckboss recover <id>` | Get result |
| `deckboss deploy <agent>` | Deploy to Cloudflare |
| `deckboss squadron` | List agents |

### Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `CF_ACCOUNT_ID` | Yes | Cloudflare account |
| `CF_API_TOKEN` | Yes | Token with Workers, D1, Vectorize, KV permissions |

### Files

| Path | Purpose |
|------|---------|
| `~/.config/deckboss/config.json` | User credentials |
| `./deckboss.json` | Project config (agents, memory settings) |

---

**Build the flight deck. Launch your squadron.**
