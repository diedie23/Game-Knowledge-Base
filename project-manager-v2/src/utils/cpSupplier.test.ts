import { describe, expect, it } from 'vitest';
import type { Resource } from '../types';
import {
  extractCpSupplierNames,
  hasFollowupAssignment,
  inferCpSupplierRole,
  matchCpResourcesFromTitle,
} from './cpSupplier';

const resources: Resource[] = [
  { id: 1, name: '内部小王', role: 'UX设计', type: 'internal' },
  { id: 2, name: '画加', role: 'CP-UI设计', type: 'cp' },
  { id: 3, name: '网易雷火', role: 'CP-动效', type: 'cp' },
  { id: 4, name: '雷火', role: 'CP-动效', type: 'cp' },
  { id: 5, name: 'UI', role: 'CP-UI设计', type: 'cp' },
  { id: 6, name: '宋佳聪', role: 'UI设计', type: 'base' },
];

describe('CP supplier title handling', () => {
  it('extracts supplier names from CP markers', () => {
    expect(extractCpSupplierNames('登录界面（CP全速）')).toEqual(['全速']);
    expect(extractCpSupplierNames('登录界面(CP全速）')).toEqual(['全速']);
    expect(extractCpSupplierNames('登录界面【CP：画加】')).toEqual(['画加']);
    expect(extractCpSupplierNames('登录界面（CP）')).toEqual([]);
  });

  it('matches configured supplier names across common TAPD punctuation', () => {
    expect(matchCpResourcesFromTitle('【RED】【画加】商城界面-UI资源', resources)).toEqual([2]);
  });

  it('keeps the more specific supplier when names overlap', () => {
    expect(matchCpResourcesFromTitle('[网易雷火] 登录动效', resources)).toEqual([3]);
  });

  it('ignores internal members and generic labels', () => {
    expect(matchCpResourcesFromTitle('内部小王负责 UI 设计', resources)).toEqual([]);
  });

  it('infers motion supplier from the TAPD owner role', () => {
    expect(inferCpSupplierRole('登录界面（CP全速）', [{ id: 7, name: '正职', role: '动效', type: 'internal' }])).toBe('CP-动效');
    expect(inferCpSupplierRole('登录界面（CP全速）', [resources[0]])).toBe('CP-UI设计');
  });

  it('uses follow-up load for internal plus base or supplier assignments', () => {
    expect(hasFollowupAssignment([1, 6], resources)).toBe(true);
    expect(hasFollowupAssignment([1, 2], resources)).toBe(true);
    expect(hasFollowupAssignment([1], resources)).toBe(false);
    expect(hasFollowupAssignment([6], resources)).toBe(false);
  });
});
