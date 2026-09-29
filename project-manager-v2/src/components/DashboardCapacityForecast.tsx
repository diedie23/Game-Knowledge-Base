import React, { useMemo } from 'react';
import { Activity, ArrowRight, Users } from 'lucide-react';
import type { Resource, Task } from '../types';
import { buildStageCapacityForecast } from '../services/capacityForecastService';
import { useStore } from '../store/useStore';

interface Props { tasks: Task[]; resources: Resource[] }

const STATUS_STYLE = {
  healthy: { label: '容量充足', text: 'text-emerald-300', bar: 'bg-emerald-400', card: 'border-emerald-500/15' },
  warning: { label: '接近饱和', text: 'text-amber-300', bar: 'bg-amber-400', card: 'border-amber-500/25' },
  danger: { label: '容量不足', text: 'text-red-300', bar: 'bg-red-400', card: 'border-red-500/30' },
} as const;

export function DashboardCapacityForecast({ tasks, resources }: Props) {
  const { setCurrentView } = useStore();
  const forecasts = useMemo(() => buildStageCapacityForecast(tasks, resources), [tasks, resources]);
  return (
    <section className="rounded-2xl border border-gray-700/50 bg-gray-900/35 p-5 shadow-lg">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div><h3 className="flex items-center gap-2 text-base font-semibold text-white"><Activity size={18} className="text-cyan-400" />未来两周岗位容量</h3><p className="mt-1 text-xs text-gray-500">已排工时反映当前占用，加入待排工时后预测岗位是否还能承接。</p></div>
        <button type="button" onClick={() => setCurrentView('matrix')} className="flex items-center gap-1.5 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200 hover:bg-cyan-500/20">查看资源矩阵<ArrowRight size={13} /></button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {forecasts.map(item => {
          const style = STATUS_STYLE[item.status];
          const barWidth = Math.min(100, item.projectedUtilization);
          return <article key={item.stage} className={`rounded-xl border bg-gray-950/35 p-3.5 ${style.card}`}>
            <div className="flex items-center justify-between"><div className="font-medium text-gray-100">{item.label}</div><span className={`text-[10px] font-medium ${style.text}`}>{style.label}</span></div>
            <div className="mt-3 flex items-end justify-between"><div><span className={`text-2xl font-bold ${style.text}`}>{item.projectedUtilization > 900 ? '无容量' : `${item.projectedUtilization}%`}</span><div className="mt-0.5 text-[10px] text-gray-500">加入待排后的预计占用</div></div><div className="flex items-center gap-1 text-[11px] text-gray-400"><Users size={12} />{item.resourceCount} 人</div></div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-800"><div className={`h-full rounded-full ${style.bar}`} style={{ width: `${barWidth}%` }} /></div>
            <div className="mt-3 grid grid-cols-3 gap-1 text-center text-[10px]"><div className="rounded bg-gray-900/70 px-1 py-1.5"><div className="font-medium text-gray-200">{item.capacityHours}h</div><div className="text-gray-600">总容量</div></div><div className="rounded bg-gray-900/70 px-1 py-1.5"><div className="font-medium text-blue-300">{item.scheduledHours}h</div><div className="text-gray-600">已排 {item.scheduledTaskCount}</div></div><div className="rounded bg-gray-900/70 px-1 py-1.5"><div className="font-medium text-violet-300">{item.pendingHours}h</div><div className="text-gray-600">待排 {item.pendingTaskCount}</div></div></div>
          </article>;
        })}
      </div>
    </section>
  );
}
