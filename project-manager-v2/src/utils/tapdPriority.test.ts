import { describe, expect, it } from 'vitest';
import { getLocalPriorityLabel, getTapdPriorityValue, mapTapdPriority } from './tapdPriority';

describe('mapTapdPriority', () => {
  it('keeps empty and unknown TAPD priorities unset', () => {
    expect(mapTapdPriority('')).toBeUndefined();
    expect(mapTapdPriority(null)).toBeUndefined();
    expect(mapTapdPriority('custom-unresolved-value')).toBeUndefined();
  });
  it.each(['P0', ' P0 ', 'P0（最高）', '优先级：P0', 'High', '紧急', '4'])(
    'maps TAPD P0 value %s to local high',
    value => {
      expect(mapTapdPriority(value)).toBe('high');
      expect(getLocalPriorityLabel(mapTapdPriority(value)!)).toBe('P0');
    },
  );

  it('prefers a workspace field named 需求优先级 over the legacy priority fields', () => {
    const story = {
      priority: '3',
      priority_label: 'P1',
      custom_field_27: 'P0',
    };
    expect(getTapdPriorityValue(story, ['custom_field_27'])).toBe('P0');
    expect(mapTapdPriority(getTapdPriorityValue(story, ['custom_field_27']))).toBe('high');
  });

  it('reads priority labels returned as TAPD option objects', () => {
    expect(getTapdPriorityValue({ custom_field_27: { label: 'P0', value: 'internal-id' } }, ['custom_field_27'])).toBe('P0');
  });

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