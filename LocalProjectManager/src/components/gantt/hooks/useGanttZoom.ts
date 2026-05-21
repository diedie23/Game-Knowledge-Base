import { useState, useCallback, useEffect, RefObject } from 'react';
import { ZOOM_PRESETS, DEFAULT_ZOOM_INDEX } from '../constants';

export function useGanttZoom(containerRef: RefObject<HTMLDivElement | null>) {
  const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
  const zoomConfig = ZOOM_PRESETS[zoomIndex];
  const dayWidth = zoomConfig.dayWidth;
  const visibleDays = zoomConfig.visibleDays;

  // Ctrl+Wheel semantic zoom handler
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        const delta = e.deltaY > 0 ? -1 : 1;
        setZoomIndex(prev => Math.max(0, Math.min(ZOOM_PRESETS.length - 1, prev + delta)));
      }
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [containerRef]);

  const handleZoomIn = useCallback(() => {
    setZoomIndex(prev => Math.min(ZOOM_PRESETS.length - 1, prev + 1));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomIndex(prev => Math.max(0, prev - 1));
  }, []);

  const handleZoomReset = useCallback(() => {
    setZoomIndex(DEFAULT_ZOOM_INDEX);
  }, []);

  return {
    zoomIndex,
    zoomConfig,
    dayWidth,
    visibleDays,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
  };
}
