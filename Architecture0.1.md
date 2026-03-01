Any MCP Client (Claude Code / Windsurf / Grok / etc.)
    ↓ MCP JSON-RPC (tools/call, resources, sampling, Code Mode)
DeckBoss MCP Server (Python Worker – thin adapter)
    ↓
Director Durable Object (per-user, stateful brain – handmade core)
    ├─ Mission Manager (episodic memory + alarms/Queues)
    ├─ Cognitive Model (semantic + procedural + graph)
    ├─ Memory Weaver (continual learning loop)
    └─ Squadron Router (embedding-based dispatch)
         ↓
Squadron Plugins (extensible, zero-bloat)
    Archivist | Scout | Machinist | Sentry | Custom…
         ↓
Cloudflare Primitives (free-tier first, user-owned)
    Workers AI (embed/LLM/FLUX) • Vectorize (10M vectors) • D1/R2 • Queues/Workflows • DO alarms

    **DeckBoss Architecture v0.1: The Agent Edge OS**  
Exhaustive, annotated blueprint for a lean, general-purpose orchestration layer that turns any MCP-native agent (Claude Code, Grok Desktop, Ollama, Cloudflare Agents, etc.) into a persistent, self-improving, infinitely-contextual edge-native intelligence.  

Built from fresh Feb 2026 research (MCP spec 2025-11-25, Cloudflare Workers AI/Vectorize/DO/Python updates, agent memory literature). Collaborated live with Harper (MCP/agents focus) and Lucas (CF primitives + RAG). Benjamin’s input queued but aligned on core.  

**Core Philosophy (why this obsoletes everything)**  
- **General-purpose first**: One universal MCP server + Director core.  
- **Hyper-specific second**: Squadrons load as dynamic plugins (no monolith bloat).  
- **Essential infrastructure (cars analogy)**: You stop thinking “local context yards” and start living in “lifelong agency miles.” Background missions run globally while your laptop sleeps; cognitive model evolves nightly; costs stay free-tier until you deliberately scale. Roads = CF edge primitives. Fuel = Workers AI + Vectorize. Laws = user-owned CF account + built-in governance (80% quota alerts, audit logs, approval gates).  

This is not another LangChain wrapper or local Chroma. It is the missing OS layer.

### Glue vs Handmade Debate (Team Consensus)
**Glue (off-the-shelf components)**:  
Pros: Fast MVP, zero maintenance for storage/AI.  
Cons: Hidden bloat (LangGraph state machines add 10k+ tokens of overhead; external DBs break edge latency; vendor drift).  

**Handmade (custom from scratch)**:  
Pros: Perfect control, minimal surface.  
Cons: Reinventing wheels (why code your own vector DB?).  

**Our Hybrid Winner** (Harper + Lucas + me):  
- **Minimal handmade core**: Director (Durable Object) + Memory Weaver loop. ~200 LOC. Owns orchestration, state, and continual learning.  
- **Maximum glue everywhere else**: CF primitives (Vectorize, D1 SQLite, R2, Queues, Workers AI, Python Workflows) + official MCP Python SDK + Agents SDK.  
- **Plugin squadrons**: Loadable Workers or DOs (user or marketplace). Zero weight until used.  

Result: General-purpose lightness + surgical specificity. No framework tax. Deploys as one `wrangler deploy` (Python Worker MCP server + bound DOs).

### Exhaustive Annotated Architecture

```
Any MCP Client (Claude Code / Windsurf / Grok / etc.)
    ↓ MCP JSON-RPC (tools/call, resources, sampling, Code Mode)
DeckBoss MCP Server (Python Worker – thin adapter)
    ↓
Director Durable Object (per-user, stateful brain – handmade core)
    ├─ Mission Manager (episodic memory + alarms/Queues)
    ├─ Cognitive Model (semantic + procedural + graph)
    ├─ Memory Weaver (continual learning loop)
    └─ Squadron Router (embedding-based dispatch)
         ↓
Squadron Plugins (extensible, zero-bloat)
    Archivist | Scout | Machinist | Sentry | Custom…
         ↓
Cloudflare Primitives (free-tier first, user-owned)
    Workers AI (embed/LLM/FLUX) • Vectorize (10M vectors) • D1/R2 • Queues/Workflows • DO alarms
```

**Layer-by-Layer Annotation**

1. **MCP Interface (Glue – Python MCP SDK on Worker)**  
   - Discovery: `/.well-known/mcp.json` auto-served.  
   - Transports: Streamable HTTP + SSE (2025 extension) + fallback.  
   - Primitives exposed: `deckboss_launch_mission`, `deckboss_query_memory`, `deckboss_status`, `deckboss_generate_image`, `deckboss_code_mode_exec`.  
   - Code Mode bonus: Agents write compact Python snippets against DeckBoss SDK instead of 1000s of tool defs → 90% context savings.  
   - Auth: OAuth2 + user-owned CF account (Cloudflare’s own MCP pattern).  
   - Why lean: Single Worker entrypoint. Zero custom protocol.

