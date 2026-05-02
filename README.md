# DeckBoss — The Agent Edge OS

> **Flight deck for AI agents.** Launch from Claude Code (or any MCP client), recover results anywhere, run background missions while you sleep. We're not another agent framework — we're the roads, fuel, and traffic laws that make persistent, self-improving agents the new normal.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [CLI Commands & API](#cli-commands--api)
- [Configuration](#configuration)
- [Squadrons (Built-in Agents)](#squadrons-built-in-agents)
- [Custom Squadrons](#custom-squadrons)
- [Integration with commodore-protocol & Fleet](#integration-with-commodore-protocol--fleet)
- [Repository Structure](#repository-structure)
- [Development](#development)
- [Roadmap](#roadmap)
- [License](#license)

---

## Overview

DeckBoss gives every MCP-native agent (Claude Code, Grok, Ollama, Cloudflare-native, ManusAI...) a **persistent, globally-distributed, continually-learning backend** that runs on *your* free Cloudflare account.

Claude handles reasoning. DeckBoss handles memory, orchestration, and background execution.

**Why DeckBoss?**

| Problem | DeckBoss Solution |
|---------|-------------------|
| Claude forgets everything when the laptop closes | Missions survive via Durable Objects + alarms |
| No background execution for long-running tasks | Edge-native parallel execution across 330+ locations |
| No persistent memory across sessions | Cognitive model with semantic + episodic + procedural memory |
| Context window fills up fast | Offload indexing, scraping, monitoring to agent squadrons |
| Expensive to run | Free tier: 10K AI inferences/day, 200K vectors, 5 GB D1, zero surprise bills |

### Key Principles

- **Free** — 10k AI inferences/day, 200k vectors, 5 GB D1, zero surprise bills
- **Persistent** — Missions survive laptop closure via Durable Objects + alarms
- **Parallel & Edge-Native** — 330+ locations, no Docker, no local infra
- **Yours** — Your CF account, your data, your cognitive model forever
- **General-purpose first** — One universal MCP server + Director core
- **Hyper-specific second** — Squadrons load as dynamic plugins (no monolith bloat)

---

## Features

### Core Capabilities

| Feature | Description | Status |
|---------|-------------|--------|
| **MCP Server** | Native Model Context Protocol integration with Claude Code, Windsurf, Grok, etc. | ✅ Stable |
| **Director Durable Object** | Per-user stateful brain — orchestration, state, continual learning (~200 LOC) | ✅ Stable |
| **Mission Manager** | Episodic memory + alarm-based scheduling for background tasks | ✅ Stable |
| **Cognitive Model** | Hybrid memory: semantic (Vectorize), episodic (SQLite), procedural (runbooks), graph (relations) | ✅ Stable |
| **Memory Weaver** | Continual learning loop — post-mission refinement via LLM distillation | 🚧 In Progress |
| **Squadron Router** | Embedding-based dispatch to specialized agents | 🚧 In Progress |
| **Hybrid Search** | Reciprocal Rank Fusion of D1 BM25 + Vectorize semantic search | ✅ Stable |
| **WebSocket Sync** | Real-time notifications, auto-reconnect with state reconciliation | ✅ Stable |
| **Quota Governance** | 80% quota warnings, graceful degradation, audit trail | 🚧 In Progress |
| **Python CLI** | Typer-based CLI with Rich output for `deckboss init`, `launch`, `status` | 🚧 In Progress |
| **A2A Routing** | Agent-to-Agent protocol for cross-agent interoperability (Grok, ManusAI, etc.) | 🔜 Planned |
| **Squadron Marketplace** | Shareable plugin ecosystem on deckboss.ai | 🔜 Planned |
| **Cognitive Graph Layer** | Entity/relation knowledge graph for deep context understanding | 🔜 Planned |

### The Three Killer Apps

1. **"Index my monorepo while I sleep"** — Launch Archivist in background; wake up to a fully searchable semantic index of every file.
2. **"Monitor these 50 URLs and alert me on changes"** — Sentry runs 24/7 on Cloudflare's edge, zero local compute.
3. **"Research this topic across 20 sources"** — Scout + Archivist squadron fetches, summarizes, and cross-references in parallel.

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DECKBOSS AGENT EDGE OS                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────┐                                              │
│  │  MCP Clients     │  Claude Code  •  Windsurf  •  Grok           │
│  │  (Any IDE/tool)  │  Ollama  •  ManusAI  •  Custom              │
│  └────────┬─────────┘                                              │
│           │  MCP JSON-RPC (tools/call, resources, sampling)        │
│           │  + Streamable HTTP + SSE transport                     │
│           ▼                                                         │
│  ┌──────────────────┐                                              │
│  │  DeckBoss CLI    │  Node.js / Python bridge                     │
│  │  (MCP Adapter)   │  ├── WebSocket to Director                   │
│  │                  │  ├── Quota checking                          │
│  │                  │  └── Auto-reconnect + state sync             │
│  └────────┬─────────┘                                              │
│           │  WSS (WebSocket Secure)                                │
│           ▼                                                         │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │  DIRECTOR — Durable Object (per-user, handmade core)     │      │
│  │                                                          │      │
│  │  ┌────────────────┐  ┌──────────────┐  ┌─────────────┐  │      │
│  │  │   Mission      │  │  Cognitive   │  │   Memory    │  │      │
│  │  │   Manager      │  │  Model       │  │   Weaver    │  │      │
│  │  │                │  │              │  │             │  │      │
│  │  │ • Queue/Exec   │  │ • Episodic   │  │ • Refine    │  │      │
│  │  │ • Alarms       │  │ • Semantic   │  │ • Distill   │  │      │
│  │  │ • Retries      │  │ • Procedural │  │ • Re-embed  │  │      │
│  │  │ • Track status │  │ • Graph      │  │ • Upsert    │  │      │
│  │  └───────┬────────┘  └──────────────┘  └─────────────┘  │      │
│  │          │                                                │      │
│  │  ┌───────▼────────┐                                       │      │
│  │  │   Squadron     │  Embedding-based routing              │      │
│  │  │   Router       │  Cosine similarity dispatch           │      │
│  │  └───────┬────────┘                                       │      │
│  └──────────┼────────────────────────────────────────────────┘      │
│             │  HTTP POST /execute                                     │
│             ▼                                                         │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │  SQUADRON PLUGINS (extensible, zero-bloat)               │      │
│  │                                                          │      │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │      │
│  │  │Archivist │ │  Scout   │ │Machinist │ │  Sentry  │   │      │
│  │  │Code index│ │Web fetch │ │Code exec │ │Monitoring│   │      │
│  │  │RAG+search│ │Summarize │ │Transform │ │Alerting  │   │      │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │      │
│  │                                                          │      │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐                 │      │
│  │  │  Custom  │ │  Custom  │ │  Custom  │  Marketplace   │      │
│  │  │  Agent   │ │  Agent   │ │  Agent   │  Plugins       │      │
│  │  └──────────┘ └──────────┘ └──────────┘                 │      │
│  └──────────────────────────────────────────────────────────┘      │
│             │                                                         │
│             ▼                                                         │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │  CLOUDFLARE PRIMITIVES (free-tier first, user-owned)     │      │
│  │                                                          │      │
│  │  Workers AI    │  Vectorize  │  D1 SQLite  │  R2        │      │
│  │  (embed/LLM)   │  (10M vec) │  (5GB)      │  (10GB)    │      │
│  │                                                          │      │
│  │  Queues  │  Workflows  │  Durable Objects  │  KV        │      │
│  └──────────────────────────────────────────────────────────┘      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Mission State Machine

```
  ┌─────────┐     ┌───────────┐     ┌─────────┐     ┌────────────┐
  │ Queued  │────▶│ Scheduled │────▶│ Active  │────▶│ Completed  │
  └─────────┘     └───────────┘     └────┬────┘     └────────────┘
      ▲                                  │
      │                                  ▼
      │            ┌──────────────────────────────┐
      │            │  Failed (retry with backoff) │
      │            └──────────────┬───────────────┘
      │                           │
      └───────────────────────────┘
                     max retries exceeded → Terminal failure
```

### Memory Stack

```
┌─────────────────────────────────────────────────┐
│              COGNITIVE MODEL                     │
├─────────────────────────────────────────────────┤
│  Episodic    │ Director SQLite + alarms          │
│  Semantic    │ Vectorize (BGE) + RRF + D1 BM25  │
│  Procedural  │ Stored runbooks + distilled skills│
│  Graph       │ SQLite edges (entity/relation)    │
├─────────────────────────────────────────────────┤
│  Memory Weaver  │ Continual learning loop        │
│                 │ Post-mission refinement        │
│                 │ Llama-3.2-3B distillation      │
└─────────────────────────────────────────────────┘
```

### Design Philosophy: Glue vs Handmade

| Layer | Approach | Rationale |
|-------|----------|-----------|
| **Director + Weaver** | Handmade (~200 LOC) | Owns orchestration, state, continual learning — control where it matters |
| **MCP Server** | Glue (official SDK) | Zero custom protocol, single Worker entrypoint |
| **Cloudflare Primitives** | Glue (official APIs) | Vectorize, D1, R2, Workers AI — zero maintenance |
| **Squadrons** | Plugin (separate Workers/DOs) | Zero overhead until used — specificity without bloat |

Result: General-purpose lightness + surgical specificity. No framework tax. One `wrangler deploy`.

---

## Quick Start

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20.x LTS | Runtime |
| pnpm | 8.x | Package manager (workspaces) |
| Wrangler CLI | 3.22+ | Cloudflare deployment |
| Git | 2.40+ | Version control |

### Install

```bash
# Option A — TypeScript (recommended for existing users)
npm install -g deckboss

# Option B — Python-first (recommended for MCP/Code Mode)
pipx install deckboss
```

### One-Click Init

```bash
deckboss init
```

This does everything in under 60 seconds:

1. Opens browser to log you into Cloudflare
2. Creates your personal Director Durable Object
3. Provisions Vectorize index + D1 database + R2 bucket with correct bindings
4. Deploys the lightweight MCP Server (Python or TS)
5. Generates `~/.config/deckboss/config.json` + local `.env`
6. Prints one-line Claude Code integration command

### Connect Claude Code

```bash
claude mcp add deckboss -- npx deckboss mcp-server
```

### First Mission

```
"Launch archivist to index my monorepo"
```

---

## CLI Commands & API

### CLI Reference

| Command | Description | Example |
|---------|-------------|---------|
| `deckboss init` | Link Cloudflare account, provision all resources | `deckboss init --runtime python` |
| `deckboss launch <agent> <mission>` | Execute mission immediately | `deckboss launch scout fetch` |
| `deckboss launch ... --background` | Queue for background execution | `deckboss launch archivist index --background` |
| `deckboss status <id>` | Check mission status | `deckboss status 7A3F` |
| `deckboss recover <id>` | Retrieve completed mission result | `deckboss recover 7A3F` |
| `deckboss squadron` | List active squadrons | `deckboss squadron` |
| `deckboss squadron create <name>` | Create custom squadron | `deckboss squadron create my-reviewer --template scout --lang python` |
| `deckboss mcp-server` | Run MCP server (Claude Code integration) | `deckboss mcp-server --port 8000` |
| `deckboss deploy mcp` | Deploy MCP server to Cloudflare | `deckboss deploy mcp --runtime python` |

### MCP Tools (Exposed to Claude Code)

| Tool | Description | Key Parameters |
|------|-------------|----------------|
| `deckboss_launch` | Launch a persistent mission on the edge | `agent`, `mission`, `payload`, `background` |
| `deckboss_status` | Check mission status | `missionId` |
| `deckboss_query_memory` | Search cognitive model (hybrid search) | `query`, `filters` |
| `deckboss_generate_image` | Generate images via FLUX | `prompt`, `style` |
| `deckboss_code_mode_exec` | Execute compact Python against SDK | `code` |

### Python MCP Server

```bash
# Run locally for development
deckboss mcp-server --port 8000

# Deploy as Cloudflare Python Worker (production)
deckboss deploy mcp --runtime python
```

Claude discovers it automatically via `/.well-known/mcp.json`.

---

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CF_ACCOUNT_ID` | Yes | Cloudflare account ID |
| `CF_API_TOKEN` | Yes | Token with Workers, D1, Vectorize, KV permissions |

### Config Files

| Path | Purpose |
|------|---------|
| `~/.config/deckboss/config.json` | User credentials + Director URL |
| `./deckboss.json` | Project-level config (agents, memory settings) |
| `.env` | Local secrets (never committed) |

### wrangler.toml Bindings

```toml
# Cloudflare resource bindings (auto-generated by deckboss init)
[ai]
binding = "AI"                          # Workers AI (LLM + embeddings)

[[vectorize]]
binding = "COGNITIVE_MODEL"             # Semantic memory vectors
index_name = "deckboss-cognitive"

[[d1_databases]]
binding = "DB"                          # SQLite (missions, memory, graph)
database_name = "deckboss-db"

[r2_buckets]
binding = "ARTIFACTS"                   # Large file storage
bucket_name = "deckboss-artifacts"

[durable_objects]
bindings = [{ name = "DIRECTOR", class_name = "Director" }]

[[routes]]
pattern = "deckboss.yourdomain.com/mcp"
custom_domain = true                    # MCP discovery route
```

### Cloudflare Storage Strategy

| Store | Best For | Free Tier |
|-------|----------|-----------|
| **Vectorize** | Semantic search, similarity | 200K vectors |
| **D1** | Structured data, BM25 text search | 5GB, 5M reads/day |
| **KV** | Fast reads, session cache, response caching | 1GB, 100K ops/day |
| **R2** | Large blobs, exports, artifacts | 10GB |

---

## Squadrons (Built-in Agents)

### The Four Core Squadrons

| Agent | Specialty | Missions |
|-------|-----------|----------|
| **Archivist** | Code indexing, semantic search, pattern matching | `index`, `search`, `audit`, `crossref` |
| **Scout** | Web exploration, content extraction | `fetch`, `summarize`, `extract`, `monitor` |
| **Machinist** | Code execution, transformation, generation | `run`, `transform`, `generate`, `sandbox` |
| **Sentry** | Scheduled monitoring, health checks, cron jobs | `watch`, `health`, `alert`, `cron` |

### Agent Card (A2A Discovery)

Every agent exposes `GET /.well-known/agent.json` for agent-to-agent interoperability.

```typescript
{
  protocolVersion: "0.3.0",
  name: "deckboss-scout",
  description: "Web exploration agent. Fetches URLs, summarizes, extracts structured data.",
  capabilities: { streaming: false },
  skills: [
    { id: "fetch", name: "Fetch URL", description: "Retrieves raw content with caching" },
    { id: "summarize", name: "Summarize Content", description: "AI-generated summary" },
    { id: "extract", name: "Extract Structured Data", description: "Extracts per JSON schema" }
  ]
}
```

---

## Custom Squadrons

### Create a Custom Agent

```bash
# Scaffold from template
deckboss squadron create my-legal-reviewer --template scout --lang python

# Or manually:
cd packages/agents
cp -r template my-agent
# Edit src/index.ts: define SKILLS, HANDLERS, learning feedback
wrangler deploy
deckboss register my-agent --url https://my-agent.your-account.workers.dev
```

### Register External A2A Agent

```typescript
await director.registerExternalAgent({
  name: 'manus-bridge',
  url: 'https://manus-bridge.example.com',
  protocol: 'a2a'
});

// Use via standard interface
await director.queueMission({
  agent: 'manus-bridge',
  type: 'research_task',
  payload: { query: '...' }
});
```

---

## Integration with commodore-protocol & Fleet

DeckBoss operates as a **vessel** in the [SuperInstance](https://github.com/superinstance) fleet ecosystem, following the **commodore-protocol** (Cocapn) standards.

### Fleet Integration Points

| Integration | Protocol | Description |
|-------------|----------|-------------|
| **Git-Agent Standard v2.0** | Git-based | Every commit is a capability snapshot; repo IS the agent |
| **I2I (Instance-to-Instance)** | Message passing | Fleet inter-communication via bottle system |
| **Dockside Exam** | Certification checklist | Fleet readiness scoring (target: 30+/47) |
| **Living Manual** | Documentation | CHARTER.md, STATE.md, ABSTRACTION.md maintained per-vessel |
| **Tender Protocol** | Edge sync | Tender vessels visit remote agents, exchange bottles, carry diffs |

### Fleet Files

| File | Purpose | Status |
|------|---------|--------|
| `CHARTER.md` | Mission, type, origin, captain, refactoring plan | ✅ |
| `STATE.md` | Current health, phase, fleet score | ✅ |
| `ABSTRACTION.md` | Primary abstraction plane | ✅ |
| `DOCKSIDE-EXAM.md` | Fleet certification checklist | ✅ |
| `REFACTOR-NOTES.md` | Refactoring progress and TODOs | ✅ |

### Fleet Communication

```
┌─────────────┐     I2I Protocol      ┌──────────────┐
│  DeckBoss   │◄──────────────────────▶│  Fleet API   │
│  (vessel)   │    bottle system       │  (:8901)     │
└──────┬──────┘                        └──────────────┘
       │
       ├── from-fleet/    (inbound messages)
       ├── for-fleet/     (outbound messages)
       └── DIARY/         (learning journal)
```

### Fleet Score

Current fleet score: **75/100** (active, OS vision written, awaiting build phase)

See `STATE.md` for live status and `DOCKSIDE-EXAM.md` for the full certification checklist.

---

## Repository Structure

```
deckboss/
├── apps/
│   └── cli/
│       └── deckboss/          # Typer CLI + init/deploy commands (Python)
│           ├── __init__.py    # CLI entry: init, launch commands
│           └── pyproject.toml # Python package config
├── packages/
│   ├── core/
│   │   ├── src/
│   │   │   ├── index.ts       # Zod schemas + MCP-compliant types
│   │   │   └── __tests__/
│   │   │       └── deckboss.test.ts  # Vitest test suite
│   │   ├── package.json      # @deckboss/core npm package
│   │   └── vitest.config.ts  # Test configuration
│   └── director/
│       └── src/
│           └── index.ts       # Director Durable Object (handmade core)
├── .github/workflows/
│   └── ci.yml                # GitHub Actions CI (Node 18/20)
├── CHARTER.md                 # Fleet vessel charter
├── STATE.md                   # Fleet vessel state
├── ABSTRACTION.md             # Abstraction plane documentation
├── DOCKSIDE-EXAM.md           # Fleet certification checklist
├── Architecture0.1.md         # Detailed architecture blueprint
├── OS-VISION.md               # Long-term OS vision
├── Dev_Guide0.1.md            # Developer guide (v1)
├── Dev_Guide0.1.1.md          # Developer guide (v1.1 — expanded)
├── Dev_Guide_add.md           # Developer guide supplement
├── turbo.json                 # Turborepo build pipeline
├── wrangler.toml              # Cloudflare Worker config + bindings
├── package.json               # Root workspace config
└── LICENSE                    # MIT License
```

**Monorepo principle**: Apps are user-facing. Packages are infrastructure. Turborepo handles the dependency graph.

---

## Development

### Setup

```bash
git clone https://github.com/superinstance/deckboss.git
cd deckboss
npm install

# Authenticate with Cloudflare
npx wrangler login

# Build and test
npm run build
npm run test

# Development mode
npm run dev
```

### Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Build all packages (via Turborepo) |
| `npm run dev` | Start development servers |
| `npm run test` | Run test suites (Vitest) |
| `npm run lint` | Lint all packages |
| `npm run typecheck` | Type-check all packages |
| `npm run deploy` | Deploy to Cloudflare (wrangler deploy) |

### Testing

```bash
# Run all tests
cd packages/core && npm test

# Local agent testing with Miniflare
cd packages/agents/scout
npx miniflare src/index.ts --modules
curl http://localhost:8787/.well-known/agent.json
```

---

## Roadmap

- [x] Director + Memory Weaver v1 architecture
- [x] CHARTER + DOCKSIDE-EXAM + fleet certification docs
- [x] Core types + MCP tool definitions + Zod schemas
- [x] CI pipeline (GitHub Actions)
- [ ] Full Director Durable Object implementation
- [ ] A2A routing to Grok / external agents
- [ ] Squadron marketplace launch
- [ ] Cognitive model graph layer
- [ ] Self-improving nightly Weaver jobs
- [ ] Public shared squadron registry

---

## License

MIT. Your account. Your agents. Your data.

**DeckBoss** — The missing OS layer for the agent economy. Built for developers who want their AI to work while they sleep.

---

<img src="callsign1.jpg" width="128" alt="callsign">

🦐 Cocapn fleet — lighthouse keeper architecture
