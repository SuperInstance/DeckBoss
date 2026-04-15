/**
 * @package @deckboss/core
 * @fileoverview Shared types, Zod schemas, and MCP-compliant tool definitions.
 *
 * This package is the single source of truth for the DeckBoss type system.
 * - TypeScript consumers import directly from this package.
 * - Python squadrons mirror these schemas via Pydantic (see apps/cli/deckboss/).
 * - Future Rust/WASM squadrons import the generated JSON schema.
 *
 * All changes here should be reflected in the Python Pydantic models
 * to maintain cross-language protocol compatibility.
 */

import { z } from "zod";

/**
 * MissionSchema — canonical validation for all missions across the fleet.
 *
 * Agent types:
 *   archivist  — Code indexing, semantic search, pattern matching
 *   scout      — Web fetch, summarization, structured extraction
 *   machinist  — Code execution, transformation, sandbox runs
 *   sentry     — Scheduled monitoring, health checks, alerting
 *   custom     — User-defined or marketplace squadron plugins
 *
 * Status lifecycle: queued → running → completed | failed
 */
export const MissionSchema = z.object({
  /** Unique mission identifier (UUID v4) */
  id: z.string().uuid(),
  /** Target squadron agent for this mission */
  agent: z.enum(["archivist", "scout", "machinist", "sentry", "custom"]),
  /** Mission type identifier — agent-specific (e.g. 'fetch', 'index', 'audit') */
  task: z.string(),
  /** Arbitrary mission parameters — shape varies by agent + task combination */
  payload: z.record(z.any()),
  /** If true, mission queues for background execution (survives laptop closure) */
  background: z.boolean().default(false),
  /** Current lifecycle state of the mission */
  status: z.enum(["queued", "running", "completed", "failed"]),
  /** Mission result payload — populated on completion */
  result: z.any().optional(),
  /** If true (default), triggers Memory Weaver for continual learning after completion */
  cognitiveUpdate: z.boolean().default(true),
});

/** Inferred TypeScript type from MissionSchema */
export type Mission = z.infer<typeof MissionSchema>;

/**
 * DeckBossTools — MCP tool definitions exposed via /.well-known/mcp.json
 *
 * These tools are registered with the MCP Server and made available to
 * Claude Code and other MCP-compatible clients. The inputSchema for
 * each tool is derived from MissionSchema, omitting fields that are
 * server-generated (id, status, result).
 *
 * Planned additions:
 *   deckboss_status       — Check mission status by ID
 *   deckboss_recover      — Retrieve completed mission result
 *   deckboss_query_memory — Hybrid search across cognitive model
 */
export const DeckBossTools = [
  {
    name: "deckboss_launch",
    description: "Launch a persistent mission on the edge",
    inputSchema: MissionSchema.omit({ id: true, status: true, result: true }),
  },
  // TODO: Add deckboss_status, deckboss_recover, deckboss_query_memory
] as const;
