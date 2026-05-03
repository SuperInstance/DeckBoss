/**
 * DeckBoss Core — Test Suite
 * @fileoverview Tests for Zod MissionSchema validation and MCP tool definitions.
 *
 * These tests verify the canonical type system that all DeckBoss packages
 * depend on. The MissionSchema is mirrored to Pydantic in the Python CLI,
 * so changes here must be reflected in apps/cli/deckboss/models.py.
 *
 * Run: cd packages/core && npm test
 */

import { describe, it, expect } from 'vitest';
import { MissionSchema, DeckBossTools } from '../../packages/core/src/index';

describe('MissionSchema', () => {
  it('should validate a complete mission', () => {
    const mission = {
      id: '00000000-0000-0000-0000-000000000001',
      agent: 'archivist',
      task: 'Scan repos for vulnerabilities',
      payload: { target: 'superinstance/*' },
      background: true,
      status: 'queued',
    };
    const result = MissionSchema.safeParse(mission);
    expect(result.success).toBe(true);
  });

  it('should validate all agent types', () => {
    const agents = ['archivist', 'scout', 'machinist', 'sentry', 'custom'];
    for (const agent of agents) {
      const mission = {
        id: '00000000-0000-0000-0000-000000000002',
        agent,
        task: 'test',
        payload: {},
        status: 'queued',
      };
      expect(MissionSchema.safeParse(mission).success).toBe(true);
    }
  });

  it('should validate all status types', () => {
    const statuses = ['queued', 'running', 'completed', 'failed'];
    for (const status of statuses) {
      const mission = {
        id: '00000000-0000-0000-0000-000000000003',
        agent: 'scout',
        task: 'test',
        payload: {},
        status,
      };
      expect(MissionSchema.safeParse(mission).success).toBe(true);
    }
  });

  it('should default background to false', () => {
    const mission = {
      id: '00000000-0000-0000-0000-000000000004',
      agent: 'scout',
      task: 'test',
      payload: {},
      status: 'queued',
    };
    const result = MissionSchema.parse(mission);
    expect(result.background).toBe(false);
  });

  it('should default cognitiveUpdate to true', () => {
    const mission = {
      id: '00000000-0000-0000-0000-000000000005',
      agent: 'scout',
      task: 'test',
      payload: {},
      status: 'queued',
    };
    const result = MissionSchema.parse(mission);
    expect(result.cognitiveUpdate).toBe(true);
  });

  it('should reject invalid agent', () => {
    const mission = {
      id: '00000000-0000-0000-0000-000000000006',
      agent: 'invalid_agent',
      task: 'test',
      payload: {},
      status: 'queued',
    };
    expect(MissionSchema.safeParse(mission).success).toBe(false);
  });

  it('should reject invalid status', () => {
    const mission = {
      id: '00000000-0000-0000-0000-000000000007',
      agent: 'scout',
      task: 'test',
      payload: {},
      status: 'pending',
    };
    expect(MissionSchema.safeParse(mission).success).toBe(false);
  });

  it('should reject missing required fields', () => {
    expect(MissionSchema.safeParse({}).success).toBe(false);
  });

  it('should accept optional result', () => {
    const mission = {
      id: '00000000-0000-0000-0000-000000000008',
      agent: 'scout',
      task: 'test',
      payload: {},
      status: 'completed',
      result: { found: 42 },
    };
    expect(MissionSchema.safeParse(mission).success).toBe(true);
  });

  it('should accept any payload shape', () => {
    const mission = {
      id: '00000000-0000-0000-0000-000000000009',
      agent: 'machinist',
      task: 'test',
      payload: { nested: { deep: [1, 2, 3] }, flag: true },
      status: 'queued',
    };
    expect(MissionSchema.safeParse(mission).success).toBe(true);
  });

  it('should reject non-UUID id', () => {
    const mission = {
      id: 'not-a-uuid',
      agent: 'scout',
      task: 'test',
      payload: {},
      status: 'queued',
    };
    expect(MissionSchema.safeParse(mission).success).toBe(false);
  });
});

