import React, { useState, useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { db, Task } from '../db/db';
import { trackedDb } from '../store/useHistoryStore';
import { X, Code2, Zap, Sparkles, Brain, Star, TrendingUp, Clock, CheckCircle2, Loader2, ChevronDown, ChevronUp, ExternalLink, Link2, AlertTriangle, Building2, User } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { format, parseISO, addDays } from 'date-fns';
import { defaultTemplates } from '../db/templates';
import { smartAssignService, RecommendationScore } from '../services/smartAssignService';
import { inferPipelineDependencies, PIPELINE_STAGES } from './gantt/constants';
import { compareResources, getRoleOrderIndex } from './gantt/constants';
import { calcMemberWorkload, calcParentDateRange, syncParentDateRange, checkDependencyConflicts, type WorkloadInfo, type DependencyConflict } from '../services/workloadService';
import { getEffectiveStatus } from '../types/resource';
import type { TaskPriority } from '../types/enums';
import { confirmDialog, alertDialog } from './common/ConfirmDialog';
import { toast } from '../store/useToastStore';

// ─── Shared paste parsing logic ──────────────────────────────────
// Extracted from duplicate onPaste handlers in title input and URL input.
const URL_REGEX = /(https?:\/\/[^\s\u3000\uff0c\u3001\uff1b\uff09\u300b\u3011]+)/g;
const DATE_REGEX = /20\d{2}[-/]\d{1,2}[-/]\d{1,2}/g;

interface PasteParseResult {
  urls: string[];
  priority: TaskPriority | undefined;
  startDate: Date | undefined;
  endDate: Date | undefined;
  subTasksToSelect: number[];
  cleanTitle: string;
}

function parsePastedText(
  pasted: string,
  currentStartDate: Date | undefined,
  currentEndDate: Date | undefined,
): PasteParseResult {
  const urls = pasted.match(URL_REGEX) || [];

  // Parse priority: P0/P1/P2/P3, Chinese keywords, TAPD formats
  let priority: TaskPriority | undefined = undefined;
  if (/优先级[:：]\s*(高|紧急|High|Urgent)/i.test(pasted) || /【高】|\[高\]/.test(pasted) || /\bP0\b|\bP1\b/i.test(pasted) || /紧急/.test(pasted)) priority = 'high';
  else if (/优先级[:：]\s*(中|Medium|Middle)/i.test(pasted) || /【中】|\[中\]/.test(pasted) || /\bP2\b/i.test(pasted)) priority = 'medium';
  else if (/优先级[:：]\s*(低|Low|Nice)/i.test(pasted) || /【低】|\[低\]/.test(pasted) || /\bP3\b|\bP4\b/i.test(pasted)) priority = 'low';

  // Parse dates (e.g. 2026-04-22 ~ 2026-04-30)
  let startDate: Date | undefined = currentStartDate;
  let endDate: Date | undefined = currentEndDate;
  const dates = pasted.match(DATE_REGEX);
  if (dates && dates.length >= 2) {
    startDate = parseISO(dates[0].replace(/\//g, '-'));
    endDate = parseISO(dates[dates.length - 1].replace(/\//g, '-'));
  } else if (dates && dates.length === 1) {
    startDate = parseISO(dates[0].replace(/\//g, '-'));
    endDate = startDate;
  }

  // Parse sub-task hints (交互, 视觉, layout)
  const subTasksToSelect: number[] = [];
  if (/交互/i.test(pasted)) subTasksToSelect.push(0);
  if (/视觉|UI/i.test(pasted)) subTasksToSelect.push(1);
  if (/layout|前端|开发/i.test(pasted)) subTasksToSelect.push(2);

  // Clean title: strip URLs and normalize whitespace
  let cleanTitle = pasted
    .replace(URL_REGEX, '')
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!cleanTitle && urls.length > 0) {
    const tapdMatch = urls[0]?.match(/tapd\.cn\/\d+\/(?:prong\/)?(?:stories|bugs|tasks)\/view\/(\d+)/);
    cleanTitle = tapdMatch ? `TAPD#${tapdMatch[1]}` : '';
  }

  return { urls, priority, startDate, endDate, subTasksToSelect, cleanTitle };
}

export function TaskModal() {
  const { isTaskModalOpen, closeTaskModal, editingTaskId, setHighlightedTaskIds, toggleTaskExpansion } = useStore();
  const resources = useLiveQuery(() => db.resources.toArray());
  const allTasks = useLiveQuery(() => db.tasks.toArray());
  
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedSubTaskIndices, setSelectedSubTaskIndices] = useState<number[]>([]);
  // Per-subtask assignee overrides: index -> resourceId[]
  const [subTaskAssignees, setSubTaskAssignees] = useState<Record<number, number[]>>({});
  // Per-subtask internal contact for CP assignees: index -> resourceId
  const [subTaskInternalContacts, setSubTaskInternalContacts] = useState<Record<number, number>>({});
  // Per-subtask date overrides: index -> { startDate?, endDate? }
  const [subTaskDateOverrides, setSubTaskDateOverrides] = useState<Record<number, { startDate?: string; endDate?: string }>>({});
  // Per-subtask workload warnings: index -> WorkloadInfo
  const [subTaskWorkloadWarnings, setSubTaskWorkloadWarnings] = useState<Record<number, WorkloadInfo>>({});
  const [recommendations, setRecommendations] = useState<RecommendationScore[]>([]);
  const [isRecommending, setIsRecommending] = useState(false);
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [formData, setFormData] = useState<Partial<Task>>({
    title: '',
    description: '',
    status: 'todo',
    priority: '' as any,
    startDate: undefined,
    endDate: undefined,
    progress: 0,
    dependencies: [],
    type: 'task',
    projectId: 1,
  });

  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  // Workload warnings: resourceId -> WorkloadInfo
  const [workloadWarnings, setWorkloadWarnings] = useState<Map<number, WorkloadInfo>>(new Map());
  // Dependency conflict warnings
  const [depConflicts, setDepConflicts] = useState<DependencyConflict[]>([]);
  // Smart title suggestions (now stores full task objects for assignee info)
  const [titleSuggestions, setTitleSuggestions] = useState<{ title: string; assigneeIds?: number[] }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [recommendedTemplateId, setRecommendedTemplateId] = useState<string | null>(null);
  // Sub-task upstream/downstream dependency date errors: index -> error message
  const [subTaskDepErrors, setSubTaskDepErrors] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!isTaskModalOpen) return; // Only reset when modal opens, not when it closes
    if (editingTaskId) {
      db.tasks.get(editingTaskId).then(async (task) => {
        if (task) {
          // If this task has children, auto-calc date range from children
          const children = await db.tasks.where('parentId').equals(editingTaskId).toArray();
          if (children.length > 0) {
            const { startDate, endDate } = calcParentDateRange(children);
            setFormData({
              ...task,
              startDate: startDate || task.startDate,
              endDate: endDate || task.endDate,
            });
          } else {
            setFormData(task);
          }
        }
      });
      setSelectedTemplateId(null);
    } else {
      setFormData({
        title: '',
        description: '',
        status: 'todo',
        priority: '' as any,
        startDate: undefined,
        endDate: undefined,
        progress: 0,
        dependencies: [],
        assigneeIds: [],
        type: 'task',
        projectId: 1,
        externalUrl: '',
      });
      setSelectedTemplateId(null);
      setSelectedSubTaskIndices([]);
    }
  }, [editingTaskId, isTaskModalOpen]);

  useEffect(() => {
    if (selectedTemplateId) {
      const template = defaultTemplates.find(t => t.id === selectedTemplateId);
      if (template) {
        setSelectedSubTaskIndices(template.subTasks.map((_, i) => i));
        setSubTaskDateOverrides({});
        setSubTaskWorkloadWarnings({});
        // Auto-assign based on roleRequired matching
        const autoAssignees: Record<number, number[]> = {};
        template.subTasks.forEach((sub, idx) => {
          const matching = resources?.filter(r => r.role === sub.roleRequired) || [];
          if (matching.length > 0) {
            autoAssignees[idx] = [matching[0].id!];
          }
        });
        setSubTaskAssignees(autoAssignees);
        setSubTaskInternalContacts({});
      }
    } else {
      setSelectedSubTaskIndices([]);
      setSubTaskAssignees({});
      setSubTaskDateOverrides({});
      setSubTaskWorkloadWarnings({});
      setSubTaskInternalContacts({});
    }
  }, [selectedTemplateId, resources]);
  // Auto-calculate workload warnings when assignees or dates change
  useEffect(() => {
    if (!allTasks || !resources) return;
    const assigneeIds = formData.assigneeIds || [];
    if (assigneeIds.length === 0 || (!formData.startDate && !formData.endDate)) {
      setWorkloadWarnings(new Map());
      return;
    }
    const newWarnings = new Map<number, WorkloadInfo>();
    for (const rid of assigneeIds) {
      const info = calcMemberWorkload(
        rid,
        formData.startDate,
        formData.endDate,
        allTasks,
        resources,
        editingTaskId || undefined
      );
      if (info.overlappingTaskCount > 0) {
        newWarnings.set(rid, info);
      }
    }
    setWorkloadWarnings(newWarnings);
  }, [formData.assigneeIds, formData.startDate, formData.endDate, allTasks, resources, editingTaskId]);

  // Auto-check dependency conflicts when dates or dependencies change
  useEffect(() => {
    if (!allTasks) {
      setDepConflicts([]);
      return;
    }
    const conflicts = checkDependencyConflicts(
      editingTaskId || -1, // Use -1 or a dummy ID for new tasks
      formData.startDate,
      formData.dependencies || [],
      allTasks
    );
    setDepConflicts(conflicts);
  }, [formData.startDate, formData.dependencies, allTasks, editingTaskId]);

  // Auto-calculate workload warnings for subtask assignees
  useEffect(() => {
    if (!allTasks || !resources || !selectedTemplateId) {
      setSubTaskWorkloadWarnings({});
      return;
    }
    const newWarnings: Record<number, WorkloadInfo> = {};
    for (const idx of selectedSubTaskIndices) {
      const assignees = subTaskAssignees[idx];
      const dates = subTaskDateOverrides[idx];
      if (!assignees || assignees.length === 0 || !dates?.startDate || !dates?.endDate) continue;
      
      const startDate = new Date(dates.startDate);
      const endDate = new Date(dates.endDate);
      
      for (const rid of assignees) {
        const info = calcMemberWorkload(rid, startDate, endDate, allTasks, resources);
        if (info.overlappingTaskCount > 0 && info.severity !== 'ok') {
          newWarnings[idx] = info;
          break; // Only show first warning per subtask
        }
      }
    }
    setSubTaskWorkloadWarnings(newWarnings);
  }, [subTaskAssignees, subTaskDateOverrides, selectedSubTaskIndices, allTasks, resources, selectedTemplateId]);

  // Auto-sync parent date range from subtask date overrides (real-time during creation)
  useEffect(() => {
    if (!selectedTemplateId || selectedSubTaskIndices.length === 0) return;
    const overrides = Object.entries(subTaskDateOverrides)
      .filter(([idx]) => selectedSubTaskIndices.includes(Number(idx)))
      .map(([, dates]) => ({
        startDate: dates.startDate ? new Date(dates.startDate) : undefined,
        endDate: dates.endDate ? new Date(dates.endDate) : undefined,
      }))
      .filter(d => d.startDate || d.endDate);
    if (overrides.length === 0) return;
    const { startDate, endDate } = calcParentDateRange(overrides);
    setFormData(prev => ({
      ...prev,
      startDate: startDate || prev.startDate,
      endDate: endDate || prev.endDate,
    }));
  }, [subTaskDateOverrides, selectedSubTaskIndices, selectedTemplateId]);

  // ── Real-time pipeline dependency date validation for subtasks ──
  // Based on the game UI production pipeline: 交互设计 → 功能蓝图/UI设计 → 正式蓝图/动效设计
  useEffect(() => {
    if (!selectedTemplateId) {
      setSubTaskDepErrors({});
      return;
    }
    const template = defaultTemplates.find(t => t.id === selectedTemplateId);
    if (!template) {
      setSubTaskDepErrors({});
      return;
    }

    const errors: Record<number, string> = {};

    for (const idx of selectedSubTaskIndices) {
      const sub = template.subTasks[idx];
      if (sub.dependsOnIndex === undefined) continue;
      
      // Check if the upstream task is also selected
      const upstreamIdx = sub.dependsOnIndex;
      if (!selectedSubTaskIndices.includes(upstreamIdx)) continue;
      
      const upstreamSub = template.subTasks[upstreamIdx];
      const currentDates = subTaskDateOverrides[idx];
      const upstreamDates = subTaskDateOverrides[upstreamIdx];
      
      // Both need dates to validate
      if (!currentDates?.startDate || !upstreamDates?.endDate) continue;
      
      const currentStart = new Date(currentDates.startDate);
      const upstreamEnd = new Date(upstreamDates.endDate);
      
      // If downstream task starts before upstream task ends → logic error
      if (currentStart < upstreamEnd) {
        const overlapDays = Math.ceil((upstreamEnd.getTime() - currentStart.getTime()) / (1000 * 60 * 60 * 24));
        errors[idx] = `逻辑错误：「${sub.title}」必须在「${upstreamSub.title}」之后（当前提前了${overlapDays}天）`;
      }
      
      // Also check: if current task has an end date and upstream has a start date,
      // validate end date isn't before upstream start date
      if (currentDates?.endDate && upstreamDates?.startDate) {
        const currentEnd = new Date(currentDates.endDate);
        const upstreamStart = new Date(upstreamDates.startDate);
        if (currentEnd < upstreamStart) {
          errors[idx] = `逻辑错误：「${sub.title}」结束时间早于上游「${upstreamSub.title}」开始时间`;
        }
      }
    }

    // Also check reverse: if upstream's dates are set after downstream's dates
    for (const idx of selectedSubTaskIndices) {
      const sub = template.subTasks[idx];
      // Find all downstream tasks that depend on this one
      for (const downIdx of selectedSubTaskIndices) {
        if (downIdx === idx) continue;
        const downSub = template.subTasks[downIdx];
        if (downSub.dependsOnIndex !== idx) continue;
        
        const currentDates = subTaskDateOverrides[idx];
        const downDates = subTaskDateOverrides[downIdx];
        
        if (!currentDates?.endDate || !downDates?.startDate) continue;
        
        const currentEnd = new Date(currentDates.endDate);
        const downStart = new Date(downDates.startDate);
        
        if (currentEnd > downStart) {
          const overlapDays = Math.ceil((currentEnd.getTime() - downStart.getTime()) / (1000 * 60 * 60 * 24));
          // Only set error on upstream if downstream doesn't already have one
          if (!errors[downIdx]) {
            errors[downIdx] = `逻辑错误：「${downSub.title}」必须在「${sub.title}」之后（当前提前了${overlapDays}天）`;
          }
        }
      }
    }

    setSubTaskDepErrors(errors);
  }, [subTaskDateOverrides, selectedSubTaskIndices, selectedTemplateId]);

  // Smart title suggestions: match history task titles by keyword and recommend templates
  useEffect(() => {
    if (editingTaskId) { 
      setTitleSuggestions([]); 
      setRecommendedTemplateId(null);
      return; 
    } // Only for new tasks
    const query = formData.title?.trim() || '';
    if (query.length < 2 || !allTasks) {
      setTitleSuggestions([]);
      setRecommendedTemplateId(null);
      return;
    }
    const lower = query.toLowerCase();
    // Collect unique child task titles that match the query, with assignee info
    const seen = new Set<string>();
    const matched: { title: string; assigneeIds?: number[] }[] = [];
    for (const t of allTasks) {
      if (!t.parentId || t.title === query || !t.title.toLowerCase().includes(lower)) continue;
      if (seen.has(t.title)) continue;
      seen.add(t.title);
      matched.push({ title: t.title, assigneeIds: t.assigneeIds });
      if (matched.length >= 6) break;
    }
    setTitleSuggestions(matched);
    setShowSuggestions(matched.length > 0);

    // Recommend template based on keywords
    if (!selectedTemplateId) {
      if (/设计|交互|UI|视觉|动效/i.test(lower)) {
        setRecommendedTemplateId('standard-dev');
      } else if (/开发|功能|迭代|敏捷|测试/i.test(lower)) {
        setRecommendedTemplateId('agile-feature');
      } else {
        setRecommendedTemplateId(null);
      }
    } else {
      setRecommendedTemplateId(null);
    }
  }, [formData.title, allTasks, editingTaskId, selectedTemplateId]);

  // Check for duplicate TAPD links
  useEffect(() => {
    const checkDuplicate = async () => {
      if (!formData.externalUrl || !/tapd\.(cn|woa\.com)/.test(formData.externalUrl)) {
        setDuplicateWarning(null);
        return;
      }

      // Extract the core TAPD ID to compare (e.g., the last number in the URL)
      const tapdMatch = formData.externalUrl.match(/tapd\.(?:cn|woa\.com)\/\d+\/(?:prong\/)?(?:stories|bugs|tasks)\/view\/(\d+)/);
      if (!tapdMatch) {
        setDuplicateWarning(null);
        return;
      }

      const tapdId = tapdMatch[1];
      
      // Find if any existing task has the same TAPD ID in its externalUrl
      const existingTasks = await db.tasks.toArray();
      const duplicate = existingTasks.find(t => {
        if (t.id === editingTaskId) return false; // Ignore self when editing
        if (!t.externalUrl) return false;
        const tMatch = t.externalUrl.match(/tapd\.(?:cn|woa\.com)\/\d+\/(?:prong\/)?(?:stories|bugs|tasks)\/view\/(\d+)/);
        return tMatch && tMatch[1] === tapdId;
      });

      if (duplicate) {
        setDuplicateWarning(`警告：此 TAPD 单已存在于任务「${duplicate.title}」中`);
      } else {
        setDuplicateWarning(null);
      }
    };

    checkDuplicate();
  }, [formData.externalUrl, editingTaskId]);

  const handleSyncTapd = async () => {
    if (!formData.externalUrl || !/tapd\.(cn|woa\.com)/.test(formData.externalUrl)) return;
    
    setIsSyncing(true);
    try {
      // 模拟从 TAPD 获取数据的延迟
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // 这里在实际应用中应该调用后端 API 或使用浏览器扩展来获取真实的 TAPD 数据
      // 由于跨域限制，前端无法直接 fetch TAPD 页面内容
      // 这里我们模拟一个同步成功的提示，并更新一些基础信息
      
      // 假设我们从剪贴板或某种方式获取到了最新的文本内容
      // 这里为了演示，我们只更新一个提示状态，实际中可以更新 formData
      
      toast.success('TAPD 信息同步成功！(模拟)');
      
      // 示例：如果能获取到数据，可以这样更新
      // setFormData(prev => ({
      //   ...prev,
      //   title: newTitle,
      //   priority: newPriority,
      //   startDate: newStartDate,
      //   endDate: newEndDate
      // }));
      
    } catch (error) {
      console.error('Sync failed:', error);
      toast.error('同步失败，请检查网络或链接是否有效');
    } finally {
      setIsSyncing(false);
    }
  };

  // Smart recommendation handler
  const handleSmartRecommend = useCallback(async () => {
    if (!formData.title || !formData.startDate || !formData.endDate) return;
    setIsRecommending(true);
    setShowRecommendations(true);
    try {
      const results = await smartAssignService.recommend(
        formData.title,
        new Date(formData.startDate),
        new Date(formData.endDate)
      );
      setRecommendations(results);
    } catch (e) {
      console.error('Smart recommend failed:', e);
    } finally {
      setIsRecommending(false);
    }
  }, [formData.title, formData.startDate, formData.endDate]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400';
    if (score >= 60) return 'text-blue-400';
    if (score >= 40) return 'text-amber-400';
    return 'text-gray-500';
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'bg-emerald-500/15 border-emerald-500/30';
    if (score >= 60) return 'bg-blue-500/15 border-blue-500/30';
    if (score >= 40) return 'bg-amber-500/15 border-amber-500/30';
    return 'bg-gray-800/50 border-gray-700/30';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return '强烈推荐';
    if (score >= 60) return '推荐';
    if (score >= 40) return '可选';
    return '不推荐';
  };

  if (!isTaskModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check for duplicate task title (block submission)
    if (formData.title && allTasks) {
      const duplicate = allTasks.find(t => {
        if (t.id === editingTaskId) return false; // Ignore self when editing
        return t.title.trim().toLowerCase() === formData.title!.trim().toLowerCase();
      });
      if (duplicate) {
        await alertDialog({ title: '任务重复', message: `任务详情重复！已存在同名任务「${duplicate.title}」(ID: ${duplicate.id})，请修改任务详情后再提交。`, type: 'warning' });
        return;
      }
    }

    // Block submission if there are pipeline dependency date conflicts
    if (selectedTemplateId && Object.keys(subTaskDepErrors).length > 0) {
      const errorMessages = Object.values(subTaskDepErrors);
      await alertDialog({ title: '日期冲突', message: `存在上下游依赖日期冲突，请修正后再提交：\n\n${errorMessages.join('\n')}`, type: 'warning' });
      return;
    }
    
    if (editingTaskId) {
      await trackedDb.tasks.update(editingTaskId, formData, '编辑任务');
      // Auto-sync parent date range when editing a child task
      if (formData.parentId) {
        await syncParentDateRange(formData.parentId);
      }
    } else {
      if (selectedTemplateId) {
        const template = defaultTemplates.find(t => t.id === selectedTemplateId);
        if (template) {
          // Validate: if any subtask has CP assignee, internal contact is required
          for (const idx of selectedSubTaskIndices) {
            const assigneeId = subTaskAssignees[idx]?.[0];
            if (assigneeId) {
              const assigneeResource = resources?.find(r => r.id === assigneeId);
              if (assigneeResource?.type === 'cp' && !subTaskInternalContacts[idx]) {
                await alertDialog({ title: 'CP对接人缺失', message: `子任务「${template.subTasks[idx].title}」的负责人是 CP（${assigneeResource.name}），请选择一个内部对接人！`, type: 'warning' });
                return;
              }
            }
          }
          // Create parent task
          const parentId = await trackedDb.tasks.add(formData as Task, `新建任务「${formData.title}」`);
          
          // Create subtasks
          const subTaskIds: number[] = [];
          const subTaskDates: { start: Date, end: Date }[] = [];
          // Map template index -> created task ID for dependency wiring
          const indexToTaskId: Record<number, number> = {};
          
          let currentStartDate = formData.startDate || new Date();
          
          for (let i = 0; i < template.subTasks.length; i++) {
            if (!selectedSubTaskIndices.includes(i)) continue;

            const sub = template.subTasks[i];
            let start = currentStartDate;
            let end = start;
            
            // Use user-specified date overrides if available
            const dateOverride = subTaskDateOverrides[i];
            if (dateOverride?.startDate) {
              start = new Date(dateOverride.startDate);
            } else if (sub.dependsOnIndex !== undefined && subTaskDates[sub.dependsOnIndex]) {
              start = subTaskDates[sub.dependsOnIndex].end;
            }
            
            if (dateOverride?.endDate) {
              end = new Date(dateOverride.endDate);
            } else {
              end = start; // Default: same day, user adjusts later
            }
            
            subTaskDates[i] = { start, end };
            
            // Use user-selected assignee if available, otherwise auto-match by role
            const userSelected = subTaskAssignees[i];
            let assigneeIds = userSelected && userSelected.length > 0
              ? [...userSelected]
              : (() => {
                  const matchingResources = resources?.filter(r => r.role === sub.roleRequired) || [];
                  return matchingResources.length > 0 ? [matchingResources[0].id!] : [];
                })();
            
            // If assignee is CP type and an internal contact was selected, add the internal contact
            const cpAssignee = assigneeIds.length > 0 ? resources?.find(r => r.id === assigneeIds[0]) : null;
            if (cpAssignee && cpAssignee.type === 'cp') {
              const internalContactId = subTaskInternalContacts[i];
              if (internalContactId && !assigneeIds.includes(internalContactId)) {
                assigneeIds.push(internalContactId);
              }
            }
            
            const subTaskTitle = formData.title ? `${formData.title}-${sub.title}` : sub.title;
            const subTaskId = await trackedDb.tasks.add({
              title: subTaskTitle,
              description: `由模板 [${template.name}] 自动生成`,
              status: 'todo',
              priority: formData.priority || ('' as any),
              startDate: start,
              endDate: end,
              progress: 0,
              dependencies: [],
              assigneeIds,
              type: sub.type,
              projectId: formData.projectId || 1,
              parentId: parentId as number,
              workCategory: formData.workCategory || 'self_made',
            }, `新建子任务「${subTaskTitle}」`);
            subTaskIds.push(subTaskId as number);
            indexToTaskId[i] = subTaskId as number;
          }
          
          // Auto-infer pipeline dependencies among created subtasks
          const createdSubTasks = await Promise.all(
            subTaskIds.map(id => db.tasks.get(id))
          );
          const validSubTasks = createdSubTasks.filter((t): t is Task => !!t);
          // Get resources for role-based pipeline inference
          const allResourcesForPipeline = await db.resources.toArray();
          const resourcesForInfer = allResourcesForPipeline
            .filter(r => r.id !== undefined)
            .map(r => ({ id: r.id!, role: r.role || '' }));
          const depMap = inferPipelineDependencies(
            validSubTasks.map(t => ({ id: t.id!, title: t.title, dependencies: t.dependencies || [], assigneeIds: t.assigneeIds || [] })),
            resourcesForInfer
          );
          // Write inferred dependencies back to DB
          for (const [taskId, deps] of depMap.entries()) {
            await trackedDb.tasks.update(taskId, { dependencies: deps }, '自动推断 pipeline 依赖');
          }
          
          // Auto-sync parent date range from newly created subtasks
          await syncParentDateRange(parentId as number);
          
          // Highlight newly created tasks
          setHighlightedTaskIds([parentId as number, ...subTaskIds]);
          if (!useStore.getState().expandedTaskIds.has(parentId as number)) {
            toggleTaskExpansion(parentId as number);
          }
          
          // Clear highlights after 3 seconds
          setTimeout(() => {
            useStore.getState().clearHighlightedTaskIds();
          }, 3000);
        }
      } else {
        await trackedDb.tasks.add(formData as Task, `新建任务「${formData.title}」`);
      }
    }
    closeTaskModal();
  };

  const handleDelete = async () => {
    if (!editingTaskId) return;
    const ok = await confirmDialog({ title: '删除任务', message: '确定要删除此任务吗？如果包含子任务，子任务也将被一并删除。', type: 'danger', confirmText: '删除' });
    if (ok) {
      const getChildrenIds = async (parentId: number): Promise<number[]> => {
        const children = await db.tasks.where('parentId').equals(parentId).toArray();
        let ids = children.map(c => c.id!);
        for (const id of ids) {
          const subIds = await getChildrenIds(id);
          ids = [...ids, ...subIds];
        }
        return ids;
      };
      
      const idsToDelete = [editingTaskId, ...(await getChildrenIds(editingTaskId))];
      await trackedDb.tasks.bulkDelete(idsToDelete, '删除任务及子任务');
      closeTaskModal();
    }
  };

  const [activeStep, setActiveStep] = useState<number>(0);
  const steps = editingTaskId 
    ? [
        { id: 0, label: '基本信息', icon: '📋' },
        { id: 1, label: '排期', icon: '📅' },
        { id: 2, label: '分配', icon: '👤' },
        { id: 3, label: '关联', icon: '🔗' },
      ]
    : [
        { id: 0, label: '模板 & 基本', icon: '📋' },
        { id: 1, label: '排期', icon: '📅' },
        { id: 2, label: '分配', icon: '👤' },
        { id: 3, label: '关联', icon: '🔗' },
      ];

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-xl flex items-center justify-center z-[200] p-4">
      <div className="bg-[#1e1e2e]/95 backdrop-blur-xl border border-white/10 rounded-xl w-full max-w-4xl shadow-2xl shadow-black/40 overflow-hidden flex flex-col" style={{ maxHeight: 'calc(100vh - 2rem)' }}>
        <div className="flex justify-between items-center p-5 border-b border-white/[0.06] bg-[#181825]/80 shrink-0">
          <h2 className="text-lg font-semibold text-gray-100">{editingTaskId ? '编辑任务' : '新建任务'}</h2>
          <button onClick={closeTaskModal} className="text-gray-400 hover:text-white hover:bg-white/10 transition-all duration-200 p-1.5 rounded-lg">
            <X size={18} />
          </button>
        </div>

        {/* Step Navigation */}
        <div className="px-5 pt-3 pb-2 border-b border-white/[0.04] bg-[#181825]/40 shrink-0">
          <div className="flex items-center gap-1">
            {steps.map((step, idx) => (
              <button
                key={step.id}
                type="button"
                onClick={() => setActiveStep(step.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                  activeStep === step.id
                    ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-white/5 border border-transparent'
                }`}
              >
                <span className="text-sm">{step.icon}</span>
                <span>{step.label}</span>
                {activeStep === step.id && (
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 ml-1" />
                )}
              </button>
            ))}
          </div>
        </div>
        
        <form onSubmit={handleSubmit} className="p-5 space-y-5 overflow-y-auto flex-1 custom-scrollbar">
          {/* ═══ Step 0: Basic Info & Template ═══ */}
          <div className={activeStep === 0 ? '' : 'hidden'}>
          {!editingTaskId && (
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider flex items-center gap-1">
                <Sparkles size={14} className="text-amber-400" />
                从模板创建 (可选)
              </label>
              <div className="grid grid-cols-2 gap-3">
                {defaultTemplates.map(template => {
                  const isSelected = selectedTemplateId === template.id;
                  const isRecommended = recommendedTemplateId === template.id;
                  const Icon = template.icon === 'Code2' ? Code2 : Zap;
                  return (
                    <div
                      key={template.id}
                      onClick={() => setSelectedTemplateId(isSelected ? null : template.id)}
                      className={`cursor-pointer p-3 rounded-xl border transition-all duration-200 relative ${
                        isSelected 
                          ? 'bg-amber-500/10 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.1)]' 
                          : isRecommended
                            ? 'bg-indigo-500/10 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.1)]'
                            : 'bg-[#11111b]/80 border-white/[0.06] hover:border-white/20 hover:bg-white/[0.04] hover:-translate-y-0.5'
                      }`}
                    >
                      {isRecommended && !isSelected && (
                        <div className="absolute -top-2 -right-2 bg-indigo-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full shadow-md flex items-center gap-0.5 animate-pulse">
                          <Sparkles size={8} />
                          推荐
                        </div>
                      )}
                      <div className="flex items-center gap-2 mb-1.5">
                        <Icon size={16} className={isSelected ? 'text-amber-400' : isRecommended ? 'text-indigo-400' : 'text-gray-400'} />
                        <span className={`text-sm font-medium ${isSelected ? 'text-amber-400' : isRecommended ? 'text-indigo-400' : 'text-gray-300'}`}>
                          {template.name}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 line-clamp-2 mb-2">{template.description}</p>
                      <div className="text-[10px] text-gray-400 bg-gray-800/50 inline-block px-2 py-1 rounded-md">
                        包含 <span className="font-mono tabular-nums">{template.subTasks.length}</span> 个子任务
                      </div>
                    </div>
                  );
                })}
              </div>
              {selectedTemplateId && (
              <div className="mt-3 bg-gray-800/20 backdrop-blur-sm rounded-lg p-3 border border-white/[0.06]">
                  <div className="text-xs font-medium text-gray-400 mb-2 flex items-center justify-between">
                    <span>将生成以下子任务：</span>
                    {Object.keys(subTaskDepErrors).length > 0 && (
                      <span className="flex items-center gap-1 text-red-400 text-[10px] font-semibold animate-pulse">
                        <AlertTriangle size={11} />
                        {Object.keys(subTaskDepErrors).length} 处管线依赖冲突
                      </span>
                    )}
                  </div>
                  <div className="space-y-3">
                    {defaultTemplates.find(t => t.id === selectedTemplateId)?.subTasks.map((sub, idx) => {
                      const isChecked = selectedSubTaskIndices.includes(idx);
                      const wlWarning = subTaskWorkloadWarnings[idx];
                      const depError = subTaskDepErrors[idx];
                      return (
                      <div key={idx} className={`rounded-lg border transition-all ${
                        !isChecked
                          ? 'border-transparent opacity-60'
                          : depError
                            ? 'border-red-500/50 bg-red-500/5 shadow-[0_0_8px_rgba(239,68,68,0.1)]'
                            : 'border-white/[0.08] bg-gray-800/30'
                      }`}>
                        {/* Row 1: Checkbox + Name + Assignee */}
                        <div className="flex items-center gap-2 px-2.5 pt-2 pb-1">
                          <input 
                            type="checkbox" 
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedSubTaskIndices([...selectedSubTaskIndices, idx].sort((a, b) => a - b));
                              } else {
                                setSelectedSubTaskIndices(selectedSubTaskIndices.filter(i => i !== idx));
                              }
                            }}
                            className="rounded border-gray-600 text-indigo-500 focus:ring-indigo-500 bg-gray-700 shrink-0"
                          />
                          <span className={`text-sm min-w-0 truncate flex-1 ${isChecked ? 'text-gray-300' : 'text-gray-500 line-through'}`}>
                            {formData.title ? `${formData.title}-${sub.title}` : sub.title}
                          </span>
                          {/* Per-subtask assignee selector */}
                          <div className="shrink-0 relative group/swl">
                            <select
                              value={subTaskAssignees[idx]?.[0] || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setSubTaskAssignees(prev => ({
                                  ...prev,
                                  [idx]: val ? [Number(val)] : []
                                }));
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className={`bg-[#11111b] border rounded-md pl-2 pr-6 py-1 text-[11px] focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 appearance-none w-[140px] cursor-pointer transition-colors ${
                                wlWarning && wlWarning.severity !== 'ok'
                                  ? 'border-amber-500/50 text-amber-300'
                                  : 'border-gray-700/50 text-gray-400 hover:border-gray-500 hover:text-gray-300'
                              }`}
                              title="选择负责人"
                            >
                              <option value="">负责人</option>
                              {resources?.filter(r => r.type !== 'cp' && r.status !== 'departed').length ? (
                                <optgroup label="内部成员">
                                  {resources?.filter(r => r.type !== 'cp' && r.status !== 'departed').sort((a, b) => getRoleOrderIndex(a.role) - getRoleOrderIndex(b.role)).map(r => (
                    <option key={r.id} value={r.id}>{r.role ? `【${r.role}】${r.name}` : r.name}{(() => { const s = getEffectiveStatus(r); return s === 'wfh' ? ' (居家)' : s === 'sick' ? ' (欠佳)' : s === 'leave' ? ' (休假)' : s === 'focus' ? ' (专注)' : ''; })()}</option>
                                  ))}
                                </optgroup>
                              ) : null}
                              {resources?.filter(r => r.type === 'cp' && r.status !== 'departed').length ? (
                                <optgroup label="CP外包">
                                  {resources?.filter(r => r.type === 'cp' && r.status !== 'departed').sort((a, b) => getRoleOrderIndex(a.role) - getRoleOrderIndex(b.role)).map(r => (
                                    <option key={r.id} value={r.id}>🏢 {r.name}</option>
                                  ))}
                                </optgroup>
                              ) : null}
                            </select>
                            <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                            {/* Workload warning badge */}
                            {wlWarning && wlWarning.severity !== 'ok' && (
                              <span className={`absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center ${
                                wlWarning.severity === 'danger' ? 'bg-red-500' : 'bg-amber-500'
                              }`}>
                                <AlertTriangle size={8} className="text-white" />
                              </span>
                            )}
                            {/* Workload warning tooltip */}
                            {wlWarning && wlWarning.severity !== 'ok' && (
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover/swl:opacity-100 transition-opacity pointer-events-none z-[60] whitespace-nowrap">
                                <div className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium shadow-xl border ${
                                  wlWarning.severity === 'danger'
                                    ? 'bg-red-950/95 border-red-500/40 text-red-200'
                                    : 'bg-amber-950/95 border-amber-500/40 text-amber-200'
                                }`}>
                                  {wlWarning.summary}
                                </div>
                              </div>
                            )}
                          </div>
                          {/* CP internal contact selector — show when subtask assignee is CP type */}
                          {(() => {
                            const assigneeId = subTaskAssignees[idx]?.[0];
                            const assigneeResource = assigneeId ? resources?.find(r => r.id === assigneeId) : null;
                            if (!assigneeResource || assigneeResource.type !== 'cp') return null;
                            const internalResources = resources?.filter(r => r.type !== 'cp' && r.status !== 'departed') || [];
                            return (
                              <div className="shrink-0 relative">
                                <select
                                  value={subTaskInternalContacts[idx] || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setSubTaskInternalContacts(prev => ({
                                      ...prev,
                                      [idx]: val ? Number(val) : 0
                                    }));
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  className={`bg-[#11111b] border rounded-md pl-2 pr-6 py-1 text-[11px] focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 appearance-none w-[130px] cursor-pointer transition-colors ${
                                    !subTaskInternalContacts[idx]
                                      ? 'border-red-500/50 text-red-300'
                                      : 'border-emerald-500/40 text-emerald-300'
                                  }`}
                                  title="CP负责人需要选择内部对接人"
                                >
                                  <option value="">内部对接人*</option>
                                  {internalResources.map(r => (
                                    <option key={r.id} value={r.id}>{r.name}</option>
                                  ))}
                                </select>
                                <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-emerald-500 pointer-events-none" />
                                {!subTaskInternalContacts[idx] && (
                                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 flex items-center justify-center">
                                    <span className="text-[8px] text-white font-bold">!</span>
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                        {/* Row 2: Date pickers (only when checked) */}
                        {isChecked && (
                          <div className="ml-6">
                            <div className={`flex items-center gap-2 px-2.5 pb-1 pt-0.5 ${subTaskDepErrors[idx] ? '' : 'pb-2'}`}>
                              <Clock size={11} className={`shrink-0 ${subTaskDepErrors[idx] ? 'text-red-400' : 'text-gray-600'}`} />
                              <input
                                type="date"
                                value={subTaskDateOverrides[idx]?.startDate || ''}
                                onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                                onChange={(e) => {
                                  setSubTaskDateOverrides(prev => ({
                                    ...prev,
                                    [idx]: { ...prev[idx], startDate: e.target.value }
                                  }));
                                }}
                                className={`bg-[#11111b] border rounded-md px-2 py-0.5 text-[11px] focus:outline-none w-[120px] cursor-pointer transition-colors [color-scheme:dark] ${
                                  subTaskDepErrors[idx]
                                    ? 'border-red-500/70 text-red-300 focus:border-red-500 focus:ring-1 focus:ring-red-500/30'
                                    : 'border-gray-700/50 text-gray-400 focus:border-indigo-500 hover:border-gray-500'
                                }`}
                                title="开始日期（可留空）"
                              />
                              <span className={`text-[10px] ${subTaskDepErrors[idx] ? 'text-red-400' : 'text-gray-600'}`}>→</span>
                              <input
                                type="date"
                                value={subTaskDateOverrides[idx]?.endDate || ''}
                                onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                                onChange={(e) => {
                                  setSubTaskDateOverrides(prev => ({
                                    ...prev,
                                    [idx]: { ...prev[idx], endDate: e.target.value }
                                  }));
                                }}
                                className={`bg-[#11111b] border rounded-md px-2 py-0.5 text-[11px] focus:outline-none w-[120px] cursor-pointer transition-colors [color-scheme:dark] ${
                                  subTaskDepErrors[idx]
                                    ? 'border-red-500/70 text-red-300 focus:border-red-500 focus:ring-1 focus:ring-red-500/30'
                                    : 'border-gray-700/50 text-gray-400 focus:border-indigo-500 hover:border-gray-500'
                                }`}
                                title="结束日期（可留空）"
                              />
                              <span className="text-[9px] text-gray-600 ml-1">可留空</span>
                            </div>
                            {/* Pipeline dependency date conflict error */}
                            {subTaskDepErrors[idx] && (
                              <div className="flex items-center gap-1.5 px-2.5 pb-2 ml-3 animate-pulse">
                                <AlertTriangle size={10} className="text-red-400 shrink-0" />
                                <span className="text-[10px] text-red-400 font-medium">{subTaskDepErrors[idx]}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">任务详情</label>
            <div className="relative">
            <input
              type="text"
              required
              value={formData.title}
              onChange={e => setFormData({ ...formData, title: e.target.value })}
              onPaste={e => {
                const pasted = e.clipboardData.getData('text').trim();
                const parsed = parsePastedText(pasted, formData.startDate, formData.endDate);

                // Auto-select sub-tasks from paste content
                if (parsed.subTasksToSelect.length > 0 && !selectedTemplateId) {
                   setSelectedTemplateId(defaultTemplates[0].id);
                   setSelectedSubTaskIndices(parsed.subTasksToSelect);
                } else if (parsed.subTasksToSelect.length > 0 && selectedTemplateId) {
                   setSelectedSubTaskIndices(Array.from(new Set([...selectedSubTaskIndices, ...parsed.subTasksToSelect])).sort((a, b) => a - b));
                }

                if (parsed.urls.length > 0) {
                  e.preventDefault();
                  const finalTitle = formData.title 
                    ? `${formData.title} ${parsed.cleanTitle}`.trim() 
                    : parsed.cleanTitle;
                  
                  setFormData({ 
                    ...formData, 
                    title: finalTitle, 
                    externalUrl: formData.externalUrl || parsed.urls[0],
                    ...(parsed.priority && { priority: parsed.priority }),
                    ...(parsed.startDate && { startDate: parsed.startDate }),
                    ...(parsed.endDate && { endDate: parsed.endDate })
                  });
                } else {
                  const hasPriorityChange = parsed.priority && parsed.priority !== formData.priority;
                  const hasDateChange = parsed.startDate !== formData.startDate || parsed.endDate !== formData.endDate;
                  if (hasPriorityChange || hasDateChange) {
                    setTimeout(() => {
                      setFormData(prev => ({
                        ...prev,
                        ...(parsed.priority && { priority: parsed.priority }),
                        startDate: parsed.startDate,
                        endDate: parsed.endDate
                      }));
                    }, 0);
                  }
                }
              }}
              onFocus={() => titleSuggestions.length > 0 && setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              className="w-full bg-[#11111b] border border-gray-700/50 rounded-lg px-3.5 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
            />
            {/* Smart title suggestion dropdown */}
            {showSuggestions && titleSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-[#1a1d2e] border border-indigo-500/30 rounded-lg shadow-2xl overflow-hidden">
                <div className="px-3 py-1.5 border-b border-gray-700/50 flex items-center gap-1.5">
                  <Sparkles size={11} className="text-indigo-400" />
                  <span className="text-[10px] text-indigo-400 font-medium">历史任务联想</span>
                </div>
                {titleSuggestions.map((s, i) => {
                  // Resolve assignee names for this suggestion
                  const assigneeNames = (s.assigneeIds || [])
                    .map(id => resources?.find(r => r.id === id))
                    .filter(Boolean)
                    .map(r => r!);
                  return (
                    <button
                      key={i}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-indigo-500/15 hover:text-white transition-colors flex items-center gap-2"
                      onMouseDown={() => {
                        setFormData(prev => ({ ...prev, title: s.title }));
                        setShowSuggestions(false);
                      }}
                    >
                      <Clock size={11} className="text-gray-500 shrink-0" />
                      <span className="truncate flex-1 min-w-0">{s.title}</span>
                      {assigneeNames.length > 0 && (
                        <span className="shrink-0 flex items-center gap-1 ml-1">
                          {assigneeNames.slice(0, 3).map(r => (
                            <span key={r.id} className={`text-[9px] px-1.5 py-0.5 rounded-md border font-medium ${
                              r.type === 'cp'
                                ? 'text-emerald-300 bg-emerald-500/15 border-emerald-500/25'
                                : 'text-indigo-300 bg-indigo-500/15 border-indigo-500/25'
                            }`}>
                              {r.name}
                            </span>
                          ))}
                          {assigneeNames.length > 3 && (
                            <span className="text-[9px] text-gray-500">+{assigneeNames.length - 3}</span>
                          )}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            </div>
          </div>

          {/* External URL association */}
          </div>
          {/* ═══ Step 3: Links & Relations ═══ */}
          <div className={activeStep === 3 ? 'space-y-5' : 'hidden'}>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
              <Link2 size={12} className="text-blue-400" />
              关联链接
              <span className="text-gray-600 normal-case tracking-normal font-normal">(可选，粘贴 TAPD 单链接)</span>
            </label>
            <div className="relative">
              <input
                type="url"
                value={formData.externalUrl || ''}
                onChange={e => setFormData({ ...formData, externalUrl: e.target.value })}
                onPaste={e => {
                  const pasted = e.clipboardData.getData('text').trim();
                  const parsed = parsePastedText(pasted, formData.startDate, formData.endDate);

                  // Auto-select sub-tasks from paste content
                  if (parsed.subTasksToSelect.length > 0 && !selectedTemplateId) {
                     setSelectedTemplateId(defaultTemplates[0].id);
                     setSelectedSubTaskIndices(parsed.subTasksToSelect);
                  } else if (parsed.subTasksToSelect.length > 0 && selectedTemplateId) {
                     setSelectedSubTaskIndices(Array.from(new Set([...selectedSubTaskIndices, ...parsed.subTasksToSelect])).sort((a, b) => a - b));
                  }

                  if (parsed.urls.length > 0) {
                    e.preventDefault();
                    setFormData({ 
                      ...formData, 
                      title: (!formData.title && parsed.cleanTitle) ? parsed.cleanTitle : formData.title,
                      externalUrl: parsed.urls[0],
                      ...(parsed.priority && { priority: parsed.priority }),
                      ...(parsed.startDate && { startDate: parsed.startDate }),
                      ...(parsed.endDate && { endDate: parsed.endDate })
                    });
                  } else {
                    const hasPriorityChange = parsed.priority && parsed.priority !== formData.priority;
                    const hasDateChange = parsed.startDate !== formData.startDate || parsed.endDate !== formData.endDate;
                    if (hasPriorityChange || hasDateChange) {
                      setTimeout(() => {
                        setFormData(prev => ({
                          ...prev,
                          ...(parsed.priority && { priority: parsed.priority }),
                          startDate: parsed.startDate,
                          endDate: parsed.endDate
                        }));
                      }, 0);
                    }
                  }
                }}
                className="w-full bg-[#11111b] border border-gray-700/50 rounded-lg pl-3.5 pr-10 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                placeholder="https://www.tapd.cn/..."
              />
              {formData.externalUrl && (
                <a
                  href={formData.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-400 hover:text-blue-300 p-1 rounded hover:bg-blue-500/10 transition-colors"
                  title="在新标签页中打开"
                  onClick={e => e.stopPropagation()}
                >
                  <ExternalLink size={14} />
                </a>
              )}
              {formData.externalUrl && /tapd\.(cn|woa\.com)/.test(formData.externalUrl) && (
                <button
                  type="button"
                  onClick={handleSyncTapd}
                  disabled={isSyncing}
                  className="absolute right-8 top-1/2 -translate-y-1/2 text-emerald-400 hover:text-emerald-300 p-1 rounded hover:bg-emerald-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="同步 TAPD 最新信息"
                >
                  {isSyncing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                </button>
              )}
            </div>
            {duplicateWarning ? (
              <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-amber-400/90 bg-amber-500/10 p-1.5 rounded border border-amber-500/20">
                <Zap size={10} />
                <span>{duplicateWarning}</span>
              </div>
            ) : formData.externalUrl && /tapd\.(cn|woa\.com)/.test(formData.externalUrl) ? (
              <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-blue-400/70">
                <CheckCircle2 size={10} />
                  <span>已关联 TAPD 单，任务详情点击可直接跳转</span>
              </div>
            ) : null}
          </div>
          </div>
          {/* ═══ Step 0 continued: Description, Status, Priority, Type ═══ */}
          <div className={activeStep === 0 ? 'space-y-5' : 'hidden'}>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">描述</label>
            <textarea
              value={formData.description || ''}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              className="w-full bg-[#11111b] border border-gray-700/50 rounded-lg px-3.5 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all h-16 resize-none"
              placeholder="添加任务描述..."
            />
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">状态</label>
              <select
                value={formData.status}
                onChange={e => setFormData({ ...formData, status: e.target.value as any })}
                className="w-full bg-[#11111b] border border-gray-700/50 rounded-lg px-3.5 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all appearance-none"
              >
                <option value="todo">待办</option>
                <option value="in_progress">进行中</option>
                <option value="done">已完成</option>
                <option value="cancelled">已关闭</option>
              </select>
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">优先级</label>
              <select
                value={formData.priority || ''}
                onChange={e => setFormData({ ...formData, priority: e.target.value as any })}
                className="w-full bg-[#11111b] border border-gray-700/50 rounded-lg px-3.5 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all appearance-none"
              >
                <option value="">-</option>
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
              </select>
            </div>
          </div>

          {/* Work Category: self-made vs CP follow-up */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">任务类别</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, workCategory: 'self_made' })}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium border transition-all ${
                  (!formData.workCategory || formData.workCategory === 'self_made')
                    ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300 shadow-[0_0_8px_rgba(99,102,241,0.15)]'
                    : 'bg-[#11111b] border-gray-700/50 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                }`}
              >
                <User size={14} />
                自制内容
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, workCategory: 'cp_follow' })}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium border transition-all ${
                  formData.workCategory === 'cp_follow'
                    ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.15)]'
                    : 'bg-[#11111b] border-gray-700/50 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                }`}
              >
                <Building2 size={14} />
                CP跟进
              </button>
            </div>
            <p className="text-[10px] text-gray-600 mt-1">
              {formData.workCategory === 'cp_follow' ? 'CP跟进任务负荷权重较低（30%/项）' : '自制任务负荷权重正常（60%/项）'}
            </p>
          </div>
          </div>

          {/* ═══ Step 1: Scheduling ═══ */}
          <div className={activeStep === 1 ? 'space-y-5' : 'hidden'}>
          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">开始时间 <span className="text-gray-600 normal-case tracking-normal font-normal">(可留空)</span></label>
              <input
              type="date"
                autoComplete="off"
                value={formData.startDate && !isNaN(formData.startDate.getTime()) ? format(formData.startDate, 'yyyy-MM-dd') : ''}
                onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                onChange={e => {
                  if (e.target.value) {
                    const d = parseISO(e.target.value);
                    if (!isNaN(d.getTime())) setFormData({ ...formData, startDate: d });
                  } else {
                    setFormData({ ...formData, startDate: undefined });
                  }
                }}
                className="w-full bg-[#11111b] border border-gray-700/50 rounded-lg px-3.5 py-2.5 text-sm text-gray-200 font-mono tabular-nums focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all cursor-pointer [color-scheme:dark]"
              />
            </div>
            
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">结束时间 <span className="text-gray-600 normal-case tracking-normal font-normal">(可留空)</span></label>
                {(formData.startDate || formData.endDate) && (
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, startDate: undefined, endDate: undefined })}
                    className="flex items-center gap-1 px-1.5 py-0.5 text-[11px] text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-all group"
                    title="一键清空开始时间和结束时间"
                  >
                    <X size={11} className="opacity-60 group-hover:opacity-100" />
                    <span>清空排期</span>
                  </button>
                )}
              </div>
              <input
              type="date"
                autoComplete="off"
                value={formData.endDate && !isNaN(formData.endDate.getTime()) ? format(formData.endDate, 'yyyy-MM-dd') : ''}
                onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                onChange={e => {
                  if (e.target.value) {
                    const d = parseISO(e.target.value);
                    if (!isNaN(d.getTime())) setFormData({ ...formData, endDate: d });
                  } else {
                    setFormData({ ...formData, endDate: undefined });
                  }
                }}
                className="w-full bg-[#11111b] border border-gray-700/50 rounded-lg px-3.5 py-2.5 text-sm text-gray-200 font-mono tabular-nums focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all cursor-pointer [color-scheme:dark]"
              />
            </div>
          </div>

          {/* Dependency conflict warnings */}
          {depConflicts.length > 0 && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/25">
              <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                {depConflicts.map((c, i) => (
                  <div key={i} className="text-[11px] text-red-300">{c.message}</div>
                ))}
              </div>
            </div>
          )}

          {/* Workload summary for selected assignees */}
          {workloadWarnings.size > 0 && formData.startDate && formData.endDate && (
            <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25">
              <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                {Array.from(workloadWarnings.values()).map((wl, i) => (
                  <div key={i} className="text-[11px]">
                    <div className="text-amber-300">
                      <span className="font-medium">{wl.resourceName}</span>：{wl.summary}
                    </div>
                    {/* Category breakdown */}
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 ml-0.5">
                      {wl.categoryBreakdown.selfMadeCount > 0 && (
                        <span className="text-[10px] text-indigo-300/80">
                          <User size={9} className="inline mr-0.5 -mt-px" />
                          自制×{wl.categoryBreakdown.selfMadeCount}
                          <span className="text-indigo-400/50 ml-0.5">({wl.categoryBreakdown.selfMadeLoadPercent}%)</span>
                          {wl.categoryBreakdown.selfMadeTitles.length > 0 && (
                            <span className="text-indigo-400/40 ml-0.5">({wl.categoryBreakdown.selfMadeTitles.slice(0, 2).join('、')})</span>
                          )}
                        </span>
                      )}
                      {wl.categoryBreakdown.cpFollowCount > 0 && (
                        <span className="text-[10px] text-cyan-300/80">
                          <Building2 size={9} className="inline mr-0.5 -mt-px" />
                          CP跟进×{wl.categoryBreakdown.cpFollowCount}
                          <span className="text-cyan-400/50 ml-0.5">({wl.categoryBreakdown.cpFollowLoadPercent}%)</span>
                          {wl.categoryBreakdown.cpFollowTitles.length > 0 && (
                            <span className="text-cyan-400/40 ml-0.5">({wl.categoryBreakdown.cpFollowTitles.slice(0, 2).join('、')})</span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          </div>

          {/* ═══ Step 2: Assignment ═══ */}
          <div className={activeStep === 2 ? 'space-y-5' : 'hidden'}>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider">负责人</label>
              <button
                type="button"
                onClick={handleSmartRecommend}
                disabled={isRecommending || !formData.title}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all border disabled:opacity-40 disabled:cursor-not-allowed bg-gradient-to-r from-violet-500/20 to-cyan-500/20 border-violet-500/40 text-violet-200 hover:from-violet-500/30 hover:to-cyan-500/30 hover:border-violet-400 hover:shadow-[0_0_15px_rgba(139,92,246,0.3)] hover:-translate-y-0.5"
                title="基于技能匹配、工作负载和可用性智能推荐最佳经办人"
              >
                {isRecommending ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Brain size={12} className="text-violet-400" />
                )}
                AI 智能推荐
              </button>
            </div>
            {/* ── Internal Members ── */}
            {resources?.some(r => r.type !== 'cp' && r.status !== 'departed') && (
              <div className="mb-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <User size={11} className="text-indigo-400" />
                  <span className="text-[10px] text-indigo-400 font-semibold uppercase tracking-wider">内部成员</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {resources?.filter(r => r.type !== 'cp' && r.status !== 'departed').sort((a, b) => getRoleOrderIndex(a.role) - getRoleOrderIndex(b.role)).map(r => {
                    const isSelected = formData.assigneeIds?.includes(r.id!);
                    const rec = recommendations.find(rc => rc.resourceId === r.id);
                    const wl = workloadWarnings.get(r.id!);
                    return (
                      <div key={r.id} className="relative group/wl">
                        <button
                          type="button"
                          onClick={() => {
                            const current = formData.assigneeIds || [];
                            const next = isSelected 
                              ? current.filter(id => id !== r.id)
                              : [...current, r.id!];
                            setFormData({ ...formData, assigneeIds: next });
                          }}
                          className={`px-3 py-1.5 rounded-lg text-sm transition-all duration-200 border relative ${
                            isSelected 
                              ? wl && wl.severity !== 'ok'
                                ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                                : 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
                              : 'bg-[#11111b]/80 border-white/[0.06] text-gray-400 hover:border-white/20 hover:bg-white/[0.04] hover:-translate-y-0.5'
                          }`}
                        >
                          <span>{r.name}</span>
                          {r.role && (
                            <span className="text-[9px] text-gray-500 ml-1.5">({r.role})</span>
                          )}
                          {(() => { const effStatus = getEffectiveStatus(r); return (<>
                          {effStatus === 'wfh' && <span className="text-[9px] text-blue-400 ml-1.5">🏠</span>}
                          {effStatus === 'sick' && <span className="text-[9px] text-orange-400 ml-1.5">🤒</span>}
                          {effStatus === 'leave' && <span className="text-[9px] text-purple-400 ml-1.5">📅</span>}
                          {effStatus === 'focus' && <span className="text-[9px] text-red-400 ml-1.5">🔥</span>}
                          </>); })()}
                          {/* AI recommendation badge */}
                          {rec && rec.totalScore >= 60 && !wl && (
                            <span className={`absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ${
                              rec.totalScore >= 80 ? 'bg-emerald-500 text-white' : 'bg-blue-500 text-white'
                            }`}>
                              {rec.totalScore >= 80 ? '★' : '✓'}
                            </span>
                          )}
                          {/* Workload warning badge */}
                          {isSelected && wl && wl.severity !== 'ok' && (
                            <span className={`absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center ${
                              wl.severity === 'danger' ? 'bg-red-500' : 'bg-amber-500'
                            }`}>
                              <AlertTriangle size={9} className="text-white" />
                            </span>
                          )}
                        </button>
                        {/* Workload warning tooltip */}
                        {isSelected && wl && wl.severity !== 'ok' && (
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover/wl:opacity-100 transition-opacity pointer-events-none z-[60] whitespace-nowrap">
                            <div className={`px-3 py-2 rounded-lg text-[11px] font-medium shadow-xl border ${
                              wl.severity === 'danger'
                                ? 'bg-red-950/95 border-red-500/40 text-red-200'
                                : 'bg-amber-950/95 border-amber-500/40 text-amber-200'
                            }`}>
                              <div className="flex items-center gap-1.5 mb-1">
                                <AlertTriangle size={11} className={wl.severity === 'danger' ? 'text-red-400' : 'text-amber-400'} />
                                <span className="font-semibold">{wl.summary}</span>
                              </div>
                              {wl.overlappingTaskTitles.length > 0 && (
                                <div className="text-[10px] opacity-80 mt-0.5">
                                  冲突任务：{wl.overlappingTaskTitles.slice(0, 3).join('、')}{wl.overlappingTaskTitles.length > 3 ? '...' : ''}
                                </div>
                              )}
                            </div>
                            <div className={`w-2 h-2 rotate-45 mx-auto -mt-1 ${
                              wl.severity === 'danger' ? 'bg-red-950/95 border-r border-b border-red-500/40' : 'bg-amber-950/95 border-r border-b border-amber-500/40'
                            }`} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── CP Members ── */}
            {resources?.some(r => r.type === 'cp' && r.status !== 'departed') && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Building2 size={11} className="text-emerald-400" />
                  <span className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">CP 外包</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {resources?.filter(r => r.type === 'cp' && r.status !== 'departed').sort((a, b) => getRoleOrderIndex(a.role) - getRoleOrderIndex(b.role)).map(r => {
                    const isSelected = formData.assigneeIds?.includes(r.id!);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          const current = formData.assigneeIds || [];
                          const next = isSelected 
                            ? current.filter(id => id !== r.id)
                            : [...current, r.id!];
                          setFormData({ ...formData, assigneeIds: next });
                        }}
                        className={`px-3 py-1.5 rounded-lg text-sm transition-all duration-200 border relative ${
                          isSelected 
                            ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                            : 'bg-[#11111b]/80 border-white/[0.06] text-gray-400 hover:border-emerald-500/30 hover:bg-emerald-500/[0.04] hover:-translate-y-0.5'
                        }`}
                      >
                        <Building2 size={11} className="inline mr-1 -mt-0.5 opacity-60" />
                        {r.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* CP assignee: must select internal contact person */}
            {(() => {
              const selectedCpAssignees = (formData.assigneeIds || [])
                .map(id => resources?.find(r => r.id === id))
                .filter(r => r?.type === 'cp');
              const hasInternalAssignee = (formData.assigneeIds || [])
                .some(id => {
                  const r = resources?.find(res => res.id === id);
                  return r && r.type !== 'cp';
                });
              if (selectedCpAssignees.length > 0 && !hasInternalAssignee) {
                return (
                  <div className="mt-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle size={12} className="text-red-400 shrink-0" />
                      <span className="text-[11px] text-red-300 font-medium">
                        已选择 CP 负责人（{selectedCpAssignees.map(r => r?.name).join('、')}），请选择一名内部成员作为接口人
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {resources?.filter(r => r.type !== 'cp' && r.status !== 'departed').sort((a, b) => getRoleOrderIndex(a.role) - getRoleOrderIndex(b.role)).map(r => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => {
                            const current = formData.assigneeIds || [];
                            if (!current.includes(r.id!)) {
                              setFormData({ ...formData, assigneeIds: [...current, r.id!] });
                            }
                          }}
                          className="px-2.5 py-1 rounded-md text-[11px] border bg-indigo-500/10 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20 hover:-translate-y-0.5 transition-all"
                        >
                          {r.name} {r.role ? `(${r.role})` : ''}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              }
              return null;
            })()}

            {/* Smart Recommendation Panel */}
            {showRecommendations && recommendations.length > 0 && (
              <div className="mt-3 bg-gradient-to-b from-[#131320]/60 to-[#0d0d1a]/60 backdrop-blur-sm rounded-xl border border-violet-500/20 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowRecommendations(!showRecommendations)}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 text-[11px] font-semibold text-violet-300 hover:bg-violet-500/5 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Brain size={13} className="text-violet-400" />
                    <span>智能推荐结果</span>
                    <span className="text-[9px] text-gray-500 font-normal">基于技能·负载·可用性</span>
                  </div>
                  <ChevronUp size={13} />
                </button>
                <div className="px-3 pb-3 space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                  {recommendations.slice(0, 5).map((rec, idx) => (
                    <div
                      key={rec.resourceId}
                      onClick={() => {
                        const current = formData.assigneeIds || [];
                        if (!current.includes(rec.resourceId)) {
                          setFormData({ ...formData, assigneeIds: [...current, rec.resourceId] });
                        }
                      }}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all duration-200 hover:-translate-y-0.5 ${
                        formData.assigneeIds?.includes(rec.resourceId)
                          ? 'bg-indigo-500/15 border-indigo-500/40 ring-1 ring-indigo-500/20'
                          : getScoreBg(rec.totalScore)
                      }`}
                    >
                      {/* Rank badge */}
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 ${
                        idx === 0 ? 'bg-amber-500/20 text-amber-400' :
                        idx === 1 ? 'bg-gray-500/20 text-gray-300' :
                        'bg-gray-800/50 text-gray-500'
                      }`}>
                        {idx + 1}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-200">{rec.resource.name}</span>
                          <span className="text-[9px] text-gray-500">{rec.resource.role}</span>
                          <span className={`text-[9px] font-bold ml-auto ${getScoreColor(rec.totalScore)}`}>
                            {getScoreLabel(rec.totalScore)}
                          </span>
                        </div>
                        {/* Score bars */}
                        <div className="flex items-center gap-2 mt-1.5">
                          <div className="flex items-center gap-1 flex-1" title={`技能匹配: ${rec.skillScore}/40`}>
                            <Star size={8} className="text-amber-400 shrink-0" />
                            <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
                              <div className="h-full bg-amber-400/70 rounded-full transition-all" style={{ width: `${(rec.skillScore / 40) * 100}%` }} />
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-1" title={`负载评估: ${rec.workloadScore}/30`}>
                            <TrendingUp size={8} className="text-cyan-400 shrink-0" />
                            <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
                              <div className="h-full bg-cyan-400/70 rounded-full transition-all" style={{ width: `${(rec.workloadScore / 30) * 100}%` }} />
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-1" title={`可用性: ${rec.availabilityScore}/30`}>
                            <Clock size={8} className="text-emerald-400 shrink-0" />
                            <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-400/70 rounded-full transition-all" style={{ width: `${(rec.availabilityScore / 30) * 100}%` }} />
                            </div>
                          </div>
                          <span className={`text-[10px] font-bold font-mono tabular-nums shrink-0 ${getScoreColor(rec.totalScore)}`}>
                            {rec.totalScore}
                          </span>
                        </div>
                        {/* Reason tags */}
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {rec.reasons.map((reason, ri) => (
                            <span key={ri} className="text-[8px] px-1.5 py-0.5 rounded bg-gray-800/60 text-gray-500 border border-gray-700/30">
                              {reason}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">父任务</label>
              <select
                value={formData.parentId || ''}
                onChange={e => setFormData({ ...formData, parentId: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full bg-[#11111b] border border-gray-700/50 rounded-lg px-3.5 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all appearance-none"
              >
                <option value="">无 (作为顶层任务)</option>
                {allTasks?.filter(t => t.id !== editingTaskId).map(t => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">前置依赖</label>
              <div className="relative group">
                <select
                  multiple
                  size={3}
                  value={formData.dependencies?.map(String) || []}
                  onChange={e => {
                    const values = Array.from(e.target.selectedOptions, option => Number(option.value));
                    setFormData({ ...formData, dependencies: values });
                  }}
                  className="w-full bg-[#11111b] border border-gray-700/50 rounded-lg px-3.5 py-2 text-sm text-gray-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all min-h-[84px] custom-scrollbar"
                  title="按住 Ctrl (Win) 或 Cmd (Mac) 多选"
                >
                  {allTasks?.filter(t => t.id !== editingTaskId && t.id !== formData.parentId).map(t => (
                    <option key={t.id} value={t.id} title={t.title} className="truncate py-0.5">{t.title}</option>
                  ))}
                </select>
                <div className="absolute top-full left-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 text-[10px] text-gray-500 bg-gray-900 border border-gray-700 p-1.5 rounded-md shadow-xl w-full">
                  按住 Ctrl/Cmd 单击可多选，当前任务开始必须晚于前置任务结束
                </div>
              </div>
            </div>
          </div>

          {/* Task Notes / Remarks */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>
              备注说明
              <span className="text-gray-600 normal-case tracking-normal font-normal">(可记录任务相关的补充信息)</span>
            </label>
            <textarea
              value={formData.notes || ''}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
              placeholder="例如：该界面由XX负责蓝图制作，蓝图命名为 WBP_XXX..."
              rows={2}
              className="w-full bg-[#11111b] border border-gray-700/50 rounded-lg px-3.5 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all resize-none"
            />
          </div>

          {/* Blocked Status (Shadow Dependency) */}
          <div className="bg-rose-500/5 border border-rose-500/20 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <label className="flex items-center gap-2 text-sm font-medium text-rose-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isBlocked || false}
                  onChange={e => setFormData({ ...formData, isBlocked: e.target.checked, blockReason: e.target.checked ? formData.blockReason : '' })}
                  className="rounded border-rose-500/50 text-rose-500 focus:ring-rose-500 bg-gray-900"
                />
                标记为阻塞状态 (影子依赖)
              </label>
              <span className="text-[10px] text-rose-400/60">当任务有卡点时使用</span>
            </div>
            {formData.isBlocked && (
              <div>
                <input
                  type="text"
                  value={formData.blockReason || ''}
                  onChange={e => setFormData({ ...formData, blockReason: e.target.value })}
                  placeholder="请填写阻塞原因（例如：等待外部美术资源、等待策划案确认...）"
                  className="w-full bg-[#11111b] border border-rose-500/30 rounded-lg px-3.5 py-2 text-sm text-gray-200 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500 transition-all"
                />
              </div>
            )}
          </div>
          </div>
          {/* ═══ End of Steps ═══ */}

        </form>
        {/* Fixed footer buttons */}
        <div className="flex justify-between items-center px-5 py-3 border-t border-white/[0.06] bg-[#181825]/90 backdrop-blur-sm shrink-0">
            <div className="flex items-center gap-2">
              {editingTaskId && (
                <button
                  type="button"
                  onClick={handleDelete}
                  className="px-4 py-2 text-sm font-medium text-red-400 hover:text-white bg-red-500/10 hover:bg-red-500/80 rounded-lg transition-all duration-200 hover:-translate-y-0.5"
                >
                  删除任务
                </button>
              )}
            </div>
            <div className="flex gap-2">
              {activeStep > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveStep(activeStep - 1)}
                  className="px-3 py-2 text-sm font-medium text-gray-400 hover:text-white bg-white/[0.04] hover:bg-white/10 border border-white/[0.06] rounded-lg transition-all duration-200"
                >
                  ← 上一步
                </button>
              )}
              {activeStep < 3 && (
                <button
                  type="button"
                  onClick={() => setActiveStep(activeStep + 1)}
                  className="px-3 py-2 text-sm font-medium text-gray-300 hover:text-white bg-white/[0.06] hover:bg-white/10 border border-white/[0.06] rounded-lg transition-all duration-200"
                >
                  下一步 →
                </button>
              )}
              <button
                type="button"
                onClick={closeTaskModal}
                className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white bg-white/[0.06] hover:bg-white/10 border border-white/[0.06] rounded-lg transition-all duration-200"
              >
                取消
              </button>
              <button
                type="button"
                onClick={(e) => { const form = (e.target as HTMLElement).closest('.flex.flex-col')?.querySelector('form'); if (form) form.requestSubmit(); }}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-all duration-200 shadow-lg shadow-indigo-500/20"
              >
                保存
              </button>
            </div>
          </div>
      </div>
    </div>
  );
}
