import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { ProjectNote, BlueprintEntry, TodoItem } from '../types/projectNote';
import type { Resource } from '../types/resource';
import {
  StickyNote, Plus, Search, Pin, PinOff, Trash2, Edit3, Save,
  X, Tag, Clock, ChevronDown, Filter, BookOpen, FileText,
  MoreHorizontal, Copy, Check, AlertTriangle, Box, User, Code2, Layers,
  Eye, Pencil, CheckSquare, Square, ListTodo, Hash
} from 'lucide-react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';

// Predefined category options with colors
const CATEGORIES = [
  { label: '全部', value: '', color: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/20', icon: '📋' },
  { label: '蓝图', value: '蓝图', color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20', icon: '🗺️' },
  { label: '命名', value: '命名', color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', icon: '🏷️' },
  { label: '负责人', value: '负责人', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: '👤' },
  { label: '设计', value: '设计', color: 'text-pink-400', bg: 'bg-pink-500/10', border: 'border-pink-500/20', icon: '🎨' },
  { label: '交互', value: '交互', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: '🖱️' },
  { label: '开发', value: '开发', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', icon: '💻' },
  { label: '其他', value: '其他', color: 'text-gray-400', bg: 'bg-gray-500/10', border: 'border-gray-500/20', icon: '📌' },
];

const getCategoryStyle = (category?: string) => {
  const found = CATEGORIES.find(c => c.value === category);
  return found || CATEGORIES[CATEGORIES.length - 1];
};

// Predefined system module options
const SYSTEM_MODULES = [
  '背包系统', '商城系统', '主界面', '战斗系统', '社交系统',
  '任务系统', '成就系统', '设置界面', '登录/注册', '地图系统',
  '聊天系统', '公会系统', '排行榜', '活动系统', '新手引导',
  '邮件系统', '公告系统', '充值系统',
];

export function ProjectNotebook() {
  const notes = useLiveQuery(() => db.projectNotes.orderBy('updatedAt').reverse().toArray()) || [];
  const resources = useLiveQuery(() => db.resources.toArray()) || [];
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [editingNote, setEditingNote] = useState<ProjectNote | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<number | null>(null);
  const [editPreviewMode, setEditPreviewMode] = useState<'edit' | 'preview'>('edit');
  const [createPreviewMode, setCreatePreviewMode] = useState<'edit' | 'preview'>('edit');

  // Helper: create an empty blueprint entry
  const emptyEntry = (): BlueprintEntry => ({ systemModule: '', blueprintNames: [], ownerIds: [] });

  // New note form state
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('蓝图');
  const [newEntries, setNewEntries] = useState<BlueprintEntry[]>([emptyEntry()]);
  const [newEntryBpInputs, setNewEntryBpInputs] = useState<string[]>(['']);
  const [newTodos, setNewTodos] = useState<TodoItem[]>([]);
  const [newTodoInput, setNewTodoInput] = useState('');
  const [newTags, setNewTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [editTodoInput, setEditTodoInput] = useState('');
  const [editTagInput, setEditTagInput] = useState('');
  const [showOwnerDropdownIdx, setShowOwnerDropdownIdx] = useState<number | null>(null);
  const [showEditOwnerDropdownIdx, setShowEditOwnerDropdownIdx] = useState<number | null>(null);
  const [showModuleSuggestionsIdx, setShowModuleSuggestionsIdx] = useState<number | null>(null);
  const [editModuleSuggestionsIdx, setEditModuleSuggestionsIdx] = useState<number | null>(null);
  const [editEntryBpInputs, setEditEntryBpInputs] = useState<string[]>([]);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-note-menu]')) {
        setActiveMenuId(null);
      }
    };
    if (activeMenuId !== null) {
      document.addEventListener('mousedown', handler);
    }
    return () => document.removeEventListener('mousedown', handler);
  }, [activeMenuId]);

  // Auto-focus title input when creating
  useEffect(() => {
    if (isCreating && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [isCreating]);

  // Helper: resolve owner names from IDs
  const resolveOwnerNames = useCallback((ids: number[]): string[] => {
    return ids.map(id => resources.find(r => r.id === id)?.name).filter(Boolean) as string[];
  }, [resources]);

  // Helper: get blueprint entries from a note (handles legacy fields)
  const getEntries = useCallback((note: ProjectNote): BlueprintEntry[] => {
    if (note.blueprintEntries && note.blueprintEntries.length > 0) return note.blueprintEntries;
    // Legacy fallback
    const bpNames = note.blueprintNames || (note.blueprintName ? [note.blueprintName] : []);
    const owners = note.ownerIds || [];
    const mod = note.systemModule || '';
    if (mod || bpNames.length > 0 || owners.length > 0) {
      return [{ systemModule: mod, blueprintNames: bpNames, ownerIds: owners }];
    }
    return [];
  }, []);

  // Filtered and sorted notes
  const filteredNotes = useMemo(() => {
    let result = [...notes];

    // Filter by category
    if (filterCategory) {
      result = result.filter(n => n.category === filterCategory);
    }

    // Filter by tag
    if (filterTag) {
      result = result.filter(n => n.tags && n.tags.includes(filterTag));
    }

    // Filter by search query (also search structured fields)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(n => {
        const entries = getEntries(n);
        const allModules = entries.map(e => e.systemModule).join(' ');
        const allBps = entries.flatMap(e => e.blueprintNames).join(' ');
        const allOwners = entries.flatMap(e => resolveOwnerNames(e.ownerIds)).join(' ');
        const allTags = (n.tags || []).join(' ');
        const allTodos = (n.todos || []).map(t => t.text).join(' ');
        return (
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q) ||
          (n.category && n.category.toLowerCase().includes(q)) ||
          allBps.toLowerCase().includes(q) ||
          allModules.toLowerCase().includes(q) ||
          allOwners.toLowerCase().includes(q) ||
          allTags.toLowerCase().includes(q) ||
          allTodos.toLowerCase().includes(q)
        );
      });
    }

    // Sort: pinned first, then by updatedAt desc
    result.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.updatedAt - a.updatedAt;
    });

    return result;
  }, [notes, filterCategory, filterTag, searchQuery]);

  // Stats
  const stats = useMemo(() => {
    const total = notes.length;
    const pinned = notes.filter(n => n.pinned).length;
    const categories = new Map<string, number>();
    const modules = new Map<string, number>();
    notes.forEach(n => {
      const cat = n.category || '其他';
      categories.set(cat, (categories.get(cat) || 0) + 1);
      const entries = n.blueprintEntries || [];
      entries.forEach(e => {
        if (e.systemModule) {
          modules.set(e.systemModule, (modules.get(e.systemModule) || 0) + 1);
        }
      });
    });
    return { total, pinned, categories, modules };
  }, [notes]);

  // Filter module suggestions based on input
  const getModuleSuggestions = useCallback((input: string) => {
    if (!input.trim()) return SYSTEM_MODULES;
    const q = input.toLowerCase();
    return SYSTEM_MODULES.filter(m => m.toLowerCase().includes(q));
  }, []);

  const handleCreate = useCallback(async () => {
    if (!newTitle.trim()) return;
    const now = Date.now();
    // Finalize entries: collect remaining blueprint inputs
    const finalEntries: BlueprintEntry[] = newEntries.map((entry, idx) => {
      const bpNames = [...entry.blueprintNames];
      if (newEntryBpInputs[idx]?.trim()) bpNames.push(newEntryBpInputs[idx].trim());
      return { ...entry, blueprintNames: bpNames };
    }).filter(e => e.systemModule || e.blueprintNames.length > 0 || e.ownerIds.length > 0);
    await db.projectNotes.add({
      title: newTitle.trim(),
      content: newContent,
      category: newCategory || undefined,
      blueprintEntries: finalEntries.length > 0 ? finalEntries : undefined,
      todos: newTodos.length > 0 ? newTodos : undefined,
      tags: newTags.length > 0 ? newTags : undefined,
      createdAt: now,
      updatedAt: now,
      pinned: false,
      projectId: 1,
    });
    setNewTitle('');
    setNewContent('');
    setNewCategory('蓝图');
    setNewEntries([emptyEntry()]);
    setNewEntryBpInputs(['']);
    setNewTodos([]);
    setNewTodoInput('');
    setNewTags([]);
    setNewTagInput('');
    setIsCreating(false);
  }, [newTitle, newContent, newCategory, newEntries, newEntryBpInputs, newTodos, newTags]);

  const handleUpdate = useCallback(async () => {
    if (!editingNote || !editingNote.id) return;
    // Finalize entries: collect remaining blueprint inputs
    const entries = editingNote.blueprintEntries || [];
    const finalEntries: BlueprintEntry[] = entries.map((entry, idx) => {
      const bpNames = [...entry.blueprintNames];
      if (editEntryBpInputs[idx]?.trim()) bpNames.push(editEntryBpInputs[idx].trim());
      return { ...entry, blueprintNames: bpNames };
    }).filter(e => e.systemModule || e.blueprintNames.length > 0 || e.ownerIds.length > 0);
    await db.projectNotes.update(editingNote.id, {
      title: editingNote.title,
      content: editingNote.content,
      category: editingNote.category,
      blueprintEntries: finalEntries.length > 0 ? finalEntries : undefined,
      todos: editingNote.todos && editingNote.todos.length > 0 ? editingNote.todos : undefined,
      tags: editingNote.tags && editingNote.tags.length > 0 ? editingNote.tags : undefined,
      // Clear legacy fields
      blueprintName: undefined,
      blueprintNames: undefined,
      systemModule: undefined,
      ownerIds: undefined,
      owner: undefined,
      updatedAt: Date.now(),
    });
    setEditingNote(null);
    setEditEntryBpInputs([]);
    setEditTodoInput('');
    setEditTagInput('');
  }, [editingNote, editEntryBpInputs]);

  const handleDelete = useCallback(async (id: number) => {
    await db.projectNotes.delete(id);
    setShowDeleteConfirm(null);
    if (editingNote?.id === id) setEditingNote(null);
  }, [editingNote]);

  const handleTogglePin = useCallback(async (note: ProjectNote) => {
    if (!note.id) return;
    await db.projectNotes.update(note.id, {
      pinned: !note.pinned,
      updatedAt: Date.now(),
    });
  }, []);

  const handleCopyContent = useCallback((note: ProjectNote) => {
    const text = `${note.title}\n${note.content}`;
    navigator.clipboard.writeText(text);
    setCopiedId(note.id || null);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-800/60 bg-gray-900/40 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center border border-amber-500/20">
              <BookOpen size={18} className="text-amber-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">项目记事本</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                记录蓝图负责人、命名规范、设计说明等项目信息
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Stats badges */}
            <div className="flex items-center gap-2 mr-2">
              <span className="px-2.5 py-1 bg-gray-800/60 border border-gray-700/40 rounded-lg text-[11px] text-gray-400 font-medium">
                共 {stats.total} 条
              </span>
              {stats.pinned > 0 && (
                <span className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 rounded-lg text-[11px] text-amber-400 font-medium flex items-center gap-1">
                  <Pin size={10} />
                  {stats.pinned} 置顶
                </span>
              )}
            </div>
            <button
              onClick={() => { setIsCreating(true); setEditingNote(null); }}
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-600/80 hover:bg-amber-500/80 text-white text-sm font-medium rounded-lg transition-all duration-200 shadow-lg shadow-amber-500/15 hover:shadow-amber-500/30 active:scale-95"
            >
              <Plus size={16} />
              新建笔记
            </button>
          </div>
        </div>

        {/* Search + Category Filter */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索笔记标题或内容…"
              className="w-full pl-9 pr-3 py-2 bg-gray-800/60 border border-gray-700/50 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/20 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-700 rounded text-gray-500 hover:text-gray-300 transition-colors"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 bg-gray-800/40 rounded-lg p-1 border border-gray-700/30">
            {CATEGORIES.map(cat => (
              <button
                key={cat.value}
                onClick={() => setFilterCategory(cat.value)}
                className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                  filterCategory === cat.value
                    ? `${cat.bg} ${cat.color} ${cat.border} border shadow-sm`
                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-700/40 border border-transparent'
                }`}
              >
                <span className="text-[12px]">{cat.icon}</span>
                {cat.label}
                {cat.value && stats.categories.get(cat.value) ? (
                  <span className={`ml-0.5 text-[9px] px-1.5 py-[1px] rounded-full font-bold ${
                    filterCategory === cat.value
                      ? `${cat.bg} ${cat.color}`
                      : 'bg-gray-700/50 text-gray-500'
                  }`}>{stats.categories.get(cat.value)}</span>
                ) : null}
              </button>
            ))}
          </div>

          {/* Tag filter - show only when tags exist */}
          {(() => {
            const allTags = Array.from(new Set(notes.flatMap(n => n.tags || [])));
            if (allTags.length === 0) return null;
            return (
              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                <Hash size={11} className="text-gray-600 shrink-0" />
                {filterTag && (
                  <button
                    onClick={() => setFilterTag('')}
                    className="px-2 py-0.5 text-[10px] font-medium rounded-full border border-gray-600/40 text-gray-400 hover:text-white hover:bg-gray-700/40 transition-all"
                  >
                    全部
                  </button>
                )}
                {allTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => setFilterTag(filterTag === tag ? '' : tag)}
                    className={`px-2 py-0.5 text-[10px] font-medium rounded-full border transition-all ${
                      filterTag === tag
                        ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300 shadow-sm'
                        : 'border-gray-700/40 text-gray-500 hover:text-indigo-300 hover:bg-indigo-500/10 hover:border-indigo-500/20'
                    }`}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        {/* Create Note Form */}
        {isCreating && (
          <div className="mb-6 bg-gradient-to-b from-amber-500/5 to-transparent border border-amber-500/20 rounded-xl overflow-hidden animate-in fade-in slide-in-from-top-2">
            <div className="px-5 py-3 bg-amber-500/5 border-b border-amber-500/15 flex items-center justify-between">
              <span className="text-sm font-semibold text-amber-300 flex items-center gap-2">
                <StickyNote size={14} />
                新建笔记
              </span>
              <button
                onClick={() => { setIsCreating(false); setNewTitle(''); setNewContent(''); }}
                className="p-1 hover:bg-gray-700/50 rounded-md text-gray-500 hover:text-gray-300 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {/* Title */}
              <div>
                <input
                  ref={titleInputRef}
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="笔记标题（如：背包界面蓝图记录）"
                  className="w-full px-3 py-2.5 bg-gray-800/60 border border-gray-700/50 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/20 transition-all"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.preventDefault();
                  }}
                />
              </div>

              {/* Multi-module Blueprint Entries */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-gray-500 flex items-center gap-1">
                    <Layers size={10} />
                    蓝图信息条目
                    <span className="text-gray-600 text-[9px]">（可添加多个模块）</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setNewEntries(prev => [...prev, emptyEntry()]);
                      setNewEntryBpInputs(prev => [...prev, '']);
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 rounded-md border border-amber-500/20 transition-colors"
                  >
                    <Plus size={10} />
                    添加模块
                  </button>
                </div>
                {newEntries.map((entry, eIdx) => (
                  <div key={eIdx} className="relative bg-gray-800/30 border border-gray-700/40 rounded-lg p-2.5 space-y-1.5">
                    {newEntries.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          setNewEntries(prev => prev.filter((_, i) => i !== eIdx));
                          setNewEntryBpInputs(prev => prev.filter((_, i) => i !== eIdx));
                        }}
                        className="absolute top-1.5 right-1.5 p-0.5 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                        title="删除此条目"
                      >
                        <X size={12} />
                      </button>
                    )}
                    <div className="grid grid-cols-3 gap-2">
                      {/* System Module */}
                      <div className="relative">
                        <label className="text-[9px] text-gray-500 mb-0.5 flex items-center gap-1">
                          <Layers size={9} /> 系统模块
                        </label>
                        <input
                          type="text"
                          value={entry.systemModule}
                          onChange={(e) => {
                            const updated = [...newEntries];
                            updated[eIdx] = { ...updated[eIdx], systemModule: e.target.value };
                            setNewEntries(updated);
                            setShowModuleSuggestionsIdx(eIdx);
                          }}
                          onFocus={() => setShowModuleSuggestionsIdx(eIdx)}
                          onBlur={() => setTimeout(() => setShowModuleSuggestionsIdx(null), 200)}
                          placeholder="如：背包系统"
                          className="w-full px-2.5 py-1.5 bg-gray-800/60 border border-gray-700/50 rounded-lg text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500/40 focus:ring-1 focus:ring-purple-500/20 transition-all"
                        />
                        {showModuleSuggestionsIdx === eIdx && getModuleSuggestions(entry.systemModule).length > 0 && (
                          <div className="absolute left-0 right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 max-h-32 overflow-y-auto custom-scrollbar py-1">
                            {getModuleSuggestions(entry.systemModule).map(m => (
                              <button
                                key={m}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  const updated = [...newEntries];
                                  updated[eIdx] = { ...updated[eIdx], systemModule: m };
                                  setNewEntries(updated);
                                  setShowModuleSuggestionsIdx(null);
                                }}
                                className="w-full px-3 py-1.5 text-left text-[11px] text-gray-300 hover:text-white hover:bg-gray-700/60 transition-colors"
                              >
                                {m}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Blueprint Names */}
                      <div>
                        <label className="text-[9px] text-gray-500 mb-0.5 flex items-center gap-1">
                          <Code2 size={9} /> 蓝图命名 <span className="text-gray-600 text-[8px]">（回车添加）</span>
                        </label>
                        <div className="w-full min-h-[30px] px-1.5 py-0.5 bg-gray-800/60 border border-gray-700/50 rounded-lg flex flex-wrap items-center gap-0.5 focus-within:border-cyan-500/40 focus-within:ring-1 focus-within:ring-cyan-500/20 transition-all">
                          {entry.blueprintNames.map((bp, bpIdx) => (
                            <span key={bpIdx} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-cyan-500/15 border border-cyan-500/25 rounded text-[10px] text-cyan-300 font-mono">
                              {bp}
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = [...newEntries];
                                  updated[eIdx] = { ...updated[eIdx], blueprintNames: updated[eIdx].blueprintNames.filter((_, i) => i !== bpIdx) };
                                  setNewEntries(updated);
                                }}
                                className="ml-0.5 text-cyan-400/60 hover:text-cyan-300 transition-colors"
                              >
                                <X size={8} />
                              </button>
                            </span>
                          ))}
                          <input
                            type="text"
                            value={newEntryBpInputs[eIdx] || ''}
                            onChange={(e) => {
                              const inputs = [...newEntryBpInputs];
                              inputs[eIdx] = e.target.value;
                              setNewEntryBpInputs(inputs);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && (newEntryBpInputs[eIdx] || '').trim()) {
                                e.preventDefault();
                                const updated = [...newEntries];
                                updated[eIdx] = { ...updated[eIdx], blueprintNames: [...updated[eIdx].blueprintNames, newEntryBpInputs[eIdx].trim()] };
                                setNewEntries(updated);
                                const inputs = [...newEntryBpInputs];
                                inputs[eIdx] = '';
                                setNewEntryBpInputs(inputs);
                              } else if (e.key === 'Backspace' && !(newEntryBpInputs[eIdx] || '') && entry.blueprintNames.length > 0) {
                                const updated = [...newEntries];
                                updated[eIdx] = { ...updated[eIdx], blueprintNames: updated[eIdx].blueprintNames.slice(0, -1) };
                                setNewEntries(updated);
                              }
                            }}
                            placeholder={entry.blueprintNames.length === 0 ? "如：WBP_Backpack_Main" : "继续添加…"}
                            className="flex-1 min-w-[60px] bg-transparent border-none outline-none text-[10px] text-gray-200 placeholder-gray-600 font-mono py-0.5"
                          />
                        </div>
                      </div>
                      {/* Owner */}
                      <div className="relative">
                        <label className="text-[9px] text-gray-500 mb-0.5 flex items-center gap-1">
                          <User size={9} /> 负责人
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowOwnerDropdownIdx(showOwnerDropdownIdx === eIdx ? null : eIdx)}
                          onBlur={() => setTimeout(() => setShowOwnerDropdownIdx(null), 200)}
                          className="w-full min-h-[30px] px-2 py-1 bg-gray-800/60 border border-gray-700/50 rounded-lg text-left flex flex-wrap items-center gap-0.5 focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/20 transition-all"
                        >
                          {entry.ownerIds.length > 0 ? (
                            entry.ownerIds.map(id => {
                              const r = resources.find(res => res.id === id);
                              return r ? (
                                <span key={id} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-500/15 border border-amber-500/25 rounded text-[10px] text-amber-300">
                                  {r.name}
                                  <span
                                    role="button"
                                    onMouseDown={(e) => {
                                      e.preventDefault(); e.stopPropagation();
                                      const updated = [...newEntries];
                                      updated[eIdx] = { ...updated[eIdx], ownerIds: updated[eIdx].ownerIds.filter(oid => oid !== id) };
                                      setNewEntries(updated);
                                    }}
                                    className="ml-0.5 text-amber-400/60 hover:text-amber-300 cursor-pointer"
                                  >
                                    <X size={8} />
                                  </span>
                                </span>
                              ) : null;
                            })
                          ) : (
                            <span className="text-[10px] text-gray-600">选择成员…</span>
                          )}
                          <ChevronDown size={9} className="ml-auto text-gray-600 shrink-0" />
                        </button>
                        {showOwnerDropdownIdx === eIdx && resources.length > 0 && (
                          <div className="absolute left-0 right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 max-h-32 overflow-y-auto custom-scrollbar py-1">
                            {resources.filter(r => r.status !== 'departed').map(r => {
                              const selected = entry.ownerIds.includes(r.id!);
                              return (
                                <button
                                  key={r.id}
                                  type="button"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    const updated = [...newEntries];
                                    if (selected) {
                                      updated[eIdx] = { ...updated[eIdx], ownerIds: updated[eIdx].ownerIds.filter(id => id !== r.id) };
                                    } else {
                                      updated[eIdx] = { ...updated[eIdx], ownerIds: [...updated[eIdx].ownerIds, r.id!] };
                                    }
                                    setNewEntries(updated);
                                  }}
                                  className={`w-full px-3 py-1.5 text-left text-[11px] flex items-center gap-2 transition-colors ${
                                    selected ? 'text-amber-300 bg-amber-500/10' : 'text-gray-300 hover:text-white hover:bg-gray-700/60'
                                  }`}
                                >
                                  <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[8px] ${
                                    selected ? 'bg-amber-500/30 border-amber-500/50 text-amber-300' : 'border-gray-600'
                                  }`}>
                                    {selected && <Check size={8} />}
                                  </span>
                                  {r.name}
                                  <span className="text-[9px] text-gray-600 ml-auto">{r.role}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Free-form notes with Markdown preview */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] text-gray-500 flex items-center gap-1">
                    <FileText size={10} />
                    备注说明（选填）
                    <span className="text-[9px] text-gray-600">（支持 Markdown）</span>
                  </label>
                  <div className="flex items-center gap-0.5 bg-gray-800/60 rounded-md p-0.5 border border-gray-700/40">
                    <button
                      type="button"
                      onClick={() => setCreatePreviewMode('edit')}
                      className={`flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded transition-all ${
                        createPreviewMode === 'edit'
                          ? 'bg-gray-700/80 text-white shadow-sm'
                          : 'text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      <Pencil size={9} />
                      编辑
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreatePreviewMode('preview')}
                      className={`flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded transition-all ${
                        createPreviewMode === 'preview'
                          ? 'bg-gray-700/80 text-white shadow-sm'
                          : 'text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      <Eye size={9} />
                      预览
                    </button>
                  </div>
                </div>
                {createPreviewMode === 'edit' ? (
                  <textarea
                    ref={contentRef}
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    placeholder="支持 Markdown 语法：# 标题、**加粗**、- 列表、`代码`…"
                    rows={3}
                    className="w-full px-3 py-2.5 bg-gray-800/60 border border-gray-700/50 rounded-lg text-sm text-gray-200 font-mono placeholder-gray-600 focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/20 transition-all resize-none leading-relaxed"
                  />
                ) : (
                  <div className="w-full min-h-[78px] max-h-[200px] overflow-y-auto px-3 py-2.5 bg-gray-800/60 border border-gray-700/50 rounded-lg custom-scrollbar prose prose-invert prose-xs prose-p:my-1 prose-headings:my-1.5 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-code:text-cyan-300 prose-code:bg-cyan-500/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[11px] prose-pre:bg-gray-900/80 prose-pre:border prose-pre:border-gray-700/50 prose-pre:rounded-lg prose-a:text-amber-400 prose-strong:text-gray-200 max-w-none">
                    {newContent ? (
                      <ReactMarkdown remarkPlugins={[remarkBreaks]}>{newContent}</ReactMarkdown>
                    ) : (
                      <p className="text-xs text-gray-600 italic">暂无内容，切换到编辑模式输入…</p>
                    )}
                  </div>
                )}
              </div>

              {/* Todo / Checklist items (Create mode) */}
              <div>
                <label className="text-xs text-gray-400 mb-2 flex items-center gap-1.5 font-medium">
                  <ListTodo size={12} /> 待办事项
                </label>
                <div className="space-y-1.5 mb-2">
                  {newTodos.map((todo) => (
                    <div key={todo.id} className="flex items-center gap-2 group/todo">
                      <button
                        type="button"
                        onClick={() => {
                          setNewTodos(newTodos.map(t => t.id === todo.id ? { ...t, done: !t.done } : t));
                        }}
                        className="shrink-0"
                      >
                        {todo.done ? (
                          <CheckSquare size={14} className="text-emerald-400" />
                        ) : (
                          <Square size={14} className="text-gray-500 hover:text-gray-300" />
                        )}
                      </button>
                      <span className={`flex-1 text-sm ${todo.done ? 'text-gray-600 line-through' : 'text-gray-300'}`}>
                        {todo.text}
                      </span>
                      <button
                        type="button"
                        onClick={() => setNewTodos(newTodos.filter(t => t.id !== todo.id))}
                        className="opacity-0 group-hover/todo:opacity-100 p-0.5 text-gray-600 hover:text-red-400 transition-all"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newTodoInput}
                    onChange={(e) => setNewTodoInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newTodoInput.trim()) {
                        e.preventDefault();
                        const newTodo: TodoItem = { id: Date.now().toString(), text: newTodoInput.trim(), done: false };
                        setNewTodos([...newTodos, newTodo]);
                        setNewTodoInput('');
                      }
                    }}
                    placeholder="输入待办事项，按 Enter 添加…"
                    className="flex-1 px-3 py-1.5 bg-gray-800/60 border border-gray-700/50 rounded-lg text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/20 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newTodoInput.trim()) {
                        const newTodo: TodoItem = { id: Date.now().toString(), text: newTodoInput.trim(), done: false };
                        setNewTodos([...newTodos, newTodo]);
                        setNewTodoInput('');
                      }
                    }}
                    className="p-1.5 bg-gray-800/60 border border-gray-700/50 rounded-lg text-gray-500 hover:text-emerald-400 hover:border-emerald-500/40 transition-all"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>

              {/* Tags (Create mode) */}
              <div>
                <label className="text-xs text-gray-400 mb-2 flex items-center gap-1.5 font-medium">
                  <Hash size={12} /> 标签
                </label>
                <div className="flex items-center gap-1.5 flex-wrap mb-2">
                  {newTags.map((tag, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-[11px] text-indigo-300 font-medium">
                      #{tag}
                      <button
                        type="button"
                        onClick={() => setNewTags(newTags.filter((_, i) => i !== idx))}
                        className="text-indigo-400/60 hover:text-red-400 transition-colors"
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newTagInput.trim()) {
                        e.preventDefault();
                        const tag = newTagInput.trim().replace(/^#/, '');
                        if (tag && !newTags.includes(tag)) {
                          setNewTags([...newTags, tag]);
                        }
                        setNewTagInput('');
                      }
                    }}
                    placeholder="输入标签名，按 Enter 添加…"
                    className="flex-1 px-3 py-1.5 bg-gray-800/60 border border-gray-700/50 rounded-lg text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/20 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (newTagInput.trim()) {
                        const tag = newTagInput.trim().replace(/^#/, '');
                        if (tag && !newTags.includes(tag)) {
                          setNewTags([...newTags, tag]);
                        }
                        setNewTagInput('');
                      }
                    }}
                    className="p-1.5 bg-gray-800/60 border border-gray-700/50 rounded-lg text-gray-500 hover:text-indigo-400 hover:border-indigo-500/40 transition-all"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Tag size={12} className="text-gray-500" />
                  <span className="text-[11px] text-gray-500">分类：</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {CATEGORIES.filter(c => c.value).map(cat => (
                      <button
                        key={cat.value}
                        onClick={() => setNewCategory(cat.value)}
                        className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all border ${
                          newCategory === cat.value
                            ? `${cat.bg} ${cat.color} ${cat.border} shadow-sm ring-1 ring-current/20`
                            : 'text-gray-600 border-gray-700/40 hover:text-gray-300 hover:bg-gray-800/60 hover:border-gray-600/50'
                        }`}
                      >
                        <span className="text-[12px]">{cat.icon}</span>
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setIsCreating(false); setNewTitle(''); setNewContent(''); }}
                    className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-800/50 rounded-lg transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={!newTitle.trim()}
                    className="flex items-center gap-1 px-4 py-1.5 bg-amber-600/80 hover:bg-amber-500/80 disabled:bg-gray-700/50 disabled:text-gray-600 text-white text-xs font-medium rounded-lg transition-all"
                  >
                    <Save size={12} />
                    保存
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Notes Grid */}
        {filteredNotes.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredNotes.map(note => {
              const catStyle = getCategoryStyle(note.category);

              return (
                <div
                  key={note.id}
className={`group relative bg-gray-900/60 border rounded-lg overflow-hidden transition-all duration-200 hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5 min-h-[320px] flex flex-col ${
                    note.pinned
                      ? 'border-amber-500/25 ring-1 ring-amber-500/10'
                      : 'border-gray-800/60 hover:border-gray-700/60'
                  }`}
                >
                  {/* Pin indicator */}
                  {note.pinned && (
                    <div className="absolute top-1.5 right-1.5 z-10">
                      <Pin size={10} className="text-amber-400 fill-amber-400" />
                    </div>
                  )}

                  {/* Card Header - compact sticky note style */}
                  <div className="px-3 py-2 border-b border-gray-800/40 flex items-start gap-1.5">
                    <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-gray-200 line-clamp-2 pr-5 leading-snug">
                          {note.title}
                        </h3>
                      <div className="flex items-center gap-1.5 mt-1">
                        {note.category && (
                          <span className={`inline-flex items-center gap-1 px-1.5 py-[2px] text-[10px] font-bold rounded-md border ${catStyle.bg} ${catStyle.color} ${catStyle.border} shadow-sm`}>
                            <span className="text-[10px]">{catStyle.icon}</span>
                            {note.category}
                          </span>
                        )}
                        <span className="text-[10px] text-gray-600 flex items-center gap-0.5">
                          <Clock size={9} />
                          {format(note.updatedAt, 'MM/dd HH:mm', { locale: zhCN })}
                        </span>
                      </div>
                    </div>

                    {/* Action menu */}
                    <div className="relative shrink-0" data-note-menu>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuId(activeMenuId === note.id ? null : (note.id || null));
                        }}
                        className="p-1 rounded-md text-gray-600 hover:text-gray-300 hover:bg-gray-800/60 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <MoreHorizontal size={14} />
                      </button>
                      {activeMenuId === note.id && (
                        <div className="absolute right-0 top-full mt-1 w-32 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden z-50 py-1">
                          <button
                            onClick={() => {
                              const noteToEdit = { ...note };
                              if (!noteToEdit.blueprintEntries || noteToEdit.blueprintEntries.length === 0) {
                                noteToEdit.blueprintEntries = getEntries(note);
                              }
                              if (noteToEdit.blueprintEntries.length === 0) {
                                noteToEdit.blueprintEntries = [emptyEntry()];
                              }
                              setEditEntryBpInputs(noteToEdit.blueprintEntries.map(() => ''));
                              setEditingNote(noteToEdit);
                              setActiveMenuId(null);
                              setIsCreating(false);
                            }}
                            className="w-full px-3 py-1.5 text-left text-xs text-gray-300 hover:text-white hover:bg-gray-700 flex items-center gap-2 transition-colors"
                          >
                            <Edit3 size={11} />
                            编辑
                          </button>
                          <button
                            onClick={() => {
                              handleTogglePin(note);
                              setActiveMenuId(null);
                            }}
                            className="w-full px-3 py-1.5 text-left text-xs text-gray-300 hover:text-white hover:bg-gray-700 flex items-center gap-2 transition-colors"
                          >
                            {note.pinned ? <PinOff size={11} /> : <Pin size={11} />}
                            {note.pinned ? '取消置顶' : '置顶'}
                          </button>
                          <button
                            onClick={() => {
                              handleCopyContent(note);
                              setActiveMenuId(null);
                            }}
                            className="w-full px-3 py-1.5 text-left text-xs text-gray-300 hover:text-white hover:bg-gray-700 flex items-center gap-2 transition-colors"
                          >
                            {copiedId === note.id ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                            {copiedId === note.id ? '已复制' : '复制内容'}
                          </button>
                          <div className="h-px bg-gray-700 my-1" />
                          <button
                            onClick={() => {
                              setShowDeleteConfirm(note.id || null);
                              setActiveMenuId(null);
                            }}
                            className="w-full px-3 py-1.5 text-left text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 flex items-center gap-2 transition-colors"
                          >
                            <Trash2 size={11} />
                            删除
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Content - segmented layout */}
                  <div className="px-3 py-2 flex-1 space-y-2">
                      <div
                        className="cursor-pointer"
                        onClick={() => {
                          const noteToEdit = { ...note };
                          if (!noteToEdit.blueprintEntries || noteToEdit.blueprintEntries.length === 0) {
                            noteToEdit.blueprintEntries = getEntries(note);
                          }
                          if (noteToEdit.blueprintEntries.length === 0) {
                            noteToEdit.blueprintEntries = [emptyEntry()];
                          }
                          setEditEntryBpInputs(noteToEdit.blueprintEntries.map(() => ''));
                          setEditingNote(noteToEdit);
                          setIsCreating(false);
                        }}
                      >
                        {/* Structured info display - grouped by module */}
                        {(() => {
                          const entries = getEntries(note);
                          if (entries.length === 0) return null;
                          return (
                            <div className="space-y-1.5 pb-2 border-b border-gray-700/30">
                              {entries.map((entry, eIdx) => {
                                const ownerNames = resolveOwnerNames(entry.ownerIds);
                                return (
                                  <div key={eIdx} className={`${entries.length > 1 ? 'pl-2 border-l-2 border-purple-500/20' : ''}`}>
                                    <div className="flex flex-wrap items-center gap-1">
                                      {entry.systemModule && (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-[2px] bg-purple-500/10 border border-purple-500/20 rounded text-[11px] text-purple-300 font-medium leading-tight">
                                          <Layers size={10} className="text-purple-400/70 shrink-0" />
                                          {entry.systemModule}
                                        </span>
                                      )}
                                      {entry.blueprintNames.map((bp, bpIdx) => (
                                        <span key={`bp-${bpIdx}`} className="inline-flex items-center gap-1 px-1.5 py-[2px] bg-cyan-500/10 border border-cyan-500/20 rounded text-[11px] text-cyan-300 font-mono font-medium leading-tight">
                                          <Code2 size={10} className="text-cyan-400/70 shrink-0" />
                                          {bp}
                                        </span>
                                      ))}
                                      {ownerNames.map((name, oIdx) => (
                                        <span key={`owner-${oIdx}`} className="inline-flex items-center gap-1 px-1.5 py-[2px] bg-amber-500/10 border border-amber-500/20 rounded text-[11px] text-amber-300 font-medium leading-tight">
                                          <User size={10} className="text-amber-400/70 shrink-0" />
                                          {name}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
              {/* Free-form notes - rendered as Markdown */}
                        {note.content ? (
                          <div className="text-[13px] text-gray-400 leading-relaxed max-h-[200px] overflow-y-auto custom-scrollbar hover:text-gray-300 transition-colors prose prose-invert prose-xs prose-p:my-1.5 prose-headings:my-2 prose-headings:pb-1 prose-headings:border-b prose-headings:border-gray-700/30 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-code:text-cyan-300 prose-code:bg-cyan-500/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[11px] prose-pre:bg-gray-800/80 prose-pre:border prose-pre:border-gray-700/50 prose-pre:rounded-lg prose-a:text-amber-400 prose-strong:text-gray-200 max-w-none">
                            <ReactMarkdown remarkPlugins={[remarkBreaks]}>{note.content}</ReactMarkdown>
                          </div>
                        ) : getEntries(note).length === 0 && (!note.todos || note.todos.length === 0) ? (
                          <span className="text-[13px] text-gray-600 italic">点击编辑内容…</span>
                        ) : null}

                        {/* Todo items display */}
                        {note.todos && note.todos.length > 0 && (
                          <div className="space-y-1 pt-1.5 border-t border-gray-700/30">
                            <div className="flex items-center gap-1 mb-1">
                              <ListTodo size={10} className="text-emerald-400/70" />
                              <span className="text-[10px] text-gray-500 font-medium">
                                待办 {note.todos.filter(t => t.done).length}/{note.todos.length}
                              </span>
                            </div>
                            {note.todos.slice(0, 4).map((todo) => (
                              <div key={todo.id} className="flex items-center gap-1.5">
                                {todo.done ? (
                                  <CheckSquare size={11} className="text-emerald-400/70 shrink-0" />
                                ) : (
                                  <Square size={11} className="text-gray-600 shrink-0" />
                                )}
                                <span className={`text-[11px] leading-tight truncate ${todo.done ? 'text-gray-600 line-through' : 'text-gray-400'}`}>
                                  {todo.text}
                                </span>
                              </div>
                            ))}
                            {note.todos.length > 4 && (
                              <span className="text-[10px] text-gray-600 pl-4">+{note.todos.length - 4} 更多…</span>
                            )}
                          </div>
                        )}

                        {/* Tags display */}
                        {note.tags && note.tags.length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap pt-1.5 border-t border-gray-700/30">
                            {note.tags.map((tag, idx) => (
                              <span key={idx} className="inline-flex items-center gap-0.5 px-1.5 py-[1px] bg-indigo-500/10 border border-indigo-500/20 rounded-full text-[10px] text-indigo-300/80 font-medium">
                                <Hash size={8} className="text-indigo-400/50" />
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                  </div>

                  {/* Card Footer - compact */}
                    <div className="px-3 py-2 border-t border-gray-800/30 flex items-center justify-between">
                      <span className="text-[10px] text-gray-600">
                        {format(note.createdAt, 'yyyy/MM/dd', { locale: zhCN })}
                      </span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleTogglePin(note)}
                          className={`p-1 rounded transition-colors ${
                            note.pinned
                              ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10'
                              : 'text-gray-600 hover:text-gray-400 hover:bg-gray-800/50'
                          }`}
                          title={note.pinned ? '取消置顶' : '置顶'}
                        >
                          {note.pinned ? <PinOff size={11} /> : <Pin size={11} />}
                        </button>
                        <button
                          onClick={() => {
                            const noteToEdit = { ...note };
                            if (!noteToEdit.blueprintEntries || noteToEdit.blueprintEntries.length === 0) {
                              noteToEdit.blueprintEntries = getEntries(note);
                            }
                            if (noteToEdit.blueprintEntries.length === 0) {
                              noteToEdit.blueprintEntries = [emptyEntry()];
                            }
                            setEditEntryBpInputs(noteToEdit.blueprintEntries.map(() => ''));
                            setEditingNote(noteToEdit);
                            setIsCreating(false);
                          }}
                          className="p-1 rounded text-gray-600 hover:text-gray-400 hover:bg-gray-800/50 transition-colors"
                          title="编辑"
                        >
                          <Edit3 size={11} />
                        </button>
                      </div>
                    </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-800/50 border border-gray-700/30 flex items-center justify-center mb-4">
              <FileText size={28} className="text-gray-600" />
            </div>
            <h3 className="text-base font-semibold text-gray-400 mb-1">
              {searchQuery || filterCategory || filterTag ? '没有找到匹配的笔记' : '还没有笔记'}
            </h3>
            <p className="text-sm text-gray-600 mb-4 max-w-sm">
              {searchQuery || filterCategory || filterTag
                ? '尝试调整搜索关键词或分类筛选'
                : '在这里记录蓝图负责人、命名规范、设计说明等项目信息'}
            </p>
            {!searchQuery && !filterCategory && !filterTag && (
              <button
                onClick={() => setIsCreating(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-amber-600/80 hover:bg-amber-500/80 text-white text-sm font-medium rounded-lg transition-all shadow-lg shadow-amber-500/15"
              >
                <Plus size={16} />
                创建第一条笔记
              </button>
            )}
          </div>
        )}
      </div>

      {/* Edit Note Modal */}
      {editingNote && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9998]" onClick={() => setEditingNote(null)}>
          <div
            className="bg-gray-900 border border-gray-700/60 rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-800/60 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
                  <Edit3 size={16} className="text-amber-400" />
                </div>
                <span className="text-sm font-semibold text-white">编辑笔记</span>
              </div>
              <button
                onClick={() => setEditingNote(null)}
                className="p-1.5 hover:bg-gray-700/50 rounded-lg text-gray-500 hover:text-gray-300 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4 custom-scrollbar">
              {/* Title */}
              <div>
                <label className="text-xs text-gray-400 mb-1.5 flex items-center gap-1.5 font-medium">
                  <FileText size={12} /> 笔记标题
                </label>
                <input
                  type="text"
                  value={editingNote.title}
                  onChange={(e) => setEditingNote({ ...editingNote, title: e.target.value })}
                  className="w-full px-3 py-2.5 bg-gray-800/60 border border-gray-700/50 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/20 transition-all"
                  autoFocus
                />
              </div>

              {/* Blueprint Entries */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-gray-400 flex items-center gap-1.5 font-medium">
                    <Layers size={12} /> 蓝图信息条目
                    <span className="text-gray-600 text-[10px] font-normal">（可添加多个模块）</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const entries = [...(editingNote.blueprintEntries || []), emptyEntry()];
                      setEditingNote({ ...editingNote, blueprintEntries: entries });
                      setEditEntryBpInputs(prev => [...prev, '']);
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 text-[11px] text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 rounded-lg border border-amber-500/20 transition-colors"
                  >
                    <Plus size={11} />
                    添加模块
                  </button>
                </div>
                {(editingNote.blueprintEntries || []).map((entry, eIdx) => (
                  <div key={eIdx} className="relative bg-gray-800/30 border border-gray-700/40 rounded-lg p-3 space-y-2">
                    {(editingNote.blueprintEntries || []).length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const entries = (editingNote.blueprintEntries || []).filter((_, i) => i !== eIdx);
                          setEditingNote({ ...editingNote, blueprintEntries: entries });
                          setEditEntryBpInputs(prev => prev.filter((_, i) => i !== eIdx));
                        }}
                        className="absolute top-2 right-2 p-1 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
                        title="删除此条目"
                      >
                        <X size={12} />
                      </button>
                    )}
                    <div className="grid grid-cols-3 gap-3">
                      {/* System Module */}
                      <div className="relative">
                        <label className="text-[10px] text-gray-500 mb-1 flex items-center gap-1">
                          <Layers size={9} /> 系统模块
                        </label>
                        <input
                          type="text"
                          value={entry.systemModule}
                          onChange={(e) => {
                            const entries = [...(editingNote.blueprintEntries || [])];
                            entries[eIdx] = { ...entries[eIdx], systemModule: e.target.value };
                            setEditingNote({ ...editingNote, blueprintEntries: entries });
                            setEditModuleSuggestionsIdx(eIdx);
                          }}
                          onFocus={() => setEditModuleSuggestionsIdx(eIdx)}
                          onBlur={() => setTimeout(() => setEditModuleSuggestionsIdx(null), 200)}
                          placeholder="如：背包系统"
                          className="w-full px-2.5 py-2 bg-gray-800/60 border border-gray-700/50 rounded-lg text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500/40 focus:ring-1 focus:ring-purple-500/20 transition-all"
                        />
                        {editModuleSuggestionsIdx === eIdx && getModuleSuggestions(entry.systemModule).length > 0 && (
                          <div className="absolute left-0 right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 max-h-32 overflow-y-auto custom-scrollbar py-1">
                            {getModuleSuggestions(entry.systemModule).map(m => (
                              <button
                                key={m}
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  const entries = [...(editingNote.blueprintEntries || [])];
                                  entries[eIdx] = { ...entries[eIdx], systemModule: m };
                                  setEditingNote({ ...editingNote, blueprintEntries: entries });
                                  setEditModuleSuggestionsIdx(null);
                                }}
                                className="w-full px-3 py-1.5 text-left text-[11px] text-gray-300 hover:text-white hover:bg-gray-700/60 transition-colors"
                              >
                                {m}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Blueprint Names */}
                      <div>
                        <label className="text-[10px] text-gray-500 mb-1 flex items-center gap-1">
                          <Code2 size={9} /> 蓝图命名 <span className="text-gray-600 text-[9px]">（回车添加）</span>
                        </label>
                        <div className="w-full min-h-[36px] px-2 py-1 bg-gray-800/60 border border-gray-700/50 rounded-lg flex flex-wrap items-center gap-1 focus-within:border-cyan-500/40 focus-within:ring-1 focus-within:ring-cyan-500/20 transition-all">
                          {entry.blueprintNames.map((bp, bpIdx) => (
                            <span key={bpIdx} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-cyan-500/15 border border-cyan-500/25 rounded text-[10px] text-cyan-300 font-mono">
                              {bp}
                              <button
                                type="button"
                                onClick={() => {
                                  const entries = [...(editingNote.blueprintEntries || [])];
                                  entries[eIdx] = { ...entries[eIdx], blueprintNames: entries[eIdx].blueprintNames.filter((_, i) => i !== bpIdx) };
                                  setEditingNote({ ...editingNote, blueprintEntries: entries });
                                }}
                                className="ml-0.5 text-cyan-400/60 hover:text-cyan-300 transition-colors"
                              >
                                <X size={8} />
                              </button>
                            </span>
                          ))}
                          <input
                            type="text"
                            value={editEntryBpInputs[eIdx] || ''}
                            onChange={(e) => {
                              const inputs = [...editEntryBpInputs];
                              inputs[eIdx] = e.target.value;
                              setEditEntryBpInputs(inputs);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && (editEntryBpInputs[eIdx] || '').trim()) {
                                e.preventDefault();
                                const entries = [...(editingNote.blueprintEntries || [])];
                                entries[eIdx] = { ...entries[eIdx], blueprintNames: [...entries[eIdx].blueprintNames, editEntryBpInputs[eIdx].trim()] };
                                setEditingNote({ ...editingNote, blueprintEntries: entries });
                                const inputs = [...editEntryBpInputs];
                                inputs[eIdx] = '';
                                setEditEntryBpInputs(inputs);
                              } else if (e.key === 'Backspace' && !(editEntryBpInputs[eIdx] || '') && entry.blueprintNames.length > 0) {
                                const entries = [...(editingNote.blueprintEntries || [])];
                                entries[eIdx] = { ...entries[eIdx], blueprintNames: entries[eIdx].blueprintNames.slice(0, -1) };
                                setEditingNote({ ...editingNote, blueprintEntries: entries });
                              }
                            }}
                            placeholder={entry.blueprintNames.length === 0 ? "如：WBP_Backpack_Main" : "继续添加…"}
                            className="flex-1 min-w-[60px] bg-transparent border-none outline-none text-[10px] text-gray-200 placeholder-gray-600 font-mono py-0.5"
                          />
                        </div>
                      </div>
                      {/* Owner */}
                      <div className="relative">
                        <label className="text-[10px] text-gray-500 mb-1 flex items-center gap-1">
                          <User size={9} /> 负责人
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowEditOwnerDropdownIdx(showEditOwnerDropdownIdx === eIdx ? null : eIdx)}
                          onBlur={() => setTimeout(() => setShowEditOwnerDropdownIdx(null), 200)}
                          className="w-full min-h-[36px] px-2 py-1 bg-gray-800/60 border border-gray-700/50 rounded-lg text-left flex flex-wrap items-center gap-1 focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/20 transition-all"
                        >
                          {entry.ownerIds.length > 0 ? (
                            entry.ownerIds.map(id => {
                              const r = resources.find(res => res.id === id);
                              return r ? (
                                <span key={id} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-500/15 border border-amber-500/25 rounded text-[10px] text-amber-300">
                                  {r.name}
                                  <span
                                    role="button"
                                    onMouseDown={(e) => {
                                      e.preventDefault(); e.stopPropagation();
                                      const entries = [...(editingNote.blueprintEntries || [])];
                                      entries[eIdx] = { ...entries[eIdx], ownerIds: entries[eIdx].ownerIds.filter(oid => oid !== id) };
                                      setEditingNote({ ...editingNote, blueprintEntries: entries });
                                    }}
                                    className="ml-0.5 text-amber-400/60 hover:text-amber-300 cursor-pointer"
                                  >
                                    <X size={8} />
                                  </span>
                                </span>
                              ) : null;
                            })
                          ) : (
                            <span className="text-[10px] text-gray-600">选择成员…</span>
                          )}
                          <ChevronDown size={9} className="ml-auto text-gray-600 shrink-0" />
                        </button>
                        {showEditOwnerDropdownIdx === eIdx && resources.length > 0 && (
                          <div className="absolute left-0 right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 max-h-32 overflow-y-auto custom-scrollbar py-1">
                            {resources.filter(r => r.status !== 'departed').map(r => {
                              const selected = entry.ownerIds.includes(r.id!);
                              return (
                                <button
                                  key={r.id}
                                  type="button"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    const entries = [...(editingNote.blueprintEntries || [])];
                                    if (selected) {
                                      entries[eIdx] = { ...entries[eIdx], ownerIds: entries[eIdx].ownerIds.filter(id => id !== r.id) };
                                    } else {
                                      entries[eIdx] = { ...entries[eIdx], ownerIds: [...entries[eIdx].ownerIds, r.id!] };
                                    }
                                    setEditingNote({ ...editingNote, blueprintEntries: entries });
                                  }}
                                  className={`w-full px-3 py-1.5 text-left text-[11px] flex items-center gap-2 transition-colors ${
                                    selected ? 'text-amber-300 bg-amber-500/10' : 'text-gray-300 hover:text-white hover:bg-gray-700/60'
                                  }`}
                                >
                                  <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[8px] ${
                                    selected ? 'bg-amber-500/30 border-amber-500/50 text-amber-300' : 'border-gray-600'
                                  }`}>
                                    {selected && <Check size={8} />}
                                  </span>
                                  {r.name}
                                  <span className="text-[9px] text-gray-600 ml-auto">{r.role}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Content textarea with Markdown preview */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-gray-400 flex items-center gap-1.5 font-medium">
                    <FileText size={12} /> 备注说明
                    <span className="text-[10px] text-gray-600 font-normal">（支持 Markdown 语法）</span>
                  </label>
                  <div className="flex items-center gap-0.5 bg-gray-800/60 rounded-lg p-0.5 border border-gray-700/40">
                    <button
                      type="button"
                      onClick={() => setEditPreviewMode('edit')}
                      className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                        editPreviewMode === 'edit'
                          ? 'bg-gray-700/80 text-white shadow-sm'
                          : 'text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      <Pencil size={10} />
                      编辑
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditPreviewMode('preview')}
                      className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                        editPreviewMode === 'preview'
                          ? 'bg-gray-700/80 text-white shadow-sm'
                          : 'text-gray-500 hover:text-gray-300'
                      }`}
                    >
                      <Eye size={10} />
                      预览
                    </button>
                  </div>
                </div>
                {editPreviewMode === 'edit' ? (
                  <textarea
                    value={editingNote.content}
                    onChange={(e) => setEditingNote({ ...editingNote, content: e.target.value })}
                    rows={6}
                    placeholder="支持 Markdown 语法：# 标题、**加粗**、- 列表、`代码`…"
                    className="w-full px-3 py-2.5 bg-gray-800/60 border border-gray-700/50 rounded-lg text-sm text-gray-300 font-mono focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/20 transition-all resize-none leading-relaxed"
                  />
                ) : (
                  <div className="w-full min-h-[156px] max-h-[300px] overflow-y-auto px-3 py-2.5 bg-gray-800/60 border border-gray-700/50 rounded-lg custom-scrollbar prose prose-invert prose-sm prose-p:my-1.5 prose-headings:my-2 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-code:text-cyan-300 prose-code:bg-cyan-500/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-pre:bg-gray-900/80 prose-pre:border prose-pre:border-gray-700/50 prose-pre:rounded-lg prose-a:text-amber-400 prose-strong:text-gray-200 prose-blockquote:border-amber-500/40 prose-blockquote:text-gray-400 max-w-none">
                    {editingNote.content ? (
                      <ReactMarkdown remarkPlugins={[remarkBreaks]}>{editingNote.content}</ReactMarkdown>
                    ) : (
                      <p className="text-sm text-gray-600 italic">暂无内容，切换到编辑模式输入…</p>
                    )}
                  </div>
                )}
              </div>

              {/* Todo / Checklist items */}
              <div>
                <label className="text-xs text-gray-400 mb-2 flex items-center gap-1.5 font-medium">
                  <ListTodo size={12} /> 待办事项
                </label>
                <div className="space-y-1.5 mb-2">
                  {(editingNote.todos || []).map((todo) => (
                    <div key={todo.id} className="flex items-center gap-2 group/todo">
                      <button
                        type="button"
                        onClick={() => {
                          const todos = (editingNote.todos || []).map(t =>
                            t.id === todo.id ? { ...t, done: !t.done } : t
                          );
                          setEditingNote({ ...editingNote, todos });
                        }}
                        className="shrink-0"
                      >
                        {todo.done ? (
                          <CheckSquare size={14} className="text-emerald-400" />
                        ) : (
                          <Square size={14} className="text-gray-500 hover:text-gray-300" />
                        )}
                      </button>
                      <span className={`flex-1 text-sm ${todo.done ? 'text-gray-600 line-through' : 'text-gray-300'}`}>
                        {todo.text}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const todos = (editingNote.todos || []).filter(t => t.id !== todo.id);
                          setEditingNote({ ...editingNote, todos });
                        }}
                        className="opacity-0 group-hover/todo:opacity-100 p-0.5 text-gray-600 hover:text-red-400 transition-all"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editTodoInput}
                    onChange={(e) => setEditTodoInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && editTodoInput.trim()) {
                        e.preventDefault();
                        const newTodo: TodoItem = { id: Date.now().toString(), text: editTodoInput.trim(), done: false };
                        setEditingNote({ ...editingNote, todos: [...(editingNote.todos || []), newTodo] });
                        setEditTodoInput('');
                      }
                    }}
                    placeholder="输入待办事项，按 Enter 添加…"
                    className="flex-1 px-3 py-1.5 bg-gray-800/60 border border-gray-700/50 rounded-lg text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/20 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (editTodoInput.trim()) {
                        const newTodo: TodoItem = { id: Date.now().toString(), text: editTodoInput.trim(), done: false };
                        setEditingNote({ ...editingNote, todos: [...(editingNote.todos || []), newTodo] });
                        setEditTodoInput('');
                      }
                    }}
                    className="p-1.5 bg-gray-800/60 border border-gray-700/50 rounded-lg text-gray-500 hover:text-emerald-400 hover:border-emerald-500/40 transition-all"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="text-xs text-gray-400 mb-2 flex items-center gap-1.5 font-medium">
                  <Hash size={12} /> 标签
                </label>
                <div className="flex items-center gap-1.5 flex-wrap mb-2">
                  {(editingNote.tags || []).map((tag, idx) => (
                    <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-[11px] text-indigo-300 font-medium">
                      #{tag}
                      <button
                        type="button"
                        onClick={() => {
                          const tags = (editingNote.tags || []).filter((_, i) => i !== idx);
                          setEditingNote({ ...editingNote, tags });
                        }}
                        className="text-indigo-400/60 hover:text-red-400 transition-colors"
                      >
                        <X size={10} />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editTagInput}
                    onChange={(e) => setEditTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && editTagInput.trim()) {
                        e.preventDefault();
                        const tag = editTagInput.trim().replace(/^#/, '');
                        if (tag && !(editingNote.tags || []).includes(tag)) {
                          setEditingNote({ ...editingNote, tags: [...(editingNote.tags || []), tag] });
                        }
                        setEditTagInput('');
                      }
                    }}
                    placeholder="输入标签名，按 Enter 添加…"
                    className="flex-1 px-3 py-1.5 bg-gray-800/60 border border-gray-700/50 rounded-lg text-sm text-gray-300 placeholder-gray-600 focus:outline-none focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/20 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (editTagInput.trim()) {
                        const tag = editTagInput.trim().replace(/^#/, '');
                        if (tag && !(editingNote.tags || []).includes(tag)) {
                          setEditingNote({ ...editingNote, tags: [...(editingNote.tags || []), tag] });
                        }
                        setEditTagInput('');
                      }
                    }}
                    className="p-1.5 bg-gray-800/60 border border-gray-700/50 rounded-lg text-gray-500 hover:text-indigo-400 hover:border-indigo-500/40 transition-all"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>

              {/* Category selection */}
              <div>
                <label className="text-xs text-gray-400 mb-2 flex items-center gap-1.5 font-medium">
                  <Tag size={12} /> 笔记分类
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {CATEGORIES.filter(c => c.value).map(cat => (
                    <button
                      key={cat.value}
                      onClick={() => setEditingNote({ ...editingNote, category: cat.value })}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg transition-all border ${
                        editingNote.category === cat.value
                          ? `${cat.bg} ${cat.color} ${cat.border} shadow-sm ring-1 ring-current/20`
                          : 'text-gray-600 border-gray-700/40 hover:text-gray-300 hover:bg-gray-800/60 hover:border-gray-600/50'
                      }`}
                    >
                      <span className="text-[13px]">{cat.icon}</span>
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-800/60 flex items-center justify-end gap-2.5 shrink-0">
              <button
                onClick={() => setEditingNote(null)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleUpdate}
                className="flex items-center gap-1.5 px-5 py-2 bg-amber-600/80 hover:bg-amber-500/80 text-white text-sm font-medium rounded-lg transition-all shadow-lg shadow-amber-500/15"
              >
                <Save size={14} />
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm !== null && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[9999]">
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center">
                <AlertTriangle size={20} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">确认删除</h3>
                <p className="text-xs text-gray-500 mt-0.5">此操作不可撤销</p>
              </div>
            </div>
            <p className="text-sm text-gray-400 mb-5">
              确定要删除这条笔记吗？删除后将无法恢复。
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => handleDelete(showDeleteConfirm)}
                className="px-4 py-2 bg-red-600/80 hover:bg-red-500/80 text-white text-sm font-medium rounded-lg transition-all"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
