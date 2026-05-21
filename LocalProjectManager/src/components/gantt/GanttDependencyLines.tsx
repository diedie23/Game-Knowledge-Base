import React from 'react';
import { dependencyLineStyles } from './constants';
import type { DependencyLine } from './types';

interface Props {
  lines: DependencyLine[];
}

export const GanttDependencyLines = React.memo(function GanttDependencyLines({ lines }: Props) {
  if (lines.length === 0) return null;
  return (
    <>
      <style>{dependencyLineStyles}</style>
      <svg className="absolute inset-0 z-[3] pointer-events-none" style={{ overflow: 'visible' }} width="100%" height="100%">
        <defs>
          <marker id="dep-arrow" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={6} markerHeight={6} orient="auto-start-reverse">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#5b5fc7" fillOpacity={0.6} />
          </marker>
          <marker id="dep-arrow-conflict" viewBox="0 0 10 10" refX={9} refY={5} markerWidth={6} markerHeight={6} orient="auto-start-reverse">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#ef4444" fillOpacity={0.8} />
          </marker>
        </defs>
        {lines.map((line) => {
          const dx = line.toX - line.fromX;
          const cpOffset = Math.max(30, Math.min(Math.abs(dx) * 0.4, 120));
          const goesBackward = dx < 20;
          let pathD: string;
          if (goesBackward) {
            const midY = (line.fromY + line.toY) / 2 + ((line.toY - line.fromY) > 0 ? 25 : -25);
            pathD = `M ${line.fromX} ${line.fromY} C ${line.fromX+40} ${line.fromY}, ${line.fromX+40} ${midY}, ${(line.fromX+line.toX)/2} ${midY} S ${line.toX-40} ${line.toY}, ${line.toX} ${line.toY}`;
          } else {
            pathD = `M ${line.fromX} ${line.fromY} C ${line.fromX+cpOffset} ${line.fromY}, ${line.toX-cpOffset} ${line.toY}, ${line.toX} ${line.toY}`;
          }
          return (
            <g key={`dep-${line.fromTaskId}-${line.toTaskId}${line.isGhost ? '-ghost' : ''}`}>
              {line.isGhost ? (
                <g>
                  <path d={pathD} fill="none" stroke="#fbbf24" strokeWidth={2} strokeDasharray="4 4" style={{ animation: 'flowDash 2s linear infinite' }} />
                  {line.ghostReason && (
                    <text x={(line.fromX + line.toX) / 2} y={(line.fromY + line.toY) / 2 - 5} fill="#fbbf24" fontSize="10" textAnchor="middle" className="drop-shadow-md">
                      {line.ghostReason}
                    </text>
                  )}
                </g>
              ) : line.isConflict ? (
                <path d={pathD} fill="none" stroke="#ef4444" strokeWidth={2} strokeDasharray="6 6" markerEnd="url(#dep-arrow-conflict)" style={{ animation: 'breathingDash 2s ease-in-out infinite' }} />
              ) : (
                <path d={pathD} fill="none" stroke="#5b5fc7" strokeWidth={1.5} strokeOpacity={0.5} strokeDasharray="4 3" markerEnd="url(#dep-arrow)" style={{ animation: 'flowDash 1.5s linear infinite' }} />
              )}
            </g>
          );
        })}
      </svg>
    </>
  );
});