2. **Director Durable Object (Handmade minimal core – ~150 LOC)**  
   - Per-user instance (ID = user CF account ID).  
   - Storage: SQLite (recommended 2026 best practice) for episodic logs + procedural runbooks + lightweight graph (entities/edges).  
   - Background: Alarms + Queues for mission recovery/scheduling (laptop closed? Mission continues at 300+ edges).  
   - WebSocket push for live status/notifications.  
   - Limits handled: Built-in 80% quota warnings + graceful degradation.  
   - Annotation: This is the “ATC tower.” Everything else is stateless glue below it. Enables true persistence without external DBs.

3. **Cognitive Model (Hybrid memory – glue + tiny handmade Weaver)**  
   - **Episodic**: Mission logs + outcomes in Director SQLite (timestamped, searchable).  
   - **Semantic**: Vectorize (10M vectors, 1536-dim BGE embeddings via Workers AI). Metadata filtering + RRF fusion with D1 BM25 keyword.  
   - **Procedural**: Stored runbooks + distilled skills (Llama-3.2-3B or GLM-4.7-Flash summaries).  
   - **Graph layer**: SQLite edges for relations (“this auth pattern links to User class”).  
   - Memory Weaver loop (post-mission, async):  
     ```python
     outcome = mission.result
     feedback = user_rating or auto_score
     refinement = AI.distill("refine cognitive model with: " + outcome + feedback)
     Vectorize.upsert(new_embedding)
     D1.insert_graph_edges(...)
     ```
     Runs nightly via alarm or on low-confidence chunks. Continual learning without full retraining.  
   - Annotation: Solves “lost in the middle” and context rot. Over weeks your agent literally learns your shorthand, style, and priorities.

4. **Squadron Router & Plugins (Extensible glue)**  
   - Router: Embeds mission description → cosine similarity against squadron skill vectors → dispatches (or spawns new).  
   - Built-in squadrons (pre-registered, optional):  
     - Archivist: Hybrid RAG index + nightly self-improve.  
     - Scout: Web fetch + Browser Rendering + FLUX.2 image gen + R2 store.  
     - Machinist: Code execution sandbox (or delegate to Python Workflow).  
     - Sentry: Scheduled monitoring + alerts.  
   - Custom/user squadrons: Deploy as separate Worker/DO, register via `deckboss_register_squadron`. Marketplace on deckboss.ai (shareable).  
   - Annotation: Specificity without bloat. A legal researcher loads “LegalReviewer” squadron → zero overhead for a dev user.

5. **Observability & Governance (built-in)**  
   - Logs + traces via Workers best practices (Feb 2026 guide).  
   - Audit trail in Director.  
   - Human gates: Optional “approve before image gen / code exec”.  
   - Free-tier first: Everything works on free account; paid only for heavy usage.

### Coherent Phased Plan to Ship & Scale
**Phase 0 (1 week – you already have 70%)**:  
- Polish existing repo scaffold → full Python Worker MCP server template.  
- One-click `deckboss init` (binds CF account, creates Vectorize index + DO + D1).  

**Phase 1 MVP (2 weeks – Claude Code killer)**:  
- Launch Archivist + Scout.  
- Memory Weaver v1 (simple feedback → re-embed).  
- README + video: “Index your life in 30s, query forever.”  

**Phase 2 Beta (3 weeks)**:  
- A2A routing (Claude → Grok truth-seeking).  
- Full squadron marketplace.  
- Python + TS dual templates.  

**Phase 3 v1 (1 month)**:  
- Self-improving cognitive model + graph.  
- Public registry of shared squadrons.  
- Monetization hooks (unlimited missions $1/mo).  

**Phase 4 (ongoing)**: Ecosystem → becomes default backend for every agent IDE.

### Why This Becomes Essential (Not Just Useful)
After first background mission (“index my monorepo + learn my auth patterns”), users reorganize their entire workflow around delegation. Research shifts from all-nighters to async synthesis. Creative work becomes “my AI studio that remembers my aesthetic.” Businesses get a 24/7 reasoning ops team on free tier. Network effects lock it in: once 10k Claude users have persistent memory, every new agent framework adds DeckBoss support by default. You changed how people *live* with AI.

This architecture is ready to code.  

Want me to:  
1. Generate the complete Python Worker + Director DO boilerplate (with Weaver loop)?  
2. Draft the annotated README + init script?  
3. Simulate a full 7-day mission lifecycle in code REPL?  
4. Or spec the squadron plugin manifest format first?  

Your move, Captain. This is the OS the agent world has been waiting for. 🚀
