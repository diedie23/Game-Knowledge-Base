import { describe, expect, it } from 'vitest';
import type { Resource } from '../types';
import { dedupeResourcesForDisplay, getResourceAliasIds } from './resourceDedup';

const resources: Resource[] = [
  { id: 1, name: '薛珂', role: '动效', type: 'internal' },
  { id: 2, name: '薛珂', role: 'CP-动效', type: 'cp', workforceType: '供应商', tapdAccount: 'xueke' },
  { id: 3, name: '颜媛', role: '动效', type: 'internal' },
  { id: 4, name: '张云鹏', role: 'UX设计', type: 'internal', tapdAccount: 'klaudzhang' },
  { id: 5, name: '张云鹏', role: 'Layout', type: 'base', tapdAccount: 'v_zypgzhang' },
  { id: 6, name: '颜媛', role: 'CP-动效', type: 'cp', workforceType: '供应商', tapdAccount: 'yanyuan' },
];

describe('resource display deduplication', () => {
  it('keeps the CP record for duplicate supplier people', () => {
    expect(dedupeResourcesForDisplay(resources).map(item => item.id)).toEqual([2, 4, 5, 6]);
    expect(getResourceAliasIds(resources[1], resources)).toEqual([1, 2]);
  });

  it('keeps legitimate same-name internal/base accounts separate', () => {
    const visible = dedupeResourcesForDisplay(resources).filter(item => item.name === '张云鹏');
    expect(visible.map(item => item.id)).toEqual([4, 5]);
  });
});

