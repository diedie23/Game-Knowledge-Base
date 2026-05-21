import { useState, useRef, useEffect, useCallback } from 'react';

interface UseLeftPanelResizeOptions {
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
}

interface UseLeftPanelResizeReturn {
  leftPanelWidth: number;
  leftPanelCollapsed: boolean;
  setLeftPanelCollapsed: (collapsed: boolean) => void;
  effectiveLpWidth: number;
  handleLpResizeStart: (e: React.MouseEvent) => void;
  isResizing: boolean;
}

export function useLeftPanelResize({
  defaultWidth = 800,
  minWidth = 300,
  maxWidth = 1600,
}: UseLeftPanelResizeOptions = {}): UseLeftPanelResizeReturn {
  const [leftPanelWidth, setLeftPanelWidth] = useState(defaultWidth);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const effectiveLpWidth = leftPanelCollapsed ? 48 : leftPanelWidth;

  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const handleLpResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startWidth: leftPanelWidth };
    setIsResizing(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [leftPanelWidth]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = e.clientX - resizeRef.current.startX;
      const newWidth = Math.max(minWidth, Math.min(maxWidth, resizeRef.current.startWidth + delta));
      setLeftPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      resizeRef.current = null;
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, minWidth, maxWidth]);

  return {
    leftPanelWidth,
    leftPanelCollapsed,
    setLeftPanelCollapsed,
    effectiveLpWidth,
    handleLpResizeStart,
    isResizing,
  };
}
