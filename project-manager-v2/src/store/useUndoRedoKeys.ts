import { useEffect } from 'react';
import { useHistoryStore } from './useHistoryStore';

/**
 * Global keyboard shortcut hook for Undo/Redo
 * - Ctrl+Z: Undo
 * - Ctrl+Shift+Z / Ctrl+Y: Redo
 */
export function useUndoRedoKeys() {
  const undo = useHistoryStore((s) => s.undo);
  const redo = useHistoryStore((s) => s.redo);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const isCtrl = e.ctrlKey || e.metaKey;

      // Ctrl+Shift+Z or Ctrl+Y => Redo
      if (isCtrl && e.shiftKey && e.key === 'Z') {
        e.preventDefault();
        redo();
        return;
      }
      if (isCtrl && e.key === 'y') {
        e.preventDefault();
        redo();
        return;
      }

      // Ctrl+Z => Undo
      if (isCtrl && e.key === 'z') {
        e.preventDefault();
        undo();
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);
}