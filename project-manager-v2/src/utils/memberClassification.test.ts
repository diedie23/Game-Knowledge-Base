import { describe, expect, it } from 'vitest';
import {
  classifyTapdMember,
  extractTapdMemberGroups,
  extractTapdRoleNames,
  resolveMemberTypeAfterTapdSync,
} from './memberClassification';

describe('TAPD member classification', () => {
  it('keeps supplier-name trial members under the matching CP supplier', () => {
    expect(classifyTapdMember(['UX-视觉', '供应商-小林'], 'UX-视觉', 'UI设计')).toEqual({
      type: 'cp',
      group: '小林',
      role: 'CP-UI设计',
      workforceType: '供应商',
      supplierAffiliation: '小林',
    });
    expect(classifyTapdMember(['UX-动效', '供应商'], 'UX-动效', '动效', '全速-伍旭娇')).toMatchObject({
      type: 'cp', group: '全速', role: 'CP-动效',
    });
  });

  it('keeps ordinary supplier and base groups unchanged', () => {
    expect(classifyTapdMember(['UX-动效', '供应商'], 'UX-动效', '动效').type).toBe('cp');
    expect(classifyTapdMember(['UX-视觉', '基地人员'], 'UX-视觉', 'UI设计').type).toBe('base');
    expect(classifyTapdMember(['UX-视觉', 'CP供应商'], 'UX-视觉', 'UI设计').type).toBe('cp');
    expect(classifyTapdMember(['UX-视觉', '基地-正式'], 'UX-视觉', 'UI设计').type).toBe('base');
  });

  it('reads both TAPD role maps and role-record arrays', () => {
    expect(extractTapdRoleNames({ '1': 'UX-视觉', '2': '基地人员' })).toEqual(new Map([
      ['1', 'UX-视觉'],
      ['2', '基地人员'],
    ]));
    expect(extractTapdRoleNames([{ Role: { id: '1', name: 'UX-视觉' } }, { id: '2', name: 'CP供应商' }])).toEqual(new Map([
      ['1', 'UX-视觉'],
      ['2', 'CP供应商'],
    ]));
    expect(extractTapdRoleNames({ Role: [{ id: '3', name: '基地人员' }] })).toEqual(new Map([
      ['3', '基地人员'],
    ]));
  });

  it('falls back to direct member role names when role ids are not mapped', () => {
    expect(extractTapdMemberGroups({ role_id: '1,基地人员', group: 'CP供应商' }, new Map([['1', 'UX-视觉']]))).toEqual([
      'UX-视觉', '基地人员', 'CP供应商',
    ]);
  });
  it('preserves manually selected and legacy base personnel types during refresh', () => {
    expect(resolveMemberTypeAfterTapdSync(
      { type: 'base', typeLocked: true, workforceType: '基地人员' },
      'internal',
    )).toEqual({ type: 'base', typeLocked: true });

    expect(resolveMemberTypeAfterTapdSync(
      { type: 'internal', workforceType: '基地人员' },
      'internal',
    )).toEqual({ type: 'base', typeLocked: true });
  });
});
