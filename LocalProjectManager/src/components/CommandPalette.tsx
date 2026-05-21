import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Task, Resource } from '../db/db';
import { trackedDb } from '../store/useHistoryStore';
import { useStore } from '../store/useStore';
import {
  Search, Calendar, Columns, BarChart2, Table as TableIcon,
  Plus, UserPlus, ArrowRight, CheckCircle2, Circle, Clock,
  Zap, CornerDownLeft, ChevronUp, ChevronDown,
  Hash, User, Link as LinkIcon
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────
type CommandCategory = 'task' | 'navigation' | 'action' | 'status';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  category: CommandCategory;
  icon: React.ReactNode;
  keywords: string[];
  action: () => void;
  badge?: { text: string; color: string };
}

// ─── Fuzzy match helper ──────────────────────────────────────────
function fuzzyMatch(query: string, text: string): boolean {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.includes(q)) return true;
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 90;
  if (t.includes(q)) return 80;
  let score = 0, qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) { score += 10; qi++; }
  }
  return qi === q.length ? score : 0;
}

// ─── Status helpers ──────────────────────────────────────────────
const statusConfig: Record<string, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  todo:        { label: '待办', icon: <Circle size={14} />, color: 'text-gray-400', bg: 'bg-gray-500/20' },
  in_progress: { label: '进行中', icon: <Clock size={14} />, color: 'text-blue-400', bg: 'bg-blue-500/20' },
  done:        { label: '已完成', icon: <CheckCircle2 size={14} />, color: 'text-emerald-400', bg: 'bg-emerald-500/20' },
  paused:      { label: '暂停', icon: <Circle size={14} />, color: 'text-gray-500', bg: 'bg-gray-600/20' },
};

// ─── Category labels ─────────────────────────────────────────────
const categoryLabels: Record<CommandCategory, string> = {
  navigation: '导航',
  action: '操作',
  task: '任务',
  status: '状态变更',
};

