import { describe, expect, it } from 'vitest';
import { configContainsTapdWorkspace, createTapdSyncId, parseTapdWorkspaceIds } from './tapdIdentity';

describe('TAPD workspace identity', () => {
  it('parses comma and semicolon separated workspace IDs consistently', () => {
    expect(parseTapdWorkspaceIds(' 1001,1002； 1003;1001，1004 ')).toEqual([
      '1001',
      '1002',
      '1003',
      '1004',
    ]);
  });

  it('matches only complete workspace IDs', () => {
    expect(configContainsTapdWorkspace('1001, 21001', '1001')).toBe(true);
    expect(configContainsTapdWorkspace('21001', '1001')).toBe(false);
  });

  it('builds a stable workspace-scoped sync ID', () => {
    expect(createTapdSyncId(' 1001 ', 42)).toBe('tapd:1001:42');
    expect(createTapdSyncId('1002', '42')).toBe('tapd:1002:42');
  });
});
