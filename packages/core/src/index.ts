// packages/core/src/index.ts
// Annotation: Zod schemas + MCP-compliant types. Mirror to Pydantic for Python squadrons.
// Future Rust Wasm squadron imports only this JSON schema.

import { z } from "zod";

export const MissionSchema = z.object({
  id: z.string().uuid(),
  agent: z.enum(["archivist", "scout", "machinist", "sentry", "custom"]),
  task: z.string(),
  payload: z.record(z.any()),
  background: z.boolean().default(false),
  status: z.enum(["queued", "running", "completed", "failed"]),
  result: z.any().optional(),
  cognitiveUpdate: z.boolean().default(true), // triggers Memory Weaver
});

export type Mission = z.infer<typeof MissionSchema>;

// MCP tool definitions (exported to /.well-known/mcp.json)
export const DeckBossTools = [
  {
    name: "deckboss_launch",
    description: "Launch a persistent mission on the edge",
    inputSchema: MissionSchema.omit({ id: true, status: true, result: true }),
  },
  // ... status, recover, query_memory
] as const;
