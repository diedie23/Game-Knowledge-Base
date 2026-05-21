import React, { useState, useMemo, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Task } from '../db/db';
import { trackedDb } from '../store/useHistoryStore';
import { useStore } from '../store/useStore';
import { addDays, differenceInDays, format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import {
  Sparkles, Play, X, Check, AlertTriangle, Clock,
  ArrowRight, Ghost, RotateCcw, ChevronDown, ChevronUp,
  Search, CheckCircle2
} from 'lucide-react';
import { toast } from '../store/useToastStore';

// ─── Types ───────────────────────────────────────────────────────
export interface GhostSchedule {
  taskId: number;
  originalStart: Date;
  originalEnd: Date;
  newStart: Date;
  newEnd: Date;
  deltaDays: number;
  reason: string;
  isTrigger: boolean; // Whether this is the directly modified task
}

interface ScoredTask {
  task: Task;
  score: number;
  matchReason: string; // Human-readable explanation of why this task matched
}

interface ParsedCondition {
  type: 'delay' | 'advance' | 'extend' | 'shrink';
  targetKeyword: string;
  days: number;
  matchedTasks: Task[];
  /** All candidate tasks with scores, for disambiguation UI */
  candidates: ScoredTask[];
}

// ─── Smart Tokenizer ─────────────────────────────────────────────
/** Split a keyword into meaningful tokens for fuzzy matching */
function tokenize(text: string): string[] {
  const lower = text.toLowerCase().replace(/[的了是在]+/g, ' ').trim();
  // Split by common delimiters: spaces, punctuation, CJK/Latin boundary
  const tokens = lower
    .split(/[\s,，、;；·\-_/|()（）【】\[\]]+/)
    .filter(t => t.length > 0);
  // If the whole string is short and didn't split, return as-is
  if (tokens.length <= 1 && lower.length > 2) {
    // Try splitting CJK from Latin (e.g. "背包ui设计" → ["背包", "ui", "设计"])
    const cjkLatinSplit = lower.match(/[\u4e00-\u9fff]+|[a-z0-9]+/gi) || [lower];
    if (cjkLatinSplit.length > 1) return cjkLatinSplit.filter(t => t.length > 0);
  }
  return tokens;
}

// ─── Fuzzy Task Matcher ──────────────────────────────────────────
/** Score how well a task matches the keyword, considering parent context */
function scoreTaskMatch(
  task: Task,
  keyword: string,
  tokens: string[],
  taskMap: Map<number, Task>
): ScoredTask | null {
  // Only consider tasks with valid date ranges
  if (!task.startDate || isNaN(new Date(task.startDate).getTime()) ||
      !task.endDate || isNaN(new Date(task.endDate).getTime())) return null;

  const titleLower = task.title.toLowerCase();
  const keywordLower = keyword.toLowerCase();
  let score = 0;
  const reasons: string[] = [];

  // Build full context string: parent title + task title
  const parent = task.parentId ? taskMap.get(task.parentId) : null;
  const parentTitle = parent?.title?.toLowerCase() || '';
  const fullContext = parentTitle ? `${parentTitle} ${titleLower}` : titleLower;

  // 1. Exact full match (highest priority)
  if (titleLower === keywordLower) {
    score += 100;
    reasons.push('精确匹配');
  }
  // 2. Title contains full keyword
  else if (titleLower.includes(keywordLower)) {
    score += 80;
    reasons.push('标题包含关键词');
  }
  // 3. Keyword contains full title (e.g. keyword="背包ui设计", title="UI设计")
  else if (keywordLower.includes(titleLower) && titleLower.length >= 2) {
    score += 60;
    reasons.push('关键词包含标题');
  }
  // 4. Full context (parent + title) contains keyword
  else if (fullContext.includes(keywordLower)) {
    score += 70;
    reasons.push('父任务+标题匹配');
  }

  // 5. Token-based matching: check how many tokens match in title or parent+title
  if (tokens.length > 1) {
    let titleTokenHits = 0;
    let contextTokenHits = 0;
    for (const token of tokens) {
      if (titleLower.includes(token)) titleTokenHits++;
      if (fullContext.includes(token)) contextTokenHits++;
    }

    // All tokens match in title
    if (titleTokenHits === tokens.length && score < 75) {
      score = Math.max(score, 75);
      reasons.push(`标题匹配全部分词(${titleTokenHits}/${tokens.length})`);
    }
    // All tokens match across parent+title context
    else if (contextTokenHits === tokens.length && score < 65) {
      score = Math.max(score, 65);
      reasons.push(`父任务+标题匹配全部分词(${contextTokenHits}/${tokens.length})`);
    }
    // Partial token match in context
    else if (contextTokenHits > 0 && score < 30) {
      score = Math.max(score, 15 * contextTokenHits);
      reasons.push(`部分分词匹配(${contextTokenHits}/${tokens.length})`);
    }
  }

  // 6. Single token fallback: if keyword is a single token, try substring match
  if (tokens.length === 1 && score === 0) {
    const token = tokens[0];
    if (titleLower.includes(token)) {
      score = 50;
      reasons.push('子串匹配');
    } else if (fullContext.includes(token)) {
      score = 35;
      reasons.push('父任务上下文子串匹配');
    }
  }

  // Bonus: prefer leaf tasks (non-parent) over parent tasks for direct manipulation
  const isParent = Array.from(taskMap.values()).some(t => t.parentId === task.id);
  if (isParent && score > 0) {
    score -= 10; // Slightly deprioritize parent tasks
    reasons.push('(父任务)');
  }

  if (score <= 0) return null;

  return {
    task,
    score,
    matchReason: reasons.join(' + '),
  };
}

// ─── Natural Language Parser ─────────────────────────────────────
function parseCondition(input: string, tasks: Task[]): ParsedCondition | null {
  const normalized = input.trim().toLowerCase();

  // Pattern: "如果XXX延期N天" / "XXX推迟N天" / "XXX延后N天"
  const delayPatterns = [
    /(?:如果)?(.+?)(?:延期|推迟|延后|晚了|拖延)(\d+)天/,
    /(?:如果)?(.+?)delay\s*(\d+)\s*days?/i,
    /(?:如果)?(.+?)(?:延期|推迟|延后)(\d+)(?:个工作)?日/,
  ];

  // Pattern: "如果XXX提前N天" / "XXX提前完成N天"
  const advancePatterns = [
    /(?:如果)?(.+?)(?:提前|提早|早了)(\d+)天/,
    /(?:如果)?(.+?)advance\s*(\d+)\s*days?/i,
  ];

  // Pattern: "如果XXX工期增加N天" / "XXX多花N天"
  const extendPatterns = [
    /(?:如果)?(.+?)(?:工期增加|多花|多用|增加)(\d+)天/,
    /(?:如果)?(.+?)extend\s*(\d+)\s*days?/i,
  ];

  // Pattern: "如果XXX工期缩短N天" / "XXX少花N天"
  const shrinkPatterns = [
    /(?:如果)?(.+?)(?:工期缩短|少花|少用|缩短|压缩)(\d+)天/,
    /(?:如果)?(.+?)shrink\s*(\d+)\s*days?/i,
  ];

  // Build task map for parent lookups
  const taskMap = new Map<number, Task>();
  tasks.forEach(t => { if (t.id != null) taskMap.set(t.id, t); });

  const tryMatch = (patterns: RegExp[], type: ParsedCondition['type']): ParsedCondition | null => {
    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (match) {
        const keyword = match[1].trim().replace(/[的了]/g, '');
        const days = parseInt(match[2], 10);
        if (isNaN(days) || days <= 0) return null;

        // Tokenize keyword for smart matching
        const tokens = tokenize(keyword);

        // Score all tasks
        const candidates: ScoredTask[] = [];
        for (const t of tasks) {
          const scored = scoreTaskMatch(t, keyword, tokens, taskMap);
          if (scored) candidates.push(scored);
        }

        // Sort by score descending
        candidates.sort((a, b) => b.score - a.score);

        // Auto-select: if top candidate has significantly higher score, use it directly
        // Otherwise present candidates for user selection
        let matchedTasks: Task[] = [];
        if (candidates.length === 1) {
          matchedTasks = [candidates[0].task];
        } else if (candidates.length > 1) {
          const topScore = candidates[0].score;
          // If top score is very high (>=80) and significantly above 2nd, auto-select
          if (topScore >= 80 && topScore - candidates[1].score >= 20) {
            matchedTasks = [candidates[0].task];
          }
          // Otherwise leave matchedTasks empty to trigger disambiguation UI
        }

        return { type, targetKeyword: keyword, days, matchedTasks, candidates };
      }
    }
    return null;
  };

  return (
    tryMatch(delayPatterns, 'delay') ||
    tryMatch(advancePatterns, 'advance') ||
    tryMatch(extendPatterns, 'extend') ||
    tryMatch(shrinkPatterns, 'shrink')
  );
}

