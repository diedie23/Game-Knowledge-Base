import { db } from '../db/db';
import type { Task, Resource } from '../types';
import { addDays, startOfToday, isWeekend, differenceInDays, format } from 'date-fns';
import { isHoliday, isWorkingDay } from '../utils/dateUtils';

// ─── Skill / Role Mapping ────────────────────────────────────────
// Maps task title keywords to required skill categories
const SKILL_KEYWORDS: { keywords: string[]; skill: string }[] = [
  { keywords: ['交互', 'UX', 'ux'], skill: 'interaction_design' },
  { keywords: ['UI设计', 'UI', 'ui', '视觉'], skill: 'ui_design' },
  { keywords: ['功能蓝图', '功能', '产品'], skill: 'product' },
  { keywords: ['正式蓝图', '蓝图', '开发', '编码', 'Dev'], skill: 'development' },
  { keywords: ['动效', '动画', 'Motion'], skill: 'motion_design' },
  { keywords: ['测试', 'QA', 'Test'], skill: 'testing' },
  { keywords: ['Layout', 'layout', '布局'], skill: 'layout' },
  { keywords: ['UE', 'ue', '引擎'], skill: 'ue_development' },
];

// Maps resource roles to skill categories they can handle
const ROLE_SKILL_MAP: Record<string, string[]> = {
  'Designer': ['interaction_design', 'ui_design', 'motion_design'],
  'UI设计': ['ui_design', 'interaction_design', 'motion_design'],
  'UX设计': ['interaction_design', 'ui_design'],
  'Product': ['product', 'interaction_design'],
  'Developer': ['development', 'ue_development', 'testing'],
  'Layout': ['layout', 'development'],
  'UE设计': ['ue_development', 'development'],
  'QA': ['testing'],
};

const isWorkday = (date: Date) => isWorkingDay(date);

// ─── Types ───────────────────────────────────────────────────────
export interface RecommendationScore {
  resourceId: number;
  resource: Resource;
  totalScore: number; // 0-100 composite score
  skillScore: number; // 0-40 skill match
  workloadScore: number; // 0-30 current workload (lower load = higher score)
  availabilityScore: number; // 0-30 availability during task period
  reasons: string[]; // Human-readable explanation
  currentTaskCount: number;
  activeTaskCount: number;
  freeDaysInPeriod: number;
  totalWorkdaysInPeriod: number;
}

// ─── Core Engine ─────────────────────────────────────────────────
export class SmartAssignService {

  /**
   * Detect required skill from task title
   */
  detectRequiredSkill(taskTitle: string): string | null {
    for (const entry of SKILL_KEYWORDS) {
      if (entry.keywords.some(kw => taskTitle.includes(kw))) {
        return entry.skill;
      }
    }
    return null;
  }

  /**
   * Get skills a resource can handle based on their role
   */
  getResourceSkills(resource: Resource): string[] {
    // Try exact match first
    if (ROLE_SKILL_MAP[resource.role]) {
      return ROLE_SKILL_MAP[resource.role];
    }
    // Try partial match
    for (const [role, skills] of Object.entries(ROLE_SKILL_MAP)) {
      if (resource.role.includes(role) || role.includes(resource.role)) {
        return skills;
      }
    }
    return [];
  }

  /**
   * Calculate skill match score (0-40)
   */
  calcSkillScore(resource: Resource, taskTitle: string, allTasks: Task[]): { score: number; reason: string } {
    const requiredSkill = this.detectRequiredSkill(taskTitle);
    const resourceSkills = this.getResourceSkills(resource);

    // Direct skill match
    if (requiredSkill && resourceSkills.includes(requiredSkill)) {
      return { score: 40, reason: `技能完全匹配 (${resource.role})` };
    }

    // Historical match: has this person done similar tasks before?
    const pastSimilarTasks = allTasks.filter(t =>
      t.assigneeIds?.includes(resource.id!) &&
      t.status === 'done' &&
      this.detectRequiredSkill(t.title) === requiredSkill
    );
    if (pastSimilarTasks.length > 0) {
      const bonus = Math.min(pastSimilarTasks.length * 5, 15);
      return { score: 25 + bonus, reason: `曾完成 ${pastSimilarTasks.length} 个同类任务` };
    }

    // Partial skill overlap
    if (requiredSkill && resourceSkills.length > 0) {
      return { score: 15, reason: `技能部分相关 (${resource.role})` };
    }

    // No skill info — neutral
    if (!requiredSkill) {
      return { score: 20, reason: '任务类型未明确，通用匹配' };
    }

    return { score: 5, reason: '技能不匹配' };
  }

