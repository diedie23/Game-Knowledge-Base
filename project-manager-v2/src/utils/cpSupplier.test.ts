import { describe, expect, it } from 'vitest';
import type { Resource } from '../types';
import { matchCpResourcesFromTitle } from './cpSupplier';

const resources: Resource[] = [
  { id: 1, name: '内部小王', role: 'UX设计', type: 'internal' },
  { id: 2, name: '画加', role: 'CP-UI设计', type: 'cp' },
  { id: 3, name: '网易雷火', role: 'CP-动效', type: 'cp' },
  { id: 4, name: '雷火', role: 'CP-动效', type: 'cp' },
  { id: 5, name: 'UI', role: 'CP-UI设计', type: 'cp' },
];

describe('matchCpResourcesFromTitle', () => {
  it('matches configured supplier names across common TAPD punctuation', () => {
    expect(matchCpResourcesFromTitle('【RED】【画加】商城界面-UI资源', resources)).toEqual([2]);
  });

  it('keeps the more specific supplier when names overlap', () => {
    expect(matchCpResourcesFromTitle('[网易雷火] 登录动效', resources)).toEqual([3]);
  });

  it('ignores internal members and generic labels', () => {
    expect(matchCpResourcesFromTitle('内部小王负责 UI 设计', resources)).toEqual([]);
  });
});