// ─── Cascade Impact Calculator ───────────────────────────────────
function calculateCascadeImpact(
  condition: ParsedCondition,
  allTasks: Task[]
): GhostSchedule[] {
  const ghosts: GhostSchedule[] = [];
  const taskMap = new Map<number, Task>();
  allTasks.forEach(t => taskMap.set(t.id!, t));

  // Track which tasks have been shifted and by how many days
  const shiftMap = new Map<number, number>();

  // Step 1: Apply direct changes to matched tasks
  condition.matchedTasks.forEach(task => {
    let deltaStart = 0;
    let deltaEnd = 0;

    switch (condition.type) {
      case 'delay':
        deltaStart = condition.days;
        deltaEnd = condition.days;
        break;
      case 'advance':
        deltaStart = -condition.days;
        deltaEnd = -condition.days;
        break;
      case 'extend':
        deltaEnd = condition.days;
        break;
      case 'shrink':
        deltaEnd = -condition.days;
        break;
    }

    const newStart = addDays(task.startDate!, deltaStart);
    const newEnd = addDays(task.endDate!, deltaEnd);

    ghosts.push({
      taskId: task.id!,
      originalStart: task.startDate!,
      originalEnd: task.endDate!,
      newStart,
      newEnd,
      deltaDays: deltaEnd,
      reason: `直接${condition.type === 'delay' ? '延期' : condition.type === 'advance' ? '提前' : condition.type === 'extend' ? '工期增加' : '工期缩短'} ${condition.days} 天`,
      isTrigger: true,
    });

    shiftMap.set(task.id!, deltaEnd);
  });

  // Step 2: Propagate cascade to dependent tasks (BFS)
  const queue = [...condition.matchedTasks.map(t => t.id!)];
  const visited = new Set<number>(queue);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentShift = shiftMap.get(currentId) || 0;
    const currentTask = taskMap.get(currentId);
    if (!currentTask || !currentTask.startDate || isNaN(new Date(currentTask.startDate).getTime()) || !currentTask.endDate || isNaN(new Date(currentTask.endDate).getTime())) continue;

    // Find tasks that depend on currentId
    const dependents = allTasks.filter(t =>
      t.dependencies?.includes(currentId) && !visited.has(t.id!)
    );

    dependents.forEach(depTask => {
      if (!depTask.startDate || isNaN(new Date(depTask.startDate).getTime()) || !depTask.endDate || isNaN(new Date(depTask.endDate).getTime())) return;
      // Calculate the new end date of the upstream task
      const upstreamNewEnd = addDays(currentTask.endDate!, currentShift);

      // Calculate original gap between upstream end and downstream start
      const originalGap = differenceInDays(depTask.startDate, currentTask.endDate!);

      if (currentShift > 0) {
        // Delay: if downstream starts before upstream's new end, it needs to shift forward
        if (depTask.startDate <= upstreamNewEnd) {
          const newStart = addDays(upstreamNewEnd, Math.max(originalGap, 0));
          const duration = differenceInDays(depTask.endDate, depTask.startDate);
          const newEnd = addDays(newStart, duration);
          const delta = differenceInDays(newEnd, depTask.endDate);

          if (delta !== 0) {
            ghosts.push({
              taskId: depTask.id!,
              originalStart: depTask.startDate,
              originalEnd: depTask.endDate,
              newStart,
              newEnd,
              deltaDays: delta,
              reason: `受「${currentTask.title}」影响，顺延 ${delta} 天`,
              isTrigger: false,
            });

            shiftMap.set(depTask.id!, delta);
            visited.add(depTask.id!);
            queue.push(depTask.id!);
          }
        }
      } else {
        // Advance: pull downstream forward by the same amount to maintain relative position
        const duration = differenceInDays(depTask.endDate, depTask.startDate);
        const newStart = addDays(depTask.startDate, currentShift);
        const newEnd = addDays(newStart, duration);
        const delta = currentShift;

        if (delta !== 0) {
          ghosts.push({
            taskId: depTask.id!,
            originalStart: depTask.startDate,
            originalEnd: depTask.endDate,
            newStart,
            newEnd,
            deltaDays: delta,
            reason: `受「${currentTask.title}」影响，提前 ${Math.abs(delta)} 天`,
            isTrigger: false,
          });

          shiftMap.set(depTask.id!, delta);
          visited.add(depTask.id!);
          queue.push(depTask.id!);
        }
      }
    });

    // Also propagate to sibling tasks under the same parent (sequential logic)
    if (currentTask.parentId) {
      const siblings = allTasks
        .filter(t => t.parentId === currentTask.parentId && t.id !== currentId && !visited.has(t.id!) && t.startDate && !isNaN(new Date(t.startDate).getTime()) && t.endDate && !isNaN(new Date(t.endDate).getTime()))
        .sort((a, b) => new Date(a.startDate!).getTime() - new Date(b.startDate!).getTime());

      siblings.forEach(sibling => {
        const currentNewEnd = addDays(currentTask.endDate!, currentShift);
        const gap = differenceInDays(sibling.startDate!, currentTask.endDate!);

        if (currentShift > 0) {
          // Delay: if sibling starts right after or overlaps with current task
          if (sibling.startDate! <= currentNewEnd && sibling.startDate! >= currentTask.startDate!) {
            const newStart = addDays(currentNewEnd, Math.max(gap, 0));
            const duration = differenceInDays(sibling.endDate!, sibling.startDate!);
            const newEnd = addDays(newStart, duration);
            const delta = differenceInDays(newEnd, sibling.endDate!);

            if (delta > 0) {
              ghosts.push({
                taskId: sibling.id!,
                originalStart: sibling.startDate!,
                originalEnd: sibling.endDate!,
                newStart,
                newEnd,
                deltaDays: delta,
                reason: `同组任务「${currentTask.title}」延期，顺延 ${delta} 天`,
                isTrigger: false,
              });

              shiftMap.set(sibling.id!, delta);
              visited.add(sibling.id!);
              queue.push(sibling.id!);
            }
          }
        } else {
          // Advance: if sibling starts right after current task, pull it forward
          if (gap >= 0 && gap <= 1 && sibling.startDate! > currentTask.startDate!) {
            const newStart = addDays(currentNewEnd, gap);
            const duration = differenceInDays(sibling.endDate!, sibling.startDate!);
            const newEnd = addDays(newStart, duration);
            const delta = differenceInDays(newEnd, sibling.endDate!);

            if (delta < 0) {
              ghosts.push({
                taskId: sibling.id!,
                originalStart: sibling.startDate!,
                originalEnd: sibling.endDate!,
                newStart,
                newEnd,
                deltaDays: delta,
                reason: `同组任务「${currentTask.title}」提前，提前 ${Math.abs(delta)} 天`,
                isTrigger: false,
              });

              shiftMap.set(sibling.id!, delta);
              visited.add(sibling.id!);
              queue.push(sibling.id!);
            }
          }
        }
      });
    }
  }

  // Step 3: Update parent task ranges
  const parentIds = new Set<number>();
  ghosts.forEach(g => {
    const task = taskMap.get(g.taskId);
    if (task?.parentId) parentIds.add(task.parentId);
  });

  parentIds.forEach(parentId => {
    if (visited.has(parentId)) return;
    const parent = taskMap.get(parentId);
    if (!parent) return;
    if (!parent.startDate || isNaN(new Date(parent.startDate).getTime()) || !parent.endDate || isNaN(new Date(parent.endDate).getTime())) return;

    const children = allTasks.filter(t => t.parentId === parentId);
    const childGhosts = ghosts.filter(g => children.some(c => c.id === g.taskId));

    if (childGhosts.length > 0) {
      let earliestStart = parent.startDate!;
      let latestEnd = parent.endDate!;

      children.forEach(child => {
        const ghost = childGhosts.find(g => g.taskId === child.id);
        const start = ghost ? ghost.newStart : child.startDate;
        const end = ghost ? ghost.newEnd : child.endDate;
        if (start && start < earliestStart) earliestStart = start;
        if (end && end > latestEnd) latestEnd = end;
      });

      if (latestEnd > parent.endDate! || earliestStart < parent.startDate!) {
        const delta = differenceInDays(latestEnd, parent.endDate!);
        ghosts.push({
          taskId: parentId,
          originalStart: parent.startDate!,
          originalEnd: parent.endDate!,
          newStart: earliestStart < parent.startDate! ? earliestStart : parent.startDate!,
          newEnd: latestEnd,
          deltaDays: delta,
          reason: `子任务延期导致整体工期延长 ${delta} 天`,
          isTrigger: false,
        });
      }
    }
  });

  return ghosts;
}

