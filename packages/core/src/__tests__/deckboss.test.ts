/**
 * DeckBoss Core — Tests
 * Zod schemas + MCP tool definitions
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
