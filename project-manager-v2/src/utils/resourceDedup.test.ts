import { describe, expect, it } from 'vitest';
import type { Resource } from '../types';
import {
  chooseCanonicalResource,
  dedupeResourcesForDisplay,
  getResourceAliasIds,
  getSafeResourceMergeKey,
} from './resourceDedup';

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

  it('uses a safe key for title-generated supplier placeholders', () => {
    const first: Resource = { id: 20, name: '全速', role: 'CP-UI设计', type: 'cp', workforceType: '供应商' };
    const duplicate: Resource = { id: 21, name: 'CP-全速', role: 'CP-动效', type: 'cp', workforceType: '供应商' };
    expect(getSafeResourceMergeKey(first)).toBe('supplier:全速');
    expect(getSafeResourceMergeKey(duplicate)).toBe('supplier:全速');
    expect(chooseCanonicalResource([first, duplicate])?.id).toBe(20);
  });

  it('does not auto-merge different CP people from the same supplier', () => {
    const first: Resource = { id: 30, name: '张三', role: 'CP-UI设计', type: 'cp', supplierAffiliation: '全速', tapdAccount: 'zhangsan' };
    const second: Resource = { id: 31, name: '李四', role: 'CP-UI设计', type: 'cp', supplierAffiliation: '全速', tapdAccount: 'lisi' };
    expect(getSafeResourceMergeKey(first)).toBe('account:zhangsan');
    expect(getSafeResourceMergeKey(second)).toBe('account:lisi');
  });
});

