import { describe, expect, it } from 'vitest';
import {
  findTapdModuleCategoryFields,
  formatTapdCalendarDate,
  getTapdModuleCategoryValue,
  getTapdWorkitemTypeName,
  parseTapdDate,
  parseTapdEffortHours,
} from './tapdFields';

describe('TAPD field parsing', () => {
  it('uses only the field labelled 模块分类', () => {
    const fields = findTapdModuleCategoryFields({
      Story: {
        custom_field_one: '版本',
        custom_field_three: '模块分类',
        category_id: '需求分类',
      },
    });
    expect(fields).toEqual(['custom_field_three']);
    expect(getTapdModuleCategoryValue({
      custom_field_one: '11月版本',
      custom_field_three: '玩法关卡',
    }, fields)).toBe('玩法关卡');

    expect(findTapdModuleCategoryFields({
      Story: { custom_field_three: { label: '模块分类', options: { '42': '玩法关卡' } } },
    })).toEqual(['custom_field_three']);
  });

  it('resolves standard module and category names without using unrelated fields', () => {
    const fields = findTapdModuleCategoryFields({ custom_field_one: '版本' });
    expect(getTapdModuleCategoryValue({ custom_field_one: '11月版本', module: '战斗' }, fields)).toBe('战斗');
    expect(getTapdModuleCategoryValue(
      { custom_field_one: '11月版本', category_id: '42' },
      fields,
      new Map([['42', '玩法关卡']])
    )).toBe('玩法关卡');
    expect(getTapdModuleCategoryValue({ custom_field_one: '11月版本' }, fields)).toBeUndefined();
  });

  it('resolves work-item type from a display name before falling back to the ID map', () => {
    expect(getTapdWorkitemTypeName({ workitem_type_id: '7', workitem_type_name: 'UIStory' })).toBe('UIStory');
    expect(getTapdWorkitemTypeName({ workitem_type_id: '7' }, new Map([['7', 'UI']]))).toBe('UI');
    expect(getTapdWorkitemTypeName({ workitem_type_id: '7', workitem_type: 'UIStory' })).toBe('UIStory');
  });

  it('unwraps option objects for module fields instead of showing [object Object]', () => {
    const fields = findTapdModuleCategoryFields({ custom_field_three: '模块分类' });
    expect(getTapdModuleCategoryValue({ custom_field_three: { label: '玩法关卡', value: '42' } }, fields)).toBe('玩法关卡');
  });

  it('parses TAPD calendar dates without a timezone shift', () => {
    const result = parseTapdDate('2026-09-14 00:00:00');
    expect(result?.getFullYear()).toBe(2026);
    expect(result?.getMonth()).toBe(8);
    expect(result?.getDate()).toBe(14);
  });

  it('formats local calendar dates without converting through UTC', () => {
    const localMidnight = new Date(2026, 8, 14, 0, 0, 0);
    expect(formatTapdCalendarDate(localMidnight)).toBe('2026-09-14');
    expect(formatTapdCalendarDate('2026/09/14 23:59:59')).toBe('2026-09-14');
  });
  it('rejects empty and invalid TAPD dates', () => {
    expect(parseTapdDate('0000-00-00')).toBeUndefined();
    expect(parseTapdDate('2026-02-31')).toBeUndefined();
  });

  it('converts workspace person-days into hours', () => {
    expect(parseTapdEffortHours('2', 'days', 8)).toBe(16);
    expect(parseTapdEffortHours('1.5人天', 'hours', 8)).toBe(12);
  });

  it('preserves workspace person-hours and explicit hour suffixes', () => {
    expect(parseTapdEffortHours('2', 'hours', 8)).toBe(2);
    expect(parseTapdEffortHours('2h', 'days', 8)).toBe(2);
  });

  it('does not invent an effort value for blank or invalid data', () => {
    expect(parseTapdEffortHours('', 'days', 8)).toBeUndefined();
    expect(parseTapdEffortHours('-1', 'days', 8)).toBeUndefined();
  });
});
