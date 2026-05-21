import { create } from 'zustand';
import type { ViewMode } from '../types';

interface AppState {
  currentView: ViewMode;
  setCurrentView: (view: ViewMode) => void;
  selectedProjectId: number | null;
  setSelectedProjectId: (id: number | null) => void;
  
  // Modal states
  isTaskModalOpen: boolean;
  editingTaskId: number | null;
  openTaskModal: (taskId?: number) => void;
  closeTaskModal: () => void;
  
  isResourceModalOpen: boolean;
  editingResourceId: number | null;
  openResourceModal: (resourceId?: number) => void;
  closeResourceModal: () => void;
  
  isTapdModalOpen: boolean;
  openTapdModal: () => void;
  closeTapdModal: () => void;

  expandedTaskIds: Set<number>;
  toggleTaskExpansion: (taskId: number) => void;
  
  highlightedTaskIds: number[];
  setHighlightedTaskIds: (ids: number[]) => void;
  clearHighlightedTaskIds: () => void;

  // Member filter
  selectedMemberId: number | null;
  setSelectedMemberId: (id: number | null) => void;

  // AI suggestion panel
  isAiPanelOpen: boolean;
  openAiPanel: () => void;
  closeAiPanel: () => void;

  // Change Snapshot Modal
  isSnapshotModalOpen: boolean;
  openSnapshotModal: () => void;
  closeSnapshotModal: () => void;
  
  // Change Snapshot List Modal
  isSnapshotListModalOpen: boolean;
  openSnapshotListModal: () => void;
  closeSnapshotListModal: () => void;
}
export const useStore = create<AppState>((set) => ({
  currentView: 'dashboard',
  setCurrentView: (view) => set({ currentView: view }),
  selectedProjectId: null,
  setSelectedProjectId: (id) => set({ selectedProjectId: id }),
  
  isTaskModalOpen: false,
  editingTaskId: null,
  openTaskModal: (taskId) => set({ isTaskModalOpen: true, editingTaskId: taskId || null }),
  closeTaskModal: () => set({ isTaskModalOpen: false, editingTaskId: null }),
  
  isResourceModalOpen: false,
  editingResourceId: null,
  openResourceModal: (resourceId) => set({ isResourceModalOpen: true, editingResourceId: resourceId || null }),
  closeResourceModal: () => set({ isResourceModalOpen: false, editingResourceId: null }),
  
  isTapdModalOpen: false,
  openTapdModal: () => set({ isTapdModalOpen: true }),
  closeTapdModal: () => set({ isTapdModalOpen: false }),

  expandedTaskIds: new Set<number>(),
  toggleTaskExpansion: (taskId) => set((state) => {
    const newSet = new Set(state.expandedTaskIds);
    if (newSet.has(taskId)) {
      newSet.delete(taskId);
    } else {
      newSet.add(taskId);
    }
    return { expandedTaskIds: newSet };
  }),
  
  highlightedTaskIds: [],
  setHighlightedTaskIds: (ids) => set({ highlightedTaskIds: ids }),
  clearHighlightedTaskIds: () => set({ highlightedTaskIds: [] }),

  // Member filter
  selectedMemberId: null,
  setSelectedMemberId: (id) => set({ selectedMemberId: id }),

  // AI suggestion panel
  isAiPanelOpen: false,
  openAiPanel: () => set({ isAiPanelOpen: true }),
  closeAiPanel: () => set({ isAiPanelOpen: false }),

  // Change Snapshot Modal
  isSnapshotModalOpen: false,
  openSnapshotModal: () => set({ isSnapshotModalOpen: true }),
  closeSnapshotModal: () => set({ isSnapshotModalOpen: false }),

  // Change Snapshot List Modal
  isSnapshotListModalOpen: false,
  openSnapshotListModal: () => set({ isSnapshotListModalOpen: true }),
  closeSnapshotListModal: () => set({ isSnapshotListModalOpen: false }),
}));