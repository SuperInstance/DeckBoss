
# MCP Tool Schemas — Complete Reference for Claude_Baton

**Version:** 1.0 (March 2026)  
**Based on:** Official Model Context Protocol Specification v2025-11-25 (https://modelcontextprotocol.io/specification/2025-11-25) + Anthropic Claude Code integration docs.

This file explains **exactly** how tool schemas work in MCP, how we use them in BatonRAG, and how to extend them safely.

### What is an MCP Tool Schema?

An MCP tool schema is the machine-readable contract that tells any MCP client (Claude Code, Claude Desktop, Cursor, etc.):

- What the tool is called
- What it does (human + machine description)
- Exactly what parameters it accepts (types, required fields, constraints)
- (Optional) What it returns

It is **standard JSON Schema** (draft 2020-12) placed inside the `inputSchema` field.  
Claude Code automatically discovers these schemas when your plugin loads the MCP server and injects the tools into the agent’s available tool list.

This is why BatonRAG gives every new generation `/search-past` and `/recall-decision` for free — the schema tells Claude exactly how to call them.

### Two Ways to Declare Tools (both used in Claude_Baton)

1. **Static declaration** — in `.mcp.json` (what we used in MCP_SERVER_SETUP.md)
2. **Dynamic declaration** — in code using `@server.tool` decorator (recommended for complex logic)

Both produce the exact same schema format that Claude sees.

### Full Tool Object Structure (Official)

```json
{
  "name": "search-past",                          // REQUIRED — must be unique in the server
  "description": "Semantic search across all previous generations...",  // REQUIRED — shown to the model
  "inputSchema": { ... JSON Schema object ... },  // REQUIRED
  "outputSchema": { ... optional ... }            // Recommended for complex returns
}
```

### The `inputSchema` Field — Deep Dive

This is a full JSON Schema object. Here is the exact one we use in BatonRAG:

```json
"inputSchema": {
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Natural language search query"
    },
    "limit": {
      "type": "integer",
      "description": "Maximum number of results",
      "default": 5,
      "minimum": 1,
      "maximum": 20
    },
    "generations": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Optional: restrict search to specific generations (e.g. [\"v3\", \"v5\"])"
    }
  },
  "required": ["query"]   // Only query is mandatory
}
```

**Supported JSON Schema features (all work in Claude Code 2026)**

- `type`, `properties`, `required`, `default`
- `enum`, `minimum`/`maximum`, `minLength`/`maxLength`
- `items` (for arrays), `additionalProperties: false`
- `description` on every field (Claude reads these!)
- Nested objects (e.g. complex filters)

**Pro tip:** Always add `description` to every property — Claude uses them heavily for reasoning.

### How We Declare Tools in BatonRAG (Both Styles)

**Style 1: Static (.mcp.json)** — already in your server
See the exact block in `mcp/baton-rag/.mcp.json` (from MCP_SERVER_SETUP.md).

**Style 2: Code decorator (Python) — cleaner for future extensions**

```python
@server.tool(
    name="search-past",
    description="Semantic search across all previous generations",
    input_schema={
        "type": "object",
        "properties": {
            "query": {"type": "string"},
            "limit": {"type": "integer", "default": 5}
        },
        "required": ["query"]
    }
)
def search_past(ctx, query: str, limit: int = 5):
    ...
```

(The SDK auto-generates the `inputSchema` wrapper.)

### How Claude Code Uses the Schema

1. Plugin loads → MCP server starts → Claude Code calls `list_tools()` on your server.
2. It receives the full schema.
3. Converts `inputSchema` → internal `input_schema` for Claude’s tool-use system.
4. When an agent (especially a Young Agent) wants to recall history, it sees the tools and generates a perfectly typed call.
5. Claude Code validates the call against the schema before sending it to your server.

This validation is strict — wrong types or missing required fields are rejected automatically.

### Best Practices for Claude_Baton (and any MCP plugin)

1. **Keep schemas small** — every extra property costs tokens when listed.
2. **Be extremely descriptive** — put usage examples and edge cases in the top-level `description`.
3. **Use defaults wisely** — reduces what the model has to specify.
4. **Add `additionalProperties: false`** — prevents accidental junk parameters.
5. **Always implement error handling** in the tool function (return clear error objects).
6. **Version your tools** — add `v1_` prefix if you change schema later.
7. **Test with real agents** — use `/search-past` in a fresh generation to confirm.

### Example: Full recall-decision Schema (copy-paste ready)

```json
{
  "name": "recall-decision",
  "description": "Fetch exact decision rationale by ID or keywords. Use this when you need to know WHY we made a choice.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "decisionId": { "type": "string", "description": "Exact ID like DEC-042" },
      "keywords": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Alternative: search by keywords"
      }
    },
    "oneOf": [
      { "required": ["decisionId"] },
      { "required": ["keywords"] }
    ]
  }
}
```

### Common Gotchas (2026)

- Do **not** use `input_schema` in `.mcp.json` — it must be `inputSchema`.
- Arrays and objects must be properly typed or Claude may hallucinate calls.
- Internal tools (like our `index-generation`) can omit them from the public list by marking `internal: true`.
- If you change a schema, restart the MCP server (Claude Code auto-reloads on plugin changes).

### Quick Reference Cheat Sheet

| Part              | Required? | What it does                              | BatonRAG example          |
|-------------------|-----------|-------------------------------------------|---------------------------|
| name              | Yes       | Unique identifier                         | `search-past`             |
| description       | Yes       | Shown to the model                        | Full natural-language     |
| inputSchema       | Yes       | JSON Schema for parameters                | query + limit             |
| outputSchema      | Optional  | Expected return shape                     | {hits: [...]}             |
| required[]        | Recommended | Must-have fields                        | ["query"]                 |

---

**Commit this file now.**

You now have the complete, authoritative reference for every tool you will ever add to BatonRAG or future MCP servers in Claude_Baton.

Next step recommendations:
- Reply **“Generate Week 2 full skills”** → I’ll give you complete Onboarder/Archivist SKILL.md files that call these tools.
- Or say **“Add outputSchema examples”** → I’ll expand the server.py with typed return schemas.

This is the exact same standard used by every major MCP server on the marketplace in 2026. You’re building on the official foundation.

Let’s keep going — your plugin is about to become indispensable.
```
