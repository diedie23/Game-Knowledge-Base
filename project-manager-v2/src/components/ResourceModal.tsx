import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useStore } from '../store/useStore';
import { db, Resource } from '../db/db';
import { trackedDb } from '../store/useHistoryStore';
import { X, User, Building2, Users2, Calendar as CalendarIcon, UserX, Plus, ChevronDown } from 'lucide-react';
import { Avatar } from './common/Avatar';
import type { ResourceType, AvatarStyle } from '../types/resource';
import { AVATAR_STYLES } from '../types/resource';
import { useLiveQuery } from 'dexie-react-hooks';

/** Default preset groups */
const PRESET_GROUPS = ['2D Avatar', '轻舟编辑器', 'UGC小游戏', '元梦之星'];

/** Project Group Selector with custom input support */
function ProjectGroupSelector({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Get all existing groups from database
  const allResources = useLiveQuery(() => db.resources.toArray());
  const existingGroups = useMemo(() => {
    if (!allResources) return PRESET_GROUPS;
    const dbGroups = new Set<string>();
    allResources.forEach(r => {
      if (r.group) dbGroups.add(r.group);
    });
    // Merge preset groups with database groups, deduplicate
    const merged = new Set([...PRESET_GROUPS, ...dbGroups]);
    return Array.from(merged).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }, [allResources]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsAdding(false);
        setNewGroupName('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus input when entering add mode
  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAdding]);

  const handleAddGroup = () => {
    const trimmed = newGroupName.trim();
    if (trimmed) {
      onChange(trimmed);
      setNewGroupName('');
      setIsAdding(false);
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">项目组</label>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-[#11111b] border border-gray-700/50 rounded-lg px-3.5 py-2.5 text-sm text-left flex items-center justify-between focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
      >
        <span className={value ? 'text-gray-200' : 'text-gray-500'}>{value || '未分组'}</span>
        <ChevronDown size={14} className={`text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-[#1e1e2e] border border-gray-700/60 rounded-lg shadow-xl overflow-hidden">
          <div className="max-h-48 overflow-y-auto custom-scrollbar">
            {/* "未分组" option */}
            <button
              type="button"
              onClick={() => { onChange(''); setIsOpen(false); }}
              className={`w-full px-3.5 py-2 text-left text-sm transition-colors ${
                !value ? 'bg-indigo-500/15 text-indigo-300' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
              }`}
            >
              未分组
            </button>
            {/* Existing groups */}
            {existingGroups.map(group => (
              <button
                key={group}
                type="button"
                onClick={() => { onChange(group); setIsOpen(false); }}
                className={`w-full px-3.5 py-2 text-left text-sm transition-colors ${
                  value === group ? 'bg-indigo-500/15 text-indigo-300' : 'text-gray-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                {group}
              </button>
            ))}
          </div>
          {/* Add new group */}
          <div className="border-t border-gray-700/50 p-2">
            {isAdding ? (
              <div className="flex items-center gap-1.5">
                <input
                  ref={inputRef}
                  type="text"
                  value={newGroupName}
                  onChange={e => setNewGroupName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); handleAddGroup(); }
                    if (e.key === 'Escape') { setIsAdding(false); setNewGroupName(''); }
                  }}
                  placeholder="输入新分组名称..."
                  className="flex-1 bg-[#11111b] border border-gray-600/50 rounded-md px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-indigo-500 transition-all"
                />
                <button
                  type="button"
                  onClick={handleAddGroup}
                  disabled={!newGroupName.trim()}
                  className="px-2 py-1.5 text-xs font-medium text-indigo-300 bg-indigo-500/15 hover:bg-indigo-500/25 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  确定
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsAdding(true)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-gray-400 hover:text-indigo-300 hover:bg-indigo-500/10 rounded-md transition-colors"
              >
                <Plus size={12} />
                新增分组
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function ResourceModal() {
  const { isResourceModalOpen, closeResourceModal, editingResourceId } = useStore();
  
  const [formData, setFormData] = useState<Partial<Resource>>({
    name: '',
    role: '',
    avatar: '',
    type: 'internal',
    avatarStyle: 'rounded',
    leaveDates: [],
  });

  useEffect(() => {
    if (editingResourceId) {
      db.resources.get(editingResourceId).then(resource => {
        if (resource) setFormData({ ...resource, type: resource.type || 'internal', leaveDates: resource.leaveDates || [] });
      });
    } else {
      setFormData({
        name: '',
        role: '',
        avatar: '',
        type: 'internal',
        avatarStyle: 'rounded',
        leaveDates: [],
      });
    }
  }, [editingResourceId, isResourceModalOpen]);

  if (!isResourceModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingResourceId) {
      await trackedDb.resources.update(editingResourceId, formData, '编辑成员信息');
    } else {
      await trackedDb.resources.add(formData as Resource, `新建成员「${formData.name}」`);
    }
    closeResourceModal();
  };

  // Generate initials for avatar preview
  const getInitials = (name: string) => {
    if (!name) return '?';
    return name.length > 2 ? name.substring(name.length - 2) : name;
  };

  const typeOptions: { value: ResourceType; label: string; icon: React.ReactNode; desc: string; color: string }[] = [
    { value: 'internal', label: '内部成员', icon: <User size={14} />, desc: '项目组内部人员', color: 'indigo' },
    { value: 'cp', label: 'CP外包', icon: <Building2 size={14} />, desc: '外部合作方人员', color: 'emerald' },
  ];

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xl flex items-center justify-center z-[200] p-4">
      <div className="bg-[#1e1e2e]/95 backdrop-blur-xl border border-white/10 rounded-xl w-full max-w-md shadow-2xl shadow-black/50 overflow-hidden">
        <div className="flex justify-between items-center p-5 border-b border-white/[0.06] bg-[#181825]/80 backdrop-blur-sm">
          <h2 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
            <Users2 size={18} className="text-indigo-400" />
            {editingResourceId ? '编辑人员' : '添加人员'}
          </h2>
          <button onClick={closeResourceModal} className="text-gray-400 hover:text-white transition-all duration-200 p-1.5 hover:bg-white/[0.06] rounded-lg hover:-translate-y-0.5">
            <X size={18} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Avatar preview + Name row */}
          <div className="flex items-start gap-4">
            {/* Avatar preview */}
            <div className="shrink-0">
              <Avatar
                name={formData.name || '?'}
                size="lg"
                type={(formData.type as 'internal' | 'cp') || 'internal'}
                avatar={formData.avatar || undefined}
                avatarStyle={(formData.avatarStyle as AvatarStyle) || 'rounded'}
              />
            </div>

            <div className="flex-1 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">姓名</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-[#11111b] border border-gray-700/50 rounded-lg px-3.5 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                  placeholder="输入人员姓名..."
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">
                  {formData.type === 'cp' ? '外包模块' : '角色/职位'}
                </label>
                <select
                  required
                  value={formData.role}
                  onChange={e => setFormData({ ...formData, role: e.target.value })}
                  className="w-full bg-[#11111b] border border-gray-700/50 rounded-lg px-3.5 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all appearance-none cursor-pointer [color-scheme:dark]"
                >
                  {formData.type === 'cp' ? (
                    <>
                      <option value="" className="bg-gray-900 text-gray-500">请选择外包模块...</option>
                      <optgroup label="── 美术外包 ──" className="bg-gray-900">
                        <option value="CP-角色原画" className="bg-gray-900">角色原画</option>
                        <option value="CP-场景原画" className="bg-gray-900">场景原画</option>
                        <option value="CP-角色模型" className="bg-gray-900">角色模型</option>
                        <option value="CP-场景模型" className="bg-gray-900">场景模型</option>
                        <option value="CP-动作" className="bg-gray-900">动作</option>
                        <option value="CP-特效" className="bg-gray-900">特效</option>
                        <option value="CP-UI设计" className="bg-gray-900">UI设计</option>
                        <option value="CP-动效" className="bg-gray-900">动效</option>
                      </optgroup>
                      <optgroup label="── 技术外包 ──" className="bg-gray-900">
                        <option value="CP-蓝图制作" className="bg-gray-900">蓝图制作</option>
                        <option value="CP-开发" className="bg-gray-900">开发</option>
                      </optgroup>
                      <optgroup label="── 其他外包 ──" className="bg-gray-900">
                        <option value="CP-音频" className="bg-gray-900">音频</option>
                      </optgroup>
                    </>
                  ) : (
                    <>
                      <option value="" className="bg-gray-900 text-gray-500">请选择岗位...</option>
                      <optgroup label="── 设计 ──" className="bg-gray-900">
                        <option value="UX设计" className="bg-gray-900">UX设计（交互设计师）</option>
                        <option value="UI设计" className="bg-gray-900">UI设计（视觉设计师）</option>
                        <option value="Layout" className="bg-gray-900">Layout（排版）</option>
                        <option value="动效" className="bg-gray-900">动效设计</option>
                      </optgroup>
                      <optgroup label="── 美术 ──" className="bg-gray-900">
                        <option value="角色原画" className="bg-gray-900">角色原画</option>
                        <option value="场景原画" className="bg-gray-900">场景原画</option>
                        <option value="角色模型" className="bg-gray-900">角色模型</option>
                        <option value="场景模型" className="bg-gray-900">场景模型</option>
                        <option value="动作" className="bg-gray-900">动作</option>
                        <option value="特效" className="bg-gray-900">特效</option>
                      </optgroup>
                      <optgroup label="── 技术 ──" className="bg-gray-900">
                        <option value="正式蓝图" className="bg-gray-900">蓝图制作</option>
                        <option value="开发" className="bg-gray-900">开发工程师</option>
                        <option value="测试" className="bg-gray-900">测试工程师</option>
                      </optgroup>
                      <optgroup label="── 其他 ──" className="bg-gray-900">
                        <option value="产品" className="bg-gray-900">产品/策划</option>
                        <option value="音频" className="bg-gray-900">音频</option>
                      </optgroup>
                    </>
                  )}
                </select>
              </div>
            </div>
          </div>

          {/* Project Group selector with custom input (internal members only) */}
          {formData.type !== 'cp' && (
            <ProjectGroupSelector
              value={formData.group || ''}
              onChange={(val) => setFormData({ ...formData, group: val || undefined })}
            />
          )}

          {/* Type selector */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">人员类型</label>
            <div className="grid grid-cols-2 gap-2.5">
              {typeOptions.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, type: opt.value, role: '' })}
                  className={`flex items-center gap-2.5 px-3.5 py-3 rounded-lg border text-left transition-all ${
                    formData.type === opt.value
                      ? opt.color === 'emerald'
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 ring-1 ring-emerald-500/20'
                        : 'bg-indigo-500/10 border-indigo-500/40 text-indigo-300 ring-1 ring-indigo-500/20'
                      : 'bg-[#11111b] border-gray-700/50 text-gray-400 hover:border-gray-600 hover:text-gray-300 hover:-translate-y-0.5'
                  }`}
                >
                  <span className={formData.type === opt.value 
                    ? (opt.color === 'emerald' ? 'text-emerald-400' : 'text-indigo-400')
                    : 'text-gray-500'
                  }>
                    {opt.icon}
                  </span>
                  <div>
                    <div className="text-sm font-medium">{opt.label}</div>
                    <div className="text-[10px] text-gray-500">{opt.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Status selector */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">当前状态</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'active', label: '正常', icon: '', activeClass: 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 ring-1 ring-emerald-500/20' },
                { value: 'wfh', label: '居家', icon: '🏠', activeClass: 'bg-blue-500/10 border-blue-500/40 text-blue-300 ring-1 ring-blue-500/20' },
                { value: 'sick', label: '欠佳', icon: '🤒', activeClass: 'bg-orange-500/10 border-orange-500/40 text-orange-300 ring-1 ring-orange-500/20' },
                { value: 'leave', label: '休假', icon: '📅', activeClass: 'bg-purple-500/10 border-purple-500/40 text-purple-300 ring-1 ring-purple-500/20' },
                { value: 'focus', label: '专注', icon: '🔥', activeClass: 'bg-red-500/10 border-red-500/40 text-red-300 ring-1 ring-red-500/20' },
                { value: 'departed', label: '已离职', icon: '👋', activeClass: 'bg-gray-500/15 border-gray-500/40 text-gray-300 ring-1 ring-gray-500/20' }
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    const updates: Partial<Resource> = { status: opt.value as any };
                    // Auto-set departDate when switching to departed
                    if (opt.value === 'departed' && !formData.departDate) {
                      const today = new Date();
                      updates.departDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
                    }
                    setFormData({ ...formData, ...updates });
                  }}
                  className={`flex flex-col items-center justify-center gap-1 px-2 py-2 rounded-lg border transition-all ${
                    (formData.status || 'active') === opt.value
                      ? opt.activeClass
                      : 'bg-[#11111b] border-gray-700/50 text-gray-400 hover:border-gray-600 hover:text-gray-300 hover:-translate-y-0.5'
                  }`}
                  title={opt.label}
                >
                  {opt.icon && <span className="text-base">{opt.icon}</span>}
                  <span className="text-[10px] font-medium">{opt.label}</span>
                </button>
              ))}
            </div>
            {formData.status === 'departed' && (
              <p className="text-[10px] text-gray-500 mt-2 flex items-center gap-1">
                <UserX size={10} className="text-gray-500" />
                已离职成员不会出现在任务分配选项中，但历史记录保留
              </p>
            )}
          </div>

          {/* Leave Dates Input (only show when status is leave) */}
          {formData.status === 'leave' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider">休假日期</label>
                {formData.leaveDates && formData.leaveDates.length > 0 && (
                  <span className="text-[10px] text-purple-400 font-medium bg-purple-500/10 px-2 py-0.5 rounded-full">
                    共 {formData.leaveDates.length} 天
                  </span>
                )}
              </div>
              <div className="relative">
                <input
                  type="date"
                  onClick={(e) => {
                    try {
                      if ('showPicker' in HTMLInputElement.prototype) {
                        e.currentTarget.showPicker();
                      }
                    } catch (err) {
                      // Ignore
                    }
                  }}
                  onChange={e => {
                    const date = e.target.value;
                    if (date && !formData.leaveDates?.includes(date)) {
                      setFormData({ 
                        ...formData, 
                        leaveDates: [...(formData.leaveDates || []), date].sort() 
                      });
                    }
                    // Reset input after selection
                    setTimeout(() => {
                      e.target.value = '';
                    }, 0);
                  }}
                  className="w-full bg-[#11111b] border border-purple-500/30 rounded-lg px-3.5 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all cursor-pointer [color-scheme:dark]"
                />
              </div>
              
              {/* Selected Dates - grouped into ranges for compact display */}
              {formData.leaveDates && formData.leaveDates.length > 0 && (
                <div className="mt-3 max-h-[120px] overflow-y-auto custom-scrollbar">
                  <div className="flex flex-wrap gap-1.5">
                    {(() => {
                      // Group consecutive dates into ranges
                      const sorted = [...formData.leaveDates].sort();
                      const ranges: { start: string; end: string; dates: string[] }[] = [];
                      let currentRange: { start: string; end: string; dates: string[] } | null = null;

                      sorted.forEach(date => {
                        if (!currentRange) {
                          currentRange = { start: date, end: date, dates: [date] };
                        } else {
                          // Check if date is consecutive (next day)
                          const prevDate = new Date(currentRange.end);
                          const currDate = new Date(date);
                          const diffDays = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
                          if (diffDays === 1) {
                            currentRange.end = date;
                            currentRange.dates.push(date);
                          } else {
                            ranges.push(currentRange);
                            currentRange = { start: date, end: date, dates: [date] };
                          }
                        }
                      });
                      if (currentRange) ranges.push(currentRange);

                      return ranges.map((range, idx) => {
                        const formatShort = (d: string) => {
                          const [, m, day] = d.split('-');
                          return `${m}/${day}`;
                        };
                        const isRange = range.dates.length > 1;
                        const label = isRange
                          ? `${formatShort(range.start)} - ${formatShort(range.end)} (${range.dates.length}天)`
                          : formatShort(range.start);

                        return (
                          <div
                            key={idx}
                            className={`flex items-center gap-1 border text-xs rounded-md px-2 py-1 ${
                              isRange
                                ? 'bg-purple-500/15 border-purple-500/40 text-purple-200'
                                : 'bg-purple-500/10 border-purple-500/30 text-purple-300'
                            }`}
                          >
                            <span className="whitespace-nowrap">{label}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setFormData({
                                  ...formData,
                                  leaveDates: formData.leaveDates?.filter(d => !range.dates.includes(d))
                                });
                              }}
                              className="hover:text-white hover:bg-purple-500/20 rounded-full p-0.5 transition-colors ml-0.5 shrink-0"
                              title={isRange ? `删除 ${range.dates.length} 天` : '删除'}
                            >
                              <X size={11} />
                            </button>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}
              <p className="text-[10px] text-gray-500 mt-2">选择的日期将在资源负载矩阵中标记为休假</p>
            </div>
          )}

          {/* Join / Depart Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">入职日期</label>
              <input
                type="date"
                value={formData.joinDate || ''}
                onClick={(e) => {
                  try {
                    if ('showPicker' in HTMLInputElement.prototype) {
                      e.currentTarget.showPicker();
                    }
                  } catch (err) { /* Ignore */ }
                }}
                onChange={e => setFormData({ ...formData, joinDate: e.target.value || undefined })}
                className="w-full bg-[#11111b] border border-gray-700/50 rounded-lg px-3.5 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all cursor-pointer [color-scheme:dark]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">离职日期</label>
              <input
                type="date"
                value={formData.departDate || ''}
                onClick={(e) => {
                  try {
                    if ('showPicker' in HTMLInputElement.prototype) {
                      e.currentTarget.showPicker();
                    }
                  } catch (err) { /* Ignore */ }
                }}
                onChange={e => setFormData({ ...formData, departDate: e.target.value || undefined })}
                className={`w-full bg-[#11111b] border rounded-lg px-3.5 py-2.5 text-sm text-gray-200 focus:outline-none transition-all cursor-pointer [color-scheme:dark] ${
                  formData.status === 'departed'
                    ? 'border-gray-500/50 focus:border-gray-400 focus:ring-1 focus:ring-gray-400/30'
                    : 'border-gray-700/50 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500'
                }`}
              />
            </div>
          </div>

          {/* Avatar style selector */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">头像样式</label>
            <div className="flex gap-2">
              {AVATAR_STYLES.map(style => (
                <button
                  key={style.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, avatarStyle: style.value })}
                  className={`flex flex-col items-center gap-1.5 px-2.5 py-2 rounded-lg border transition-all ${
                    formData.avatarStyle === style.value
                      ? 'bg-indigo-500/10 border-indigo-500/40 ring-1 ring-indigo-500/20'
                      : 'bg-[#11111b] border-gray-700/50 hover:border-gray-600 hover:-translate-y-0.5'
                  }`}
                >
                  <Avatar
                    name={formData.name || '?'}
                    size="sm"
                    type={(formData.type as 'internal' | 'cp') || 'internal'}
                    avatarStyle={style.value}
                  />
                  <span className={`text-[9px] font-medium ${
                    formData.avatarStyle === style.value ? 'text-indigo-300' : 'text-gray-500'
                  }`}>{style.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">TAPD 账号 (可选)</label>
            <input
              type="text"
              value={formData.tapdAccount || ''}
              onChange={e => setFormData({ ...formData, tapdAccount: e.target.value })}
              className="w-full bg-[#11111b] border border-gray-700/50 rounded-lg px-3.5 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
              placeholder="TAPD英文账号ID，如 eugenejin"
            />
            <p className="text-[10px] text-gray-500 mt-1">用于TAPD同步时自动匹配处理人，填写TAPD上显示的英文账号名</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">头像 URL (可选)</label>
            <input
              type="url"
              value={formData.avatar || ''}
              onChange={e => setFormData({ ...formData, avatar: e.target.value })}
              className="w-full bg-[#11111b] border border-gray-700/50 rounded-lg px-3.5 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
              placeholder="https://example.com/avatar.png"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-white/[0.06] mt-6">
            <button
              type="button"
              onClick={closeResourceModal}
              className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white bg-gray-800/50 hover:bg-gray-700 rounded-lg transition-all duration-200 hover:-translate-y-0.5"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-all duration-200 shadow-lg shadow-indigo-500/20 hover:-translate-y-0.5 hover:shadow-indigo-500/30"
            >
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}