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
  const previousBodyStyle = useRef<{ cursor: string; userSelect: string } | null>(null);

  const restoreBodyStyle = useCallback(() => {
    if (!previousBodyStyle.current) return;
    document.body.style.cursor = previousBodyStyle.current.cursor;
    document.body.style.userSelect = previousBodyStyle.current.userSelect;
    previousBodyStyle.current = null;
  }, []);

  const handleLpResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startWidth: leftPanelWidth };
    previousBodyStyle.current = { cursor: document.body.style.cursor, userSelect: document.body.style.userSelect };
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
      restoreBodyStyle();
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      restoreBodyStyle();
    };
  }, [isResizing, minWidth, maxWidth, restoreBodyStyle]);

  return {
    leftPanelWidth,
    leftPanelCollapsed,
    setLeftPanelCollapsed,
    effectiveLpWidth,
    handleLpResizeStart,
    isResizing,
  };
}
