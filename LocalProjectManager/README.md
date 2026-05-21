# LocalProjectManager

A local-first project management tool built with React + TypeScript + Dexie (IndexedDB). All data stays on your device — zero network latency, full offline support.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI Framework | React 18 + TypeScript 5 |
| Build Tool | Vite 5 |
| Styling | Tailwind CSS 3 (dark theme) |
| State | Zustand 4 |
| Database | Dexie 3 (IndexedDB) |
| Drag & Drop | @hello-pangea/dnd |
| Charts | ECharts 5 |
| Dates | date-fns 3 |
| Icons | lucide-react |
| Virtualization | @tanstack/react-virtual |
| Testing | Vitest |

## Quick Start

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Run tests
npm run test

# Lint & format
npm run lint
npm run format
```

## Project Structure

```
src/
├── components/
│   ├── gantt/                  # Gantt chart sub-modules
│   │   ├── GanttChart.tsx      # Main container (~840 lines)
│   │   ├── GanttTimeline.tsx   # Month row + day header
│   │   ├── GanttScrollbar.tsx  # Bottom time slider
│   │   ├── GanttToolbar.tsx    # Zoom / view controls
│   │   ├── GanttDependencyLines.tsx  # SVG Bezier dependency lines
│   │   ├── GanttTodayLine.tsx  # Today red line
│   │   ├── GanttGhostOverlay.tsx    # What-If ghost schedule
│   │   ├── GanttContextMenu.tsx     # Right-click menu
│   │   ├── GanttMemberPanel.tsx     # Member panel
│   │   ├── GanttResourceHeatRow.tsx # Resource workload heatmap
│   │   ├── constants.ts        # Zoom presets, colors, status config
│   │   ├── types.ts            # Gantt-local types
│   │   └── hooks/              # useGanttZoom, useGanttDrag, etc.
│   ├── sidebar/                # Sidebar sub-modules
│   │   ├── MemberOverviewPopover.tsx
│   │   └── hooks/useMemberStats.ts
│   ├── common/                 # Shared components
│   │   ├── ErrorBoundary.tsx
│   │   └── Avatar.tsx
│   ├── KanbanBoard.tsx         # Kanban view (physics-based drag)
│   ├── TableView.tsx           # Table view
│   ├── CommandPalette.tsx      # Cmd+K command palette
│   ├── WhatIfPanel.tsx         # AI What-If scheduling
│   ├── Header.tsx / Layout.tsx / Sidebar.tsx
│   ├── TaskModal.tsx / TapdModal.tsx / ResourceModal.tsx
│   └── ResourceMatrix.tsx
├── types/                      # Centralized TypeScript interfaces
│   ├── enums.ts / task.ts / resource.ts / project.ts
│   ├── tapd.ts / sync.ts / common.ts
│   └── index.ts
├── store/                      # Zustand stores
│   ├── useStore.ts             # Global UI state
│   ├── useHistoryStore.ts      # Undo/Redo (Command Pattern)
│   └── useSyncStore.ts
├── services/                   # Business logic
│   ├── tapdService.ts          # TAPD MCP integration
│   ├── syncEngine.ts           # Sync engine (adapter pattern)
│   ├── syncAdapter.ts          # SyncAdapter interface + implementations
│   ├── commandRegistry.ts      # Command registration system
│   ├── dataExportService.ts    # JSON/CSV export & import
│   └── smartAssignService.ts   # AI resource recommendation
├── utils/
│   └── dateUtils.ts            # Centralized holiday & date utilities
├── db/
│   ├── db.ts                   # Dexie schema + migrations
│   ├── mockData.ts / templates.ts
└── App.tsx                     # Root (lazy loading + ErrorBoundary)
```

## Key Features

- **Gantt Chart** — Semantic zoom (Ctrl+Scroll), SVG dependency lines, drag-to-resize tasks, resource heatmap
- **Kanban Board** — Physics-based drag animation, status columns
- **Resource Matrix** — Continuous heatmap, glassmorphism hover cards
- **Command Palette** — Cmd/Ctrl+K, full keyboard navigation
- **What-If Scheduling** — AI-powered ghost schedule prediction
- **Undo/Redo** — Command Pattern history stack (Ctrl+Z / Ctrl+Shift+Z)
- **Data Export** — JSON snapshot + CSV export + JSON import
- **TAPD Integration** — MCP proxy sync (no API keys needed)
- **Local-First** — All data in IndexedDB, zero network dependency

## Development Guide

### Adding a new view
1. Create component in `src/components/`
2. Add lazy import in `App.tsx`
3. Register navigation command in `CommandPalette.tsx`

### Adding holidays for a new year
Edit `src/utils/dateUtils.ts` — add a new year entry to `CHINESE_HOLIDAYS`.

### Running tests
```bash
npm run test          # Single run
npm run test:watch    # Watch mode
```
