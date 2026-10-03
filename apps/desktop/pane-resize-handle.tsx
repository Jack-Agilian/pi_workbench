// Adapted from pi-gui 163054227d370a49d09099c61eb65798481294ac,
// apps/desktop/src/ui/pane-resize-handle.tsx (MIT; THIRD_PARTY_NOTICES.md).
// Bounds/width are owned by our layout; no second measuring or resizing controller.
import { useEffect, useRef, useState } from 'react';

export function PaneResizeHandle({label, controls, edge, width, min, max, onResize, onReset}: {
  label: string; controls: string; edge: 'left' | 'right'; width: number; min: number; max: number;
  onResize: (width: number) => void; onReset: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{pointerId: number; x: number; width: number} | null>(null);
  const [resizing, setResizing] = useState(false);
  const widen = edge === 'right' ? 1 : -1;
  const resize = (value: number) => onResize(Math.round(Math.max(min, Math.min(max, value))));
  const finish = () => {
    const pointer = drag.current?.pointerId;
    drag.current = null; setResizing(false);
    if (pointer !== undefined && ref.current?.hasPointerCapture(pointer)) ref.current.releasePointerCapture(pointer);
  };
  useEffect(() => {
    window.addEventListener('blur', finish);
    return () => window.removeEventListener('blur', finish);
  }, []);
  return <div ref={ref} className="pane-resize" data-edge={edge} data-resizing={resizing}
    role="separator" aria-label={label} aria-orientation="vertical" aria-controls={controls}
    aria-valuemin={min} aria-valuemax={max} aria-valuenow={width} aria-valuetext={`${width} 像素`}
    title="拖动调宽 · 方向键微调 · 双击恢复默认" tabIndex={0}
    onPointerDown={event => {
      if (event.button !== 0 || drag.current) return;
      event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = {pointerId: event.pointerId, x: event.clientX, width}; setResizing(true);
    }}
    onPointerMove={event => {
      const start = drag.current;
      if (start?.pointerId === event.pointerId) resize(start.width + widen * (event.clientX - start.x));
    }}
    onPointerUp={event => { if (drag.current?.pointerId === event.pointerId) finish(); }}
    onPointerCancel={finish} onLostPointerCapture={finish} onDoubleClick={onReset}
    onKeyDown={event => {
      const next = event.key === 'ArrowRight' ? width + widen * 20 : event.key === 'ArrowLeft' ? width - widen * 20
        : event.key === 'Home' ? min : event.key === 'End' ? max : undefined;
      if (next !== undefined) { event.preventDefault(); resize(next); }
      else if (event.key === 'Enter') { event.preventDefault(); onReset(); }
    }} />;
}
