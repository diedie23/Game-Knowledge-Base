# Project Manager V2 — isolated TAPD scheduling copy

## Source and output

- Existing source: `LocalProjectManager/`.
- Existing Vite output: `docs/project-manager/`.
- Existing base URL: `/Game-Knowledge-Base/project-manager/`.
- Independent source: `project-manager-v2/`.
- Independent output: `docs/project-manager-v2/`.
- Independent base URL: `/Game-Knowledge-Base/project-manager-v2/`.
- Original source and published files are unchanged by this commit.

Baseline: main `031be005eb95c9d8fb5bb713a8a6c8be291491a6`.
Scheduling source: feature/tapd-scheduling-v2 `aae1342d2ae456cf34a07b5a9a1182396f1853bb`.

## Migrated capabilities

Six source files were carried over from the scheduling branch: the UX scheduling types, their type exports, UX parent/child story parsing, per-person capacity calculations, scheduling suggestions, and the resourceCapacities database table.

The source branch contains service-layer logic only; scheduling UI and TAPD sync integration are not present there and are not introduced by this initial isolation change. The original application UI remains available in the copy. The scheduling engine remains an initial suggestion engine, not a full dependency-aware or resource-reserving scheduler.

V2 uses IndexedDB `LocalProjectManagerV2DB` and backup key `lpm_v2_last_backup_time`. It starts with separate data. Existing V1 data is not migrated automatically.

## Build and preview

Run from `project-manager-v2/`:

```sh
npm ci
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

Open `http://127.0.0.1:4173/Game-Knowledge-Base/project-manager-v2/index.html`.

Build output is restricted to the V2 directory. Do not use V1's build command for V2 development.

The committed static output is ready for the repository's documented GitHub Pages `/docs` deployment. A feature branch push does not publish it to the existing main-based Pages site. After an explicitly approved merge/deployment, the public path will be `https://diedie23.github.io/Game-Knowledge-Base/project-manager-v2/index.html`.

## Verification

- Production build passed.
- New migration checks: 3 passed (four disciplines, unrelated-task exclusion, capacity formula, missing personnel and finished-task filtering).
- Copied existing suite: 80 passed, 2 failed in workloadService.test.ts. Its implementation and tests are byte-identical to the original source; expected loads 120/180 differ from actual 105/150. No unrelated workload change was made.
- Local HTTP: V2 index, entry JavaScript and CSS returned 200.
- Browser UI verification could not run because the Windows browser automation process failed to start (CreateProcessWithLogonW 1385). HTTP checks do not establish visual/runtime correctness.
- Existing source and static output remain unchanged.