// ─── Dynamic Preset Generator ────────────────────────────────────
const FALLBACK_PRESETS = [
  '如果交互延期2天',
  '如果UI设计延期3天',
  '如果开发延期1天',
];

function generatePresets(tasks: Task[]): string[] {
  // Find leaf tasks (non-parent) that have valid dates and are not completed
  const parentIds = new Set(tasks.filter(t => t.parentId).map(t => t.parentId!));
  const leafTasks = tasks.filter(t =>
    t.id != null &&
    !parentIds.has(t.id) &&
    t.startDate && !isNaN(new Date(t.startDate).getTime()) &&
    t.endDate && !isNaN(new Date(t.endDate).getTime()) &&
    t.status !== 'done'
  );

  if (leafTasks.length === 0) return FALLBACK_PRESETS;

  // Pick up to 5 representative tasks, prefer in-progress or upcoming
  const now = new Date();
  const scored = leafTasks.map(t => {
    let priority = 0;
    if (t.status === 'in_progress') priority += 10;
    if (t.endDate && t.endDate >= now) priority += 5;
    // Prefer tasks with shorter titles for cleaner presets
    if (t.title.length <= 8) priority += 3;
    return { task: t, priority };
  }).sort((a, b) => b.priority - a.priority);

  const selected = scored.slice(0, 5);
  const actions = ['延期1天', '延期2天', '延期3天', '提前1天', '工期增加2天'];

  return selected.map((s, i) => {
    const parent = s.task.parentId ? tasks.find(t => t.id === s.task.parentId) : null;
    // Build a concise label: if parent has a short distinguishing keyword, include it
    let label = s.task.title;
    if (parent) {
      // Extract a short context from parent (e.g. "背包" from "...编辑界面（背包）...")
      const parenMatch = parent.title.match(/[（(]([^）)]{1,6})[）)]/); 
      if (parenMatch) {
        label = `${parenMatch[1]}${s.task.title}`;
      }
    }
    return `如果${label}${actions[i % actions.length]}`;
  });
}

