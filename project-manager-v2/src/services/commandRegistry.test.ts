import { describe, it, expect, beforeEach } from 'vitest';
import { commandRegistry } from './commandRegistry';

describe('CommandRegistry', () => {
  beforeEach(() => {
    commandRegistry.clear();
  });

  it('should register and retrieve a command', () => {
    commandRegistry.register({
      id: 'test-cmd',
      label: 'Test Command',
      category: 'action',
      keywords: ['test'],
      action: () => {},
    });

    expect(commandRegistry.get('test-cmd')).toBeDefined();
    expect(commandRegistry.get('test-cmd')?.label).toBe('Test Command');
  });

  it('should register multiple commands at once', () => {
    commandRegistry.registerAll([
      { id: 'cmd-1', label: 'Cmd 1', category: 'navigation', keywords: ['one'], action: () => {} },
      { id: 'cmd-2', label: 'Cmd 2', category: 'action', keywords: ['two'], action: () => {} },
    ]);

    expect(commandRegistry.getAll()).toHaveLength(2);
  });

  it('should unregister a command', () => {
    commandRegistry.register({
      id: 'to-remove',
      label: 'Remove Me',
      category: 'action',
      keywords: [],
      action: () => {},
    });

    expect(commandRegistry.getAll()).toHaveLength(1);
    commandRegistry.unregister('to-remove');
    expect(commandRegistry.getAll()).toHaveLength(0);
  });

  it('should search commands by label', () => {
    commandRegistry.registerAll([
      { id: 'nav-gantt', label: 'Gantt View', category: 'navigation', keywords: ['gantt'], action: () => {} },
      { id: 'nav-board', label: 'Board View', category: 'navigation', keywords: ['board'], action: () => {} },
    ]);

    const results = commandRegistry.search('gantt');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('nav-gantt');
  });

  it('should search commands by keywords', () => {
    commandRegistry.register({
      id: 'act-new',
      label: 'New Task',
      category: 'action',
      keywords: ['create', 'add', 'task'],
      action: () => {},
    });

    expect(commandRegistry.search('create')).toHaveLength(1);
    expect(commandRegistry.search('add')).toHaveLength(1);
    expect(commandRegistry.search('nonexistent')).toHaveLength(0);
  });

  it('should return all commands when search query is empty', () => {
    commandRegistry.registerAll([
      { id: 'a', label: 'A', category: 'action', keywords: [], action: () => {} },
      { id: 'b', label: 'B', category: 'action', keywords: [], action: () => {} },
    ]);

    expect(commandRegistry.search('')).toHaveLength(2);
    expect(commandRegistry.search('  ')).toHaveLength(2);
  });

  it('should notify subscribers on changes', () => {
    let callCount = 0;
    const unsub = commandRegistry.subscribe(() => { callCount++; });

    commandRegistry.register({ id: 'x', label: 'X', category: 'action', keywords: [], action: () => {} });
    expect(callCount).toBe(1);

    commandRegistry.unregister('x');
    expect(callCount).toBe(2);

    unsub();
    commandRegistry.register({ id: 'y', label: 'Y', category: 'action', keywords: [], action: () => {} });
    expect(callCount).toBe(2); // Should not increment after unsubscribe
  });

  it('should overwrite existing command on re-register', () => {
    commandRegistry.register({ id: 'dup', label: 'Original', category: 'action', keywords: [], action: () => {} });
    commandRegistry.register({ id: 'dup', label: 'Updated', category: 'action', keywords: [], action: () => {} });

    expect(commandRegistry.getAll()).toHaveLength(1);
    expect(commandRegistry.get('dup')?.label).toBe('Updated');
  });
});