  /**
   * Calculate workload score (0-30, lower current load = higher score)
   */
  calcWorkloadScore(resource: Resource, allTasks: Task[], taskStart: Date, taskEnd: Date): { score: number; reason: string; activeCount: number; totalCount: number } {
    const myTasks = allTasks.filter(t => t.assigneeIds?.includes(resource.id!) && t.parentId);
    const activeTasks = myTasks.filter(t => {
      if (!t.startDate || !t.endDate) return false;
      const tStart = new Date(t.startDate);
      const tEnd = new Date(t.endDate);
      // Overlapping with the target task period
      return tStart <= taskEnd && tEnd >= taskStart && t.status !== 'done';
    });

    const totalCount = myTasks.filter(t => t.status !== 'done').length;
    const activeCount = activeTasks.length;

    if (activeCount === 0) {
      return { score: 30, reason: '该时段无任务冲突', activeCount, totalCount };
    } else if (activeCount === 1) {
      return { score: 20, reason: `该时段有 ${activeCount} 个并行任务`, activeCount, totalCount };
    } else if (activeCount === 2) {
      return { score: 10, reason: `该时段有 ${activeCount} 个并行任务，负载较高`, activeCount, totalCount };
    } else {
      return { score: 0, reason: `该时段有 ${activeCount} 个并行任务，已超载`, activeCount, totalCount };
    }
  }

  /**
   * Calculate availability score (0-30, more free workdays = higher score)
   */
  calcAvailabilityScore(resource: Resource, allTasks: Task[], taskStart: Date, taskEnd: Date): { score: number; reason: string; freeDays: number; totalWorkdays: number } {
    const days = differenceInDays(taskEnd, taskStart) + 1;
    let totalWorkdays = 0;
    let freeDays = 0;

    const myActiveTasks = allTasks.filter(t =>
      t.assigneeIds?.includes(resource.id!) && t.status !== 'done' && t.parentId
    );

    for (let i = 0; i < days; i++) {
      const day = addDays(taskStart, i);
      if (!isWorkday(day)) continue;
      totalWorkdays++;

      const busyOnDay = myActiveTasks.some(t => {
        if (!t.startDate || !t.endDate) return false;
        const tStart = new Date(t.startDate);
        const tEnd = new Date(t.endDate);
        return day >= tStart && day <= tEnd;
      });

      if (!busyOnDay) freeDays++;
    }

    if (totalWorkdays === 0) {
      return { score: 15, reason: '任务周期内无工作日', freeDays: 0, totalWorkdays: 0 };
    }

    const freeRatio = freeDays / totalWorkdays;
    if (freeRatio >= 0.8) {
      return { score: 30, reason: `${freeDays}/${totalWorkdays} 个工作日空闲`, freeDays, totalWorkdays };
    } else if (freeRatio >= 0.5) {
      return { score: 20, reason: `${freeDays}/${totalWorkdays} 个工作日空闲`, freeDays, totalWorkdays };
    } else if (freeRatio >= 0.2) {
      return { score: 10, reason: `仅 ${freeDays}/${totalWorkdays} 个工作日空闲`, freeDays, totalWorkdays };
    } else {
      return { score: 0, reason: `几乎无空闲 (${freeDays}/${totalWorkdays})`, freeDays, totalWorkdays };
    }
  }

  /**
   * Generate ranked recommendations for a task
   */
  async recommend(taskTitle: string, taskStart: Date, taskEnd: Date): Promise<RecommendationScore[]> {
    const [resources, allTasks] = await Promise.all([
      db.resources.toArray(),
      db.tasks.toArray(),
    ]);

    // Filter out departed members from recommendations
    const activeResources = resources.filter(r => r.status !== 'departed');

    const recommendations: RecommendationScore[] = activeResources.map(resource => {
      const skill = this.calcSkillScore(resource, taskTitle, allTasks);
      const workload = this.calcWorkloadScore(resource, allTasks, taskStart, taskEnd);
      const availability = this.calcAvailabilityScore(resource, allTasks, taskStart, taskEnd);

      const totalScore = skill.score + workload.score + availability.score;
      const reasons = [skill.reason, workload.reason, availability.reason];

      return {
        resourceId: resource.id!,
        resource,
        totalScore,
        skillScore: skill.score,
        workloadScore: workload.score,
        availabilityScore: availability.score,
        reasons,
        currentTaskCount: workload.totalCount,
        activeTaskCount: workload.activeCount,
        freeDaysInPeriod: availability.freeDays,
        totalWorkdaysInPeriod: availability.totalWorkdays,
      };
    });

    // Sort by total score descending
    recommendations.sort((a, b) => b.totalScore - a.totalScore);

    return recommendations;
  }
}

export const smartAssignService = new SmartAssignService();