// ─── Component ───────────────────────────────────────────────────
interface WhatIfPanelProps {
  onGhostScheduleChange: (ghosts: GhostSchedule[]) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function WhatIfPanel({ onGhostScheduleChange, isOpen, onClose }: WhatIfPanelProps) {
  const { selectedProjectId } = useStore();
  const tasks = useLiveQuery(
    () => selectedProjectId
      ? db.tasks.where('projectId').equals(selectedProjectId).toArray()
      : db.tasks.toArray(),
    [selectedProjectId]
  ) || [];
  const [input, setInput] = useState('');
  const [condition, setCondition] = useState<ParsedCondition | null>(null);
  const [ghosts, setGhosts] = useState<GhostSchedule[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showDetails, setShowDetails] = useState(true);
  const [error, setError] = useState('');
  // Disambiguation: when multiple tasks match, show selection UI
  const [showCandidates, setShowCandidates] = useState(false);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<number>>(new Set());
  const [pendingCondition, setPendingCondition] = useState<ParsedCondition | null>(null);

  // Dynamic presets based on actual tasks
  const presets = useMemo(() => generatePresets(tasks), [tasks]);

  // Run cascade with given matched tasks
  const runCascade = useCallback((parsed: ParsedCondition, selectedTasks: Task[]) => {
    const finalCondition = { ...parsed, matchedTasks: selectedTasks };
    setCondition(finalCondition);
    const result = calculateCascadeImpact(finalCondition, tasks);
    setGhosts(result);
    onGhostScheduleChange(result);
    setShowCandidates(false);
    setPendingCondition(null);
    setSelectedCandidateIds(new Set());
  }, [tasks, onGhostScheduleChange]);

  const handleAnalyze = useCallback(() => {
    if (!input.trim()) return;
    setIsAnalyzing(true);
    setError('');
    setShowCandidates(false);
    setPendingCondition(null);

    // Simulate brief analysis delay for UX feel
    setTimeout(() => {
      const parsed = parseCondition(input, tasks);
      if (!parsed) {
        setError('无法解析输入条件。请尝试类似 "如果交互延期2天" 的格式。');
        setCondition(null);
        setGhosts([]);
        onGhostScheduleChange([]);
        setIsAnalyzing(false);
        return;
      }

      if (parsed.candidates.length === 0) {
        setError(`未找到包含「${parsed.targetKeyword}」的任务。请尝试更精确的任务名称。`);
        setCondition(null);
        setGhosts([]);
        onGhostScheduleChange([]);
        setIsAnalyzing(false);
        return;
      }

      // If auto-matched (single high-confidence result), run directly
      if (parsed.matchedTasks.length > 0) {
        runCascade(parsed, parsed.matchedTasks);
        setIsAnalyzing(false);
        return;
      }

      // Multiple candidates: show disambiguation UI
      setPendingCondition(parsed);
      setShowCandidates(true);
      // Pre-select the top candidate
      const topId = parsed.candidates[0]?.task.id;
      setSelectedCandidateIds(topId != null ? new Set([topId]) : new Set());
      setIsAnalyzing(false);
    }, 400);
  }, [input, tasks, onGhostScheduleChange, runCascade]);

  // Handle candidate selection confirmation
  const handleConfirmCandidates = useCallback(() => {
    if (!pendingCondition || selectedCandidateIds.size === 0) return;
    const selectedTasks = pendingCondition.candidates
      .filter(c => c.task.id != null && selectedCandidateIds.has(c.task.id!))
      .map(c => c.task);
    if (selectedTasks.length === 0) return;
    runCascade(pendingCondition, selectedTasks);
  }, [pendingCondition, selectedCandidateIds, runCascade]);

  // Toggle candidate selection
  const toggleCandidate = useCallback((taskId: number) => {
    setSelectedCandidateIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  const handleApply = useCallback(async () => {
    if (ghosts.length === 0) return;

    // Generate AI-style change log
    let changeLog = '🤖 **排期变更指令 (Schedule CLI)**\n\n';
    
    const triggers = ghosts.filter(g => g.isTrigger);
    const cascades = ghosts.filter(g => !g.isTrigger);

    triggers.forEach(trigger => {
      const task = tasks.find(t => t.id === trigger.taskId);
      if (task) {
        changeLog += `**[排期变更]** ${task.title}：${trigger.deltaDays > 0 ? '延期' : '提前'}至 ${format(trigger.newEnd, 'MM/dd')} (${trigger.deltaDays > 0 ? '+' : ''}${trigger.deltaDays}天)\n`;
        changeLog += `> ⚠️ 原因：${trigger.reason}\n`;
      }
    });

    if (cascades.length > 0) {
      changeLog += `\n**[级联影响]** 共影响 ${cascades.length} 个下游任务：\n`;
      cascades.forEach(cascade => {
        const task = tasks.find(t => t.id === cascade.taskId);
        if (task) {
          changeLog += `- ${task.title}：${cascade.deltaDays > 0 ? '顺延' : '提前'} ${Math.abs(cascade.deltaDays)} 天 (至 ${format(cascade.newEnd, 'MM/dd')})\n`;
        }
      });
    }

    // Copy to clipboard
    try {
      await navigator.clipboard.writeText(changeLog);
      toast.success('变更日志已生成并复制到剪贴板！');
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }

    for (const ghost of ghosts) {
      await trackedDb.tasks.update(
        ghost.taskId,
        { startDate: ghost.newStart, endDate: ghost.newEnd },
        `What-If 推演应用: ${ghost.reason}`
      );
    }

    // Clear state
    setGhosts([]);
    setCondition(null);
    setInput('');
    onGhostScheduleChange([]);
    onClose();
  }, [ghosts, tasks, onGhostScheduleChange, onClose]);

  const handleReset = useCallback(() => {
    setGhosts([]);
    setCondition(null);
    setInput('');
    setError('');
    setShowCandidates(false);
    setPendingCondition(null);
    setSelectedCandidateIds(new Set());
    onGhostScheduleChange([]);
  }, [onGhostScheduleChange]);

  const handlePreset = useCallback((preset: string) => {
    setInput(preset);
    setError('');
  }, []);

  // Summary stats
  const totalAffected = ghosts.filter(g => !g.isTrigger).length;
  const maxDelay = ghosts.length > 0 ? Math.max(...ghosts.map(g => g.deltaDays)) : 0;
  const triggerTasks = ghosts.filter(g => g.isTrigger);
  const cascadeTasks = ghosts.filter(g => !g.isTrigger);

  if (!isOpen) return null;

  return (
    <div className="absolute top-14 right-4 z-40 w-[420px] max-h-[calc(100vh-120px)] flex flex-col bg-[#13152080] backdrop-blur-2xl border border-white/[0.08] rounded-2xl shadow-[0_24px_80px_rgba(0,0,0,0.6)] overflow-hidden animate-in slide-in-from-top-2">
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/[0.06] bg-gradient-to-r from-violet-600/10 to-indigo-600/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/30 to-indigo-500/30 flex items-center justify-center border border-violet-400/20">
              <Ghost size={16} className="text-violet-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-100">What-If 排期推演</h3>
              <p className="text-[10px] text-gray-500 mt-0.5">输入假设条件，预测连锁影响</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/5 text-gray-500 hover:text-gray-300 transition-colors">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Input Area */}
      <div className="px-5 py-4 border-b border-white/[0.04]">
        <div className="relative">
          <Sparkles size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-violet-400/60" />
          <input
            type="text"
            value={input}
            onChange={e => { setInput(e.target.value); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
            placeholder="例如：如果交互延期2天..."
            className="w-full pl-9 pr-20 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-violet-500/40 focus:ring-1 focus:ring-violet-500/20 transition-all"
          />
          <button
            onClick={handleAnalyze}
            disabled={!input.trim() || isAnalyzing}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-violet-600/80 hover:bg-violet-500/80 disabled:bg-gray-700/50 disabled:text-gray-600 text-white text-xs font-medium rounded-lg transition-all flex items-center gap-1.5"
          >
            {isAnalyzing ? (
              <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Play size={11} />
            )}
            推演
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="mt-2.5 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2">
            <AlertTriangle size={13} className="text-red-400 mt-0.5 shrink-0" />
            <span className="text-xs text-red-300">{error}</span>
          </div>
        )}

        {/* Preset suggestions */}
        {ghosts.length === 0 && !error && !showCandidates && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {presets.map(preset => (
              <button
                key={preset}
                onClick={() => handlePreset(preset)}
                className="px-2.5 py-1 bg-white/[0.03] hover:bg-violet-500/10 border border-white/[0.06] hover:border-violet-500/20 rounded-lg text-[10px] text-gray-500 hover:text-violet-300 transition-all"
              >
                {preset}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ─── Candidate Disambiguation UI ─── */}
      {showCandidates && pendingCondition && pendingCondition.candidates.length > 0 && (
        <div className="border-b border-white/[0.04]">
          <div className="px-5 py-3 bg-gradient-to-r from-blue-600/5 to-violet-600/5">
            <div className="flex items-center gap-2 mb-2">
              <Search size={13} className="text-blue-400" />
              <span className="text-xs text-gray-300 font-medium">
                找到 {pendingCondition.candidates.length} 个匹配任务，请选择要推演的任务：
              </span>
            </div>
            <div className="space-y-1 max-h-[200px] overflow-y-auto">
              {pendingCondition.candidates.slice(0, 10).map(candidate => {
                const parent = candidate.task.parentId
                  ? tasks.find(t => t.id === candidate.task.parentId)
                  : null;
                const isSelected = candidate.task.id != null && selectedCandidateIds.has(candidate.task.id!);
                return (
                  <button
                    key={candidate.task.id}
                    onClick={() => candidate.task.id != null && toggleCandidate(candidate.task.id!)}
                    className={`w-full text-left px-3 py-2 rounded-lg border transition-all flex items-start gap-2.5 ${
                      isSelected
                        ? 'bg-violet-500/15 border-violet-500/30'
                        : 'bg-white/[0.02] border-white/[0.05] hover:bg-white/[0.04] hover:border-white/[0.08]'
                    }`}
                  >
                    {/* Checkbox */}
                    <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
                      isSelected
                        ? 'bg-violet-500 border-violet-400'
                        : 'border-gray-600 bg-transparent'
                    }`}>
                      {isSelected && <Check size={10} className="text-white" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-200 font-medium truncate">
                          {candidate.task.title}
                        </span>
                        {/* Score badge */}
                        <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                          candidate.score >= 70
                            ? 'bg-green-500/15 text-green-400'
                            : candidate.score >= 40
                            ? 'bg-yellow-500/15 text-yellow-400'
                            : 'bg-gray-500/15 text-gray-500'
                        }`}>
                          {candidate.score >= 70 ? '高匹配' : candidate.score >= 40 ? '中匹配' : '低匹配'}
                        </span>
                      </div>
                      {/* Parent context + match reason */}
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {parent && (
                          <span className="text-[10px] text-gray-600 truncate max-w-[180px]">
                            📁 {parent.title}
                          </span>
                        )}
                        <span className="text-[10px] text-gray-700">·</span>
                        <span className="text-[10px] text-violet-400/60 truncate">
                          {candidate.matchReason}
                        </span>
                      </div>
                      {/* Date range */}
                      {candidate.task.startDate && candidate.task.endDate && (
                        <div className="text-[10px] text-gray-600 mt-0.5">
                          {format(candidate.task.startDate, 'MM/dd')} - {format(candidate.task.endDate, 'MM/dd')}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            {/* Confirm button */}
            <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-white/[0.04]">
              <span className="text-[10px] text-gray-600">
                已选 {selectedCandidateIds.size} 个任务
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setShowCandidates(false); setPendingCondition(null); }}
                  className="px-2.5 py-1 text-[10px] text-gray-500 hover:text-gray-300 hover:bg-white/5 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleConfirmCandidates}
                  disabled={selectedCandidateIds.size === 0}
                  className="flex items-center gap-1 px-3 py-1 bg-violet-600/80 hover:bg-violet-500/80 disabled:bg-gray-700/50 disabled:text-gray-600 text-white text-[10px] font-medium rounded-lg transition-all"
                >
                  <CheckCircle2 size={11} />
                  确认推演
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {ghosts.length > 0 && (
        <div className="flex-1 overflow-y-auto">
          {/* Impact Summary */}
          <div className="px-5 py-3 border-b border-white/[0.04] bg-gradient-to-r from-amber-600/5 to-red-600/5">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                <span className="text-[11px] text-gray-400">触发任务</span>
                <span className="text-sm font-bold text-violet-300">{triggerTasks.length}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-[11px] text-gray-400">受影响</span>
                <span className="text-sm font-bold text-amber-300">{totalAffected}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock size={11} className="text-red-400" />
                <span className="text-[11px] text-gray-400">最大延期</span>
                <span className="text-sm font-bold text-red-300">{maxDelay}天</span>
              </div>
            </div>
          </div>

          {/* Detailed Impact List */}
          <div className="px-5 py-3">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-300 transition-colors mb-2"
            >
              {showDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              影响详情 ({ghosts.length} 项)
            </button>

            {showDetails && (
              <div className="space-y-1.5">
                {ghosts.map(ghost => {
                  const task = tasks.find(t => t.id === ghost.taskId);
                  return (
                    <div
                      key={ghost.taskId}
                      className={`px-3 py-2.5 rounded-lg border transition-all ${
                        ghost.isTrigger
                          ? 'bg-violet-500/10 border-violet-500/20'
                          : 'bg-white/[0.02] border-white/[0.05] hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          {ghost.isTrigger ? (
                            <Sparkles size={12} className="text-violet-400 shrink-0" />
                          ) : (
                            <ArrowRight size={12} className="text-amber-400 shrink-0" />
                          )}
                          <span className="text-xs text-gray-300 truncate font-medium">
                            {task?.title || `任务 #${ghost.taskId}`}
                          </span>
                        </div>
                        <span className={`text-[10px] font-bold shrink-0 ml-2 px-1.5 py-0.5 rounded ${
                          ghost.deltaDays > 0
                            ? 'text-red-300 bg-red-500/15'
                            : 'text-green-300 bg-green-500/15'
                        }`}>
                          {ghost.deltaDays > 0 ? '+' : ''}{ghost.deltaDays}天
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-gray-600">
                        <span>{format(ghost.originalEnd, 'MM/dd')}</span>
                        <ArrowRight size={9} className="text-gray-700" />
                        <span className={ghost.deltaDays > 0 ? 'text-red-400' : 'text-green-400'}>
                          {format(ghost.newEnd, 'MM/dd')}
                        </span>
                        <span className="text-gray-700 mx-1">|</span>
                        <span className="text-gray-600 truncate">{ghost.reason}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action Bar */}
      {ghosts.length > 0 && (
        <div className="px-5 py-3 border-t border-white/[0.06] bg-[#0d0f18]/80 flex items-center justify-between">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 hover:bg-white/5 rounded-lg transition-colors"
          >
            <RotateCcw size={12} />
            重置
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 hover:bg-white/5 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleApply}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-xs font-medium rounded-lg transition-all shadow-lg shadow-violet-500/20"
            >
              <Check size={12} />
              应用推演结果
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