// ═════════════════════════════════════════════════════════════════
// Component
// ═════════════════════════════════════════════════════════════════
export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { setCurrentView, openTaskModal, openResourceModal, openTapdModal, selectedProjectId } = useStore();

  // ── Live data ────────────────────────────────────────────────
  const tasks = useLiveQuery(
    () => selectedProjectId
      ? db.tasks.where('projectId').equals(selectedProjectId).toArray()
      : db.tasks.toArray(),
    [selectedProjectId]
  ) ?? [];
  const resources = useLiveQuery(() => db.resources.toArray()) ?? [];

  // ── Resource map for display ─────────────────────────────────
  const resourceMap = useMemo(() => {
    const m = new Map<number, Resource>();
    resources.forEach(r => { if (r.id !== undefined) m.set(r.id, r); });
    return m;
  }, [resources]);

  // ── Global shortcut ──────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        if (selectedTask) { setSelectedTask(null); }
        else { setIsOpen(false); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedTask]);

  // ── Focus input on open ──────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      setSelectedTask(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // ── Build command list ───────────────────────────────────────
  const commands = useMemo<CommandItem[]>(() => {
    const cmds: CommandItem[] = [];

    // Navigation commands
    cmds.push(
      { id: 'nav-gantt',   label: '甘特图视图',   description: '切换到甘特图', category: 'navigation', icon: <Calendar size={16} className="text-indigo-400" />,  keywords: ['gantt','甘特','视图','切换'], action: () => { setCurrentView('gantt'); setIsOpen(false); } },
      { id: 'nav-board',   label: '看板视图',     description: '切换到看板',   category: 'navigation', icon: <Columns size={16} className="text-purple-400" />,   keywords: ['kanban','看板','视图','切换'], action: () => { setCurrentView('board'); setIsOpen(false); } },
      { id: 'nav-matrix',  label: '资源矩阵视图', description: '切换到资源矩阵', category: 'navigation', icon: <BarChart2 size={16} className="text-amber-400" />,  keywords: ['matrix','矩阵','资源','视图','切换'], action: () => { setCurrentView('matrix'); setIsOpen(false); } },
      { id: 'nav-table',   label: '表格视图',     description: '切换到表格',   category: 'navigation', icon: <TableIcon size={16} className="text-cyan-400" />,   keywords: ['table','表格','视图','切换'], action: () => { setCurrentView('table'); setIsOpen(false); } },
    );

    // Action commands
    cmds.push(
      { id: 'act-new-task',     label: '新建任务',   description: '创建一个新任务',   category: 'action', icon: <Plus size={16} className="text-emerald-400" />,    keywords: ['新建','创建','任务','new','task','add'], action: () => { openTaskModal(); setIsOpen(false); } },
      { id: 'act-new-resource', label: '新建成员',   description: '添加团队成员',     category: 'action', icon: <UserPlus size={16} className="text-sky-400" />,    keywords: ['新建','创建','成员','人员','resource','member','add'], action: () => { openResourceModal(); setIsOpen(false); } },
      { id: 'act-tapd',         label: '绑定 TAPD', description: '配置 TAPD 同步',  category: 'action', icon: <LinkIcon size={16} className="text-blue-400" />,   keywords: ['tapd','绑定','同步','sync'], action: () => { openTapdModal(); setIsOpen(false); } },
    );

    // Task commands
    tasks.forEach(task => {
      if (!task.id) return;
      const assignees = (task.assigneeIds || []).map(id => resourceMap.get(id)?.name).filter(Boolean).join(', ');
      const st = statusConfig[task.status];
      cmds.push({
        id: `task-${task.id}`,
        label: task.title,
        description: assignees ? `负责人: ${assignees}` : undefined,
        category: 'task',
        icon: <span className={st.color}>{st.icon}</span>,
        keywords: [task.title, task.type || '', assignees, st.label],
        badge: { text: st.label, color: st.color },
        action: () => { setSelectedTask(task); },
      });
    });

    return cmds;
  }, [tasks, resources, resourceMap, setCurrentView, openTaskModal, openResourceModal, openTapdModal]);

  // ── Sub-commands for selected task ───────────────────────────
  const taskSubCommands = useMemo<CommandItem[]>(() => {
    if (!selectedTask || !selectedTask.id) return [];
    const taskId = selectedTask.id;
    const cmds: CommandItem[] = [];

    // Edit
    cmds.push({
      id: 'sub-edit',
      label: '编辑任务',
      description: `打开 "${selectedTask.title}" 的编辑面板`,
      category: 'action',
      icon: <Hash size={16} className="text-indigo-400" />,
      keywords: ['编辑','edit','修改'],
      action: () => { openTaskModal(taskId); setIsOpen(false); setSelectedTask(null); },
    });

    // Status changes
    const statuses: Array<{ key: Task['status']; label: string; icon: React.ReactNode; color: string }> = [
      { key: 'todo',        label: '设为待办',   icon: <Circle size={16} />,       color: 'text-gray-400' },
      { key: 'in_progress', label: '设为进行中', icon: <Clock size={16} />,        color: 'text-blue-400' },
      { key: 'done',        label: '设为已完成', icon: <CheckCircle2 size={16} />, color: 'text-emerald-400' },
    ];
    statuses.forEach(s => {
      if (s.key === selectedTask.status) return;
      cmds.push({
        id: `sub-status-${s.key}`,
        label: s.label,
        description: `将 "${selectedTask.title}" 状态变更为${s.label.replace('设为', '')}`,
        category: 'status',
        icon: <span className={s.color}>{s.icon}</span>,
        keywords: [s.label, s.key],
        action: async () => {
          await trackedDb.tasks.update(taskId, { status: s.key }, `将任务状态变更为${s.label.replace('设为', '')}`);
          setIsOpen(false);
          setSelectedTask(null);
        },
      });
    });

    return cmds;
  }, [selectedTask, openTaskModal]);

  // ── Active command list ──────────────────────────────────────
  const activeCommands = selectedTask ? taskSubCommands : commands;

  // ── Filtered & grouped ──────────────────────────────────────
  const filtered = useMemo(() => {
    if (!query.trim()) return activeCommands;
    return activeCommands
      .filter(cmd => {
        const searchable = [cmd.label, cmd.description || '', ...cmd.keywords].join(' ');
        return fuzzyMatch(query, searchable);
      })
      .sort((a, b) => {
        const sa = Math.max(...[a.label, ...a.keywords].map(k => fuzzyScore(query, k)));
        const sb = Math.max(...[b.label, ...b.keywords].map(k => fuzzyScore(query, k)));
        return sb - sa;
      });
  }, [activeCommands, query]);

  // Group by category
  const grouped = useMemo(() => {
    const groups: { category: CommandCategory; items: CommandItem[] }[] = [];
    const order: CommandCategory[] = ['navigation', 'action', 'status', 'task'];
    const map = new Map<CommandCategory, CommandItem[]>();
    filtered.forEach(cmd => {
      if (!map.has(cmd.category)) map.set(cmd.category, []);
      map.get(cmd.category)!.push(cmd);
    });
    order.forEach(cat => {
      const items = map.get(cat);
      if (items && items.length > 0) groups.push({ category: cat, items });
    });
    return groups;
  }, [filtered]);

  // Flat list for keyboard nav
  const flatList = useMemo(() => grouped.flatMap(g => g.items), [grouped]);

  // ── Reset active index on query change ───────────────────────
  useEffect(() => { setActiveIndex(0); }, [query, selectedTask]);

  // ── Keyboard navigation ──────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => Math.min(prev + 1, flatList.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && flatList[activeIndex]) {
      e.preventDefault();
      flatList[activeIndex].action();
    } else if (e.key === 'Backspace' && !query && selectedTask) {
      e.preventDefault();
      setSelectedTask(null);
    }
  }, [flatList, activeIndex, query, selectedTask]);

  // ── Scroll active item into view ─────────────────────────────
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  // ── Close on backdrop click ──────────────────────────────────
  if (!isOpen) return null;

  // Pre-compute flat index mapping to avoid mutable closure in JSX
  const flatIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    let idx = 0;
    grouped.forEach(group => {
      group.items.forEach(cmd => {
        map.set(cmd.id, idx++);
      });
    });
    return map;
  }, [grouped]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]"
      onClick={() => setIsOpen(false)}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-xl" />

      {/* Panel */}
      <div
        className="relative w-[580px] max-h-[480px] flex flex-col rounded-2xl border border-white/[0.08] bg-gray-900/90 backdrop-blur-2xl shadow-2xl shadow-black/60 ring-1 ring-white/[0.04] overflow-hidden"
        style={{ animation: 'cmdPaletteIn 0.2s ease-out' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Search bar */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.06]">
          {selectedTask ? (
            <button
              onClick={() => setSelectedTask(null)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-medium hover:bg-indigo-500/25 hover:-translate-y-0.5 active:scale-[0.95] transition-all duration-200 shrink-0"
            >
              <ArrowRight size={12} className="rotate-180" />
              {selectedTask.title.length > 16 ? selectedTask.title.slice(0, 16) + '…' : selectedTask.title}
            </button>
          ) : (
            <Search size={18} className="text-gray-500 shrink-0" />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={selectedTask ? '选择操作…' : '搜索任务、命令或导航…'}
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none"
            spellCheck={false}
          />
          <kbd className="hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-md bg-gray-800/60 border border-white/[0.06] text-[10px] text-gray-500 font-mono tabular-nums shrink-0">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain py-2 px-2 scroll-smooth" style={{ maxHeight: '380px' }}>
          {flatList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <Search size={32} className="mb-3 opacity-40" />
              <p className="text-sm">没有找到匹配的结果</p>
              <p className="text-xs mt-1 opacity-60">尝试不同的关键词或按 <kbd className="px-1 py-0.5 rounded bg-gray-800/80 border border-white/[0.06] text-[10px] font-mono">Backspace</kbd> 返回</p>
            </div>
          ) : (
            grouped.map(group => (
              <div key={group.category} className="mb-1">
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  {categoryLabels[group.category]}
                </div>
                {group.items.map(cmd => {
                  const idx = flatIndexMap.get(cmd.id) ?? 0;
                  const isActive = idx === activeIndex;
                  return (
                    <button
                      key={cmd.id}
                      data-index={idx}
                      onClick={() => cmd.action()}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 cursor-pointer select-none active:scale-[0.97] group ${
                        isActive
                          ? 'bg-white/[0.08] text-white -translate-y-[1px] shadow-sm shadow-black/20'
                          : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
                      }`}
                    >
                      <span className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 ${
                        isActive ? 'bg-white/[0.10] scale-105' : 'bg-white/[0.04]'
                      }`}>
                        {cmd.icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{cmd.label}</div>
                        {cmd.description && (
                          <div className="text-xs text-gray-500 truncate mt-0.5">{cmd.description}</div>
                        )}
                      </div>
                      {cmd.badge && (
                        <span className={`shrink-0 text-[10px] font-medium font-mono tabular-nums px-2 py-0.5 rounded-full ${cmd.badge.color} bg-white/[0.05]`}>
                          {cmd.badge.text}
                        </span>
                      )}
                      {isActive && (
                        <span className="shrink-0 text-gray-500">
                          <CornerDownLeft size={14} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hints */}
        <div className="flex items-center justify-between px-5 py-2.5 border-t border-white/[0.06] bg-gray-950/60 backdrop-blur-sm">
          <div className="flex items-center gap-4 text-[10px] text-gray-500">
            <span className="flex items-center gap-1">
              <ChevronUp size={12} />
              <ChevronDown size={12} />
              导航
            </span>
            <span className="flex items-center gap-1">
              <CornerDownLeft size={12} />
              确认
            </span>
            <span className="flex items-center gap-1">
              <span className="font-mono">ESC</span>
              关闭
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-gray-600">
            <Zap size={10} className="text-amber-500/60" />
            <span className="font-mono tabular-nums">{flatList.length} 个结果</span>
          </div>
        </div>
      </div>

      {/* Keyframe animation */}
      <style>{`
        @keyframes cmdPaletteIn {
          from { opacity: 0; transform: translateY(-12px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
