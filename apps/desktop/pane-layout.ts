import { useEffect, useState } from 'react';

// Display preferences only. Never used as a source of execution permissions.
const preferenceKey = 'pi-workbench.panes.v1';
type Preferences = {sidebar?: number; inspector?: number; collapsed?: boolean};
function readPreferences(): Preferences {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(preferenceKey) ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const width = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 160 && v <= 1200 ? v : undefined;
    return {sidebar: 'sidebar' in value ? width(value.sidebar) : undefined,
      inspector: 'inspector' in value ? width(value.inspector) : undefined,
      collapsed: 'collapsed' in value && value.collapsed === true};
  } catch { return {}; }
}
export function usePaneLayout(inspectorOpen: boolean) {
  const [preferences, setPreferences] = useState(readPreferences);
  const [viewport, setViewport] = useState(window.innerWidth);
  useEffect(() => {
    const resize = () => setViewport(window.innerWidth);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  useEffect(() => {
    try { localStorage.setItem(preferenceKey, JSON.stringify(preferences)); } catch { /* Read-only profiles still work in memory. */ }
  }, [preferences]);
  const overlay = viewport < 1000;
  const sidebarMin = 180;
  const sidebarMax = Math.max(sidebarMin, Math.min(360, viewport - 360 - (inspectorOpen && !overlay ? 280 : 0)));
  const sidebarWidth = Math.min(sidebarMax, Math.max(sidebarMin, preferences.sidebar ?? 224));
  const mainWidth = viewport - (preferences.collapsed ? 0 : sidebarWidth);
  const inspectorMax = Math.max(0, Math.min(640, mainWidth - (overlay ? 32 : 360)));
  const inspectorMin = Math.min(280, inspectorMax);
  const inspectorWidth = Math.min(inspectorMax, Math.max(inspectorMin, preferences.inspector ?? (overlay ? 380 : 328)));
  return {overlay, sidebarWidth, sidebarMin, sidebarMax, inspectorWidth, inspectorMin, inspectorMax,
    sidebarOpen: !preferences.collapsed,
    toggleSidebar: () => setPreferences(p => ({...p, collapsed: !p.collapsed})),
    resizeSidebar: (sidebar: number) => setPreferences(p => ({...p, sidebar})),
    resizeInspector: (inspector: number) => setPreferences(p => ({...p, inspector})),
    resetSidebar: () => setPreferences(p => ({...p, sidebar: undefined})),
    resetInspector: () => setPreferences(p => ({...p, inspector: undefined})),
  };
}
