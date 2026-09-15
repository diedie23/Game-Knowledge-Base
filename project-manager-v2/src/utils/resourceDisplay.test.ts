import { describe, expect, it } from 'vitest';
import { formatResourceDisplayName } from './resourceDisplay';

describe('resource display name', () => {
  it('prefixes internal members with their role', () => {
    expect(formatResourceDisplayName({ name: '张云鹏', role: 'UX设计', type: 'internal' })).toBe('UX设计-张云鹏');
  });

  it('keeps base and supplier names unchanged', () => {
    expect(formatResourceDisplayName({ name: '张云鹏', role: 'Layout', type: 'base' })).toBe('张云鹏');
    expect(formatResourceDisplayName({ name: '全速', role: 'CP-UI设计', type: 'cp' })).toBe('全速');
  });
});
