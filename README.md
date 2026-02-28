# Deckboss

**Flight deck for AI agents. Launch from Claude Code, recover results anywhere, run background missions while you sleep.**

---

## What This Does

You already use Claude Code. It thinks well, costs money, stops when you close your terminal.

Deckboss adds a second crew that runs on your Cloudflare account:

- **Free** (10K AI inferences/day, 100K requests)
- **Persistent** (missions survive laptop closure)
- **Parallel** (run 10 agents across 330+ edge locations)
- **Yours** (your account, your data, no lock-in)

Claude's crew handles reasoning. Deckboss crew handles persistence, background execution, and hybrid search. Same mission. Better coverage.

---

## The Killer App: Three Things You Couldn't Do Before

### 1. Close Your Laptop, Keep Working

```bash
# In Claude Code
"Audit my entire codebase for security issues. I need it tomorrow morning."

# Claude launches Archivist via Deckboss
# You see: "Mission 7A3F queued. Check status with deckboss_status"

# You close laptop, go to sleep
# Archivist runs 6 hours on Cloudflare's edge
# Results stored in your D1 database

# Next morning
deckboss_status 7A3F
# Claude reads results, explains in your preferred technical depth
```

**Before**: Claude Code stops when terminal closes. Background tasks die.

**Now**: Missions persist 24/7. Resume anywhere.

---

### 2. Infinite Context Without Token Bloat

```bash
# Your codebase: 500K lines, 5 years of history
# Claude's context window: 200K tokens (~150K lines)

"Find every instance of this pattern across my entire codebase history"

# Claude launches Archivist
# Archivist queries Vectorize (semantic) + D1 (BM25 keyword)
# Returns top 50 most relevant matches
# Claude receives 50 matches, not 500K lines
```

**Before**: Context limits force you to chunk and guess.

**Now**: Hybrid RAG retrieves exactly what matters. Claude focuses on synthesis, not search.

---

### 3. Your Shorthand, Automatically

```bash
# First interaction
You: "Fix that ghost effect thing in the auth module"
Claude: "I'm not sure what you mean..."

# You explain: "The useEffect cleanup issue, I call it ghost effect"
# Archivist stores: "ghost effect thing" → useEffect cleanup

# Two weeks later
You: "Check for ghost effect issues in the new module"
Claude: "Found 3 useEffect cleanup issues. You call this 'ghost effect'—here's the pattern you prefer..."
```

**Before**: Every session starts generic. You re-explain your mental models.

**Now**: Deckboss builds your cognitive model. Claude speaks your language automatically.

---

## How It Works

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Claude Code   │────▶│   Deckboss CLI  │────▶│   Director (DO) │
│   (Your machine)│ MCP │   (Your machine)│ WS  │   (Cloudflare)  │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                              ┌────────────────────────┼────────────────────────┐
                              │                        │                        │
                              ▼                        ▼                        ▼
                         ┌─────────┐            ┌─────────┐            ┌─────────┐
                         │  Scout  │            │Archivist│            │Machinist│
                         │Web fetch│            │Code idx │            │Execute  │
                         │Summarize│            │Search   │            │Transform│
                         └─────────┘            └─────────┘            └─────────┘
                              │                        │                        │
                              └────────────────────────┴────────────────────────┘
                                                         │
                                                         ▼
                                              ┌─────────────────┐
                                              │   D1 + Vectorize │
                                              │   (Your memory)  │
                                              └─────────────────┘
```

**Director**: One Durable Object per Cloudflare account. Survives forever. Queues missions, maintains WebSocket, stores your cognitive model.

**Squadron**: Stateless Workers. Scout (web), Archivist (search), Machinist (execution), Sentry (monitoring). Deploy to your account.

**Memory**: Vectorize (semantic embeddings) + D1 (structured SQL) + KV (fast cache). Hybrid search via Reciprocal Rank Fusion.

---

## Installation

```bash
npm install -g deckboss

deckboss init
# Opens browser to link your Cloudflare account
# Creates ~/.config/deckboss/config.json

# Verify
deckboss status
# Shows: Director healthy, 0 active missions, quota: 0/10000 neurons
```

---

## Usage

### From Claude Code

Add to your `CLAUDE.md`:

```markdown
## Deckboss Integration

Launch edge agents for persistence and scale.

### Available Agents
- `scout`: Web fetch, summarize, extract
- `archivist`: Code indexing, hybrid search
- `machinist`: Code execution, transformation
- `sentry`: Cron jobs, monitoring

### Tools
- `deckboss_launch(agent, mission, payload, background?)`
- `deckboss_status(mission_id)`
- `deckboss_squadron(agents[], mission)` // parallel launch

### When to use
- Background analysis (security audits, large refactors)
- Hybrid search (pattern matching across codebase)
- Web research (fetch docs without burning tokens)
- Scheduled tasks (daily reports, health checks)

### Examples
- "Launch archivist to index my codebase"
- "Background: scout this API and summarize auth patterns"
- "Squadron: check security, performance, and docs for this PR"
```

Or add via CLI:

```bash
claude mcp add deckboss -- npx deckboss mcp-server
```

### Manual CLI

```bash
# Deploy an agent
deckboss deploy scout --name my-scout

# Launch immediate mission
deckboss launch my-scout fetch_and_summarize \
  --payload '{"url": "https://api.example.com/docs"}'

# Launch background mission
deckboss launch archivist security_audit \
  --payload '{"scope": "src/auth/**/*"}' \
  --background

# Check status
deckboss status 7A3F

# View all missions
deckboss missions --all

# Recover result
deckboss recover 7A3F --format markdown
```

---

## Architecture

### Why This Exists

| System | Problem | Deckboss |
|--------|---------|----------|
| **LangChain** | "Makes simple things relatively complex" [^1] | Direct HTTP. No framework. |
| **CrewAI** | "Manager loops indefinitely, sequential not parallel" [^2] | Deterministic queue. No LLM in the loop. |
| **AutoGPT** | "Hallucination propagation, silent failures" [^3] | Structured output, retry logic, visible logs. |
| **OpenManus** | Heavy Docker, local resource limits | Zero local infrastructure. Pure edge. |

[^1]: [LangChain criticism](https://www.reddit.com/r/LangChain/comments/1f4nm5v/why_is_langchain_so_hated/)
[^2]: [CrewAI hierarchical issues](https://www.reddit.com/r/ClaudeAI/comments/1j5xnv6/crewai_hierarchical_process_is_not_working/)
[^3]: [AutoGPT limitations](https://www.reddit.com/r/ClaudeAI/comments/1k2b8a5/why_are_people_so_excited_about_manusai/)

### Technical Stack

- **Runtime**: Cloudflare Workers (isolate), Durable Objects (SQLite)
- **AI**: Workers AI (Llama 3.2, BGE embeddings, FLUX)
- **Storage**: Vectorize (vectors), D1 (SQL), KV (cache), R2 (artifacts)
- **Protocol**: MCP (Claude integration), A2A (agent interoperability)
- **Language**: TypeScript throughout

### Free Tier Limits

| Resource | Limit | Usage |
|----------|-------|-------|
| Workers AI | 10K neurons/day | ~3K Llama 3.2 inferences |
| Vectorize | 200K vectors | Codebase embeddings |
| D1 | 5GB, 5M ops | Mission logs, cognitive model |
| KV | 1GB, 100K ops | Config, session cache |
| DO requests | 1M/month | Director coordination |

**Hard stops at 80%**. No surprise bills. Queue excess for tomorrow.

---

## Repository Structure

```
deckboss/
├── apps/
│   ├── cli/              # MCP server, npm package 'deckboss'
│   └── web/              # deckboss.ai platform (Next.js)
├── packages/
│   ├── core/             # Shared types, A2A protocol
│   ├── agents/           # Scout, Archivist, Machinist, Sentry
│   └── director/         # Durable Object source
├── docs/                 # Architecture, agent authoring
└── examples/             # Working demos
```

See [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) for contribution details.

---

## Custom Agents

```bash
# Scaffold new agent
deckboss agent create my-agent --template scout

# Edit
code packages/agents/my-agent/src/index.ts

# Deploy
deckboss deploy my-agent --name production-my-agent

# Share (optional)
deckboss share my-agent --to deckboss.ai/community
```

Agent template:

```typescript
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    // A2A discovery
    if (req.url.endsWith('/.well-known/agent.json')) {
      return Response.json({
        name: 'my-agent',
        skills: [{ id: 'my_skill', name: 'My Skill' }]
      });
    }
    
    // Execute
    const { mission, payload } = await req.json();
    const result = await handle(mission, payload, env);
    
    return Response.json(result);
  }
};
```

---

## The deckboss.ai Platform

**deckboss.ai**: Mission control. Browse squadron registry. View flight logs. Join community.

**deckboss.net**: Community hub. Share agents. Earn Atabey recognition.

**Pricing**:
- **Free**: 5 missions/day, basic logs, community access
- **$1/month**: Unlimited missions, priority support, Atabey eligibility
- **Enterprise**: Custom domains, SLA, dedicated Directors

The $1 is for convenience and community, not compute. Compute is free on Cloudflare.

---

## Roadmap

- [x] Core agents (Scout, Archivist)
- [x] Director with queue + memory
- [ ] Machinist + Sentry agents
- [ ] Background mission recovery
- [ ] Cognitive model personalization
- [ ] deckboss.ai platform
- [ ] A2A external agents (ManusAI, Ollama)
- [ ] Universal agent bridge

---

## License

MIT. Your account. Your agents. Your data.

---

**Deckboss**: Launch agents. Recover results. Coordinate chaos.

*Built for developers who want their AI to work while they sleep.*
