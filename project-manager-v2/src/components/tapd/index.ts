/**
 * tapd/ module — Extracted sub-components from TapdModal
 * 
 * Architecture:
 * - useTapdState.ts: Centralized state management hook
 * - TapdConflictsTab.tsx: Conflict resolution panel
 * - TapdLogTab.tsx: Sync log display
 * - TapdConfigTab.tsx: Configuration panel (TODO: extract from TapdModal)
 * - TapdSyncTab.tsx: Sync operations panel (TODO: extract from TapdModal)
 */

export { useTapdState } from './useTapdState';
export type { TapdState, TabId, TeamResource } from './useTapdState';
export { TapdConflictsTab } from './TapdConflictsTab';
export { TapdLogTab } from './TapdLogTab';
