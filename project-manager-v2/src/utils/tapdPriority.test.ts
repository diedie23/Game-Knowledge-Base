import { describe, expect, it } from 'vitest';
import { getLocalPriorityLabel, mapTapdPriority } from './tapdPriority';

describe('mapTapdPriority', () => {
  it.each(['P0', ' P0 ', 'P0（最高）', '优先级：P0', 'High', '紧急', '4'])(
    'maps TAPD P0 value %s to local high',
    value => {
      expect(mapTapdPriority(value)).toBe('high');
      expect(getLocalPriorityLabel(mapTapdPriority(value))).toBe('P0');
    },
  );

  it.each([
    ['P1', 'medium'],
    ['3', 'medium'],
    ['P2', 'low'],
    ['P3（低）', 'low'],
    ['2', 'low'],
  ] as const)('maps %s to %s', (value, expected) => {
    expect(mapTapdPriority(value)).toBe(expected);
  });
});