describe('DeckBossTools', () => {
  it('should define deckboss_launch tool', () => {
    const launch = DeckBossTools.find(t => t.name === 'deckboss_launch');
    expect(launch).toBeDefined();
    expect(launch!.description).toBeDefined();
    expect(launch!.inputSchema).toBeDefined();
  });

  it('should have MCP-compliant structure', () => {
    for (const tool of DeckBossTools) {
      expect(tool.name).toBeDefined();
      expect(tool.description).toBeDefined();
      expect(typeof tool.name).toBe('string');
      expect(typeof tool.description).toBe('string');
    }
  });
});

// Additional tests — extended coverage for MissionSchema and DeckBossTools

describe('MissionSchema — edge cases', () => {
  it('should accept empty payload', () => {
    const m = { id: '00000000-0000-0000-0000-000000000020', agent: 'scout', task: 'x', payload: {}, status: 'queued' };
    expect(MissionSchema.safeParse(m).success).toBe(true);
  });

  it('should accept status=completed without result', () => {
    const m = { id: '00000000-0000-0000-0000-000000000021', agent: 'scout', task: 'x', payload: {}, status: 'completed' };
    expect(MissionSchema.safeParse(m).success).toBe(true);
  });

  it('should accept status=failed without result', () => {
    const m = { id: '00000000-0000-0000-0000-000000000022', agent: 'scout', task: 'x', payload: {}, status: 'failed' };
    expect(MissionSchema.safeParse(m).success).toBe(true);
  });

  it('should accept status=running', () => {
    const m = { id: '00000000-0000-0000-0000-000000000023', agent: 'scout', task: 'x', payload: {}, status: 'running' };
    expect(MissionSchema.safeParse(m).success).toBe(true);
  });

  it('should reject task being empty string', () => {
    const m = { id: '00000000-0000-0000-0000-000000000024', agent: 'scout', task: '', payload: {}, status: 'queued' };
    expect(MissionSchema.safeParse(m).success).toBe(false);
  });

  it('should reject non-string task', () => {
    const m: any = { id: '00000000-0000-0000-0000-000000000025', agent: 'scout', task: 123, payload: {}, status: 'queued' };
    expect(MissionSchema.safeParse(m).success).toBe(false);
  });

  it('should reject payload as non-object', () => {
    const m: any = { id: '00000000-0000-0000-0000-000000000026', agent: 'scout', task: 'x', payload: 'not-an-object', status: 'queued' };
    expect(MissionSchema.safeParse(m).success).toBe(false);
  });

  it('should accept all agent types with background=true', () => {
    const agents = ['archivist', 'scout', 'machinist', 'sentry', 'custom'];
    for (const a of agents) {
      const m = { id: '00000000-0000-0000-0000-000000000027', agent: a, task: 'x', payload: {}, status: 'queued', background: true };
      expect(MissionSchema.safeParse(m).success).toBe(true);
    }
  });

  it('should accept background=false explicitly', () => {
    const m = { id: '00000000-0000-0000-0000-000000000028', agent: 'scout', task: 'x', payload: {}, status: 'queued', background: false };
    expect(MissionSchema.parse(m).background).toBe(false);
  });

  it('should accept cognitiveUpdate=false', () => {
    const m = { id: '00000000-0000-0000-0000-000000000029', agent: 'scout', task: 'x', payload: {}, status: 'queued', cognitiveUpdate: false };
    expect(MissionSchema.parse(m).cognitiveUpdate).toBe(false);
  });

  it('should accept result with complex nested data', () => {
    const m = {
      id: '00000000-0000-0000-0000-000000000030',
      agent: 'archivist',
      task: 'index',
      payload: { roots: ['/src'] },
      status: 'completed',
      result: { tilesCreated: 99, roomsVisited: ['forge', 'library'], duration_ms: 5420 }
    };
    expect(MissionSchema.safeParse(m).success).toBe(true);
  });

  it('should reject malformed UUID (too short)', () => {
    const m = { id: '00000000-0000-0000-0000', agent: 'scout', task: 'x', payload: {}, status: 'queued' };
    expect(MissionSchema.safeParse(m).success).toBe(false);
  });

  it('should reject malformed UUID (invalid chars)', () => {
    const m = { id: 'gggggggg-gggg-gggg-gggg-gggggggggggg', agent: 'scout', task: 'x', payload: {}, status: 'queued' };
    expect(MissionSchema.safeParse(m).success).toBe(false);
  });

  it('should accept UUID with uppercase letters', () => {
    const m = { id: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE', agent: 'scout', task: 'x', payload: {}, status: 'queued' };
    expect(MissionSchema.safeParse(m).success).toBe(true);
  });

  it('should accept custom agent type', () => {
    const m = { id: '00000000-0000-0000-0000-000000000035', agent: 'custom', task: 'x', payload: { plugin: 'my-agent' }, status: 'queued' };
    expect(MissionSchema.safeParse(m).success).toBe(true);
  });

  it('should parse mission with all defaults', () => {
    const m = { id: '00000000-0000-0000-0000-000000000036', agent: 'scout', task: 'x', payload: {}, status: 'queued' };
    const parsed = MissionSchema.parse(m);
    expect(parsed.background).toBe(false);
    expect(parsed.cognitiveUpdate).toBe(true);
    expect(parsed.result).toBeUndefined();
  });

  it('should reject id missing entirely', () => {
    const m: any = { agent: 'scout', task: 'x', payload: {}, status: 'queued' };
    expect(MissionSchema.safeParse(m).success).toBe(false);
  });

  it('should reject agent missing entirely', () => {
    const m: any = { id: '00000000-0000-0000-0000-000000000038', task: 'x', payload: {}, status: 'queued' };
    expect(MissionSchema.safeParse(m).success).toBe(false);
  });

  it('should reject task missing entirely', () => {
    const m: any = { id: '00000000-0000-0000-0000-000000000039', agent: 'scout', payload: {}, status: 'queued' };
    expect(MissionSchema.safeParse(m).success).toBe(false);
  });

  it('should reject status missing entirely', () => {
    const m: any = { id: '00000000-0000-0000-0000-000000000040', agent: 'scout', task: 'x', payload: {} };
    expect(MissionSchema.safeParse(m).success).toBe(false);
  });
});

describe('DeckBossTools — inputSchema validation', () => {
  it('deckboss_launch inputSchema should accept valid launch payload', () => {
    const launch = DeckBossTools.find(t => t.name === 'deckboss_launch');
    expect(launch).toBeDefined();
    const valid = launch!.inputSchema.safeParse({ agent: 'scout', task: 'x', payload: {}, background: false, cognitiveUpdate: true });
    expect(valid.success).toBe(true);
  });

  it('deckboss_launch inputSchema should reject invalid agent', () => {
    const launch = DeckBossTools.find(t => t.name === 'deckboss_launch');
    const invalid = launch!.inputSchema.safeParse({ agent: 'invalid', task: 'x', payload: {} });
    expect(invalid.success).toBe(false);
  });

  it('deckboss_launch inputSchema should reject missing task', () => {
    const launch = DeckBossTools.find(t => t.name === 'deckboss_launch');
    const invalid = launch!.inputSchema.safeParse({ agent: 'scout', payload: {} });
    expect(invalid.success).toBe(false);
  });

  it('deckboss_launch inputSchema should accept background flag', () => {
    const launch = DeckBossTools.find(t => t.name === 'deckboss_launch');
    const valid = launch!.inputSchema.safeParse({ agent: 'scout', task: 'x', payload: {}, background: true });
    expect(valid.success).toBe(true);
  });

  it('DeckBossTools array should have length >= 1', () => {
    expect(DeckBossTools.length).toBeGreaterThanOrEqual(1);
  });
});
