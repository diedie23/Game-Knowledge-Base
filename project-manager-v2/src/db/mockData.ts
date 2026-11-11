import { db } from './db';
import { addDays, startOfToday } from 'date-fns';
export async function initMockData() {
  const count = await db.tasks.count();
  if (count > 0) return;
  
  const today = startOfToday();
  await db.tasks.bulkAdd([
    { title: '首页开发', status: 'in_progress', priority: 'high', startDate: today, endDate: addDays(today, 10), progress: 30, dependencies: [], type: 'Feature', projectId: 1, assigneeIds: [] },
    { title: '交互定稿', status: 'done', priority: 'high', assigneeIds: [], startDate: today, endDate: addDays(today, 2), progress: 100, dependencies: [], type: 'Design', projectId: 1, parentId: 1 },
    { title: '视觉制作', status: 'todo', priority: 'high', assigneeIds: [], startDate: addDays(today, 2), endDate: addDays(today, 5), progress: 0, dependencies: [2], type: 'Design', projectId: 1, parentId: 1 },
    { title: '前端开发', status: 'todo', priority: 'medium', assigneeIds: [], startDate: addDays(today, 5), endDate: addDays(today, 10), progress: 0, dependencies: [3], type: 'Frontend', projectId: 1, parentId: 1 },
    { title: '后端接口', status: 'todo', priority: 'medium', assigneeIds: [], startDate: addDays(today, 3), endDate: addDays(today, 8), progress: 0, dependencies: [], type: 'Backend', projectId: 1 }
  ]);
}