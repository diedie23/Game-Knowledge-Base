import { describe, expect, it } from 'vitest';
import { configContainsTapdWorkspace, createTapdSyncId, getTaskIdentity, parseTapdWorkspaceIds } from './tapdIdentity';

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

  it('uses workspace-scoped identities for aggregation and project-scoped legacy fallbacks', () => {
    expect(getTaskIdentity({ tapdId: '42', tapdWorkspaceId: '1001', projectId: 1, title: 'A' })).toBe('tapd:1001:42');
    expect(getTaskIdentity({ tapdId: '42', tapdWorkspaceId: '1002', projectId: 1, title: 'B' })).toBe('tapd:1002:42');
    expect(getTaskIdentity({ tapdId: '42', projectId: 2, title: 'C' })).toBe('tapd-legacy:2:42');
  });
});
