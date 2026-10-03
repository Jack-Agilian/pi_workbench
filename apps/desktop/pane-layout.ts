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
  const [drawerOpen,setDrawerOpen]=useState(false);
  const narrow=viewport<700;
  useEffect(() => {
    const resize = () => setViewport(window.innerWidth);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  useEffect(() => {
    try { localStorage.setItem(preferenceKey, JSON.stringify(preferences)); } catch { /* Read-only profiles still work in memory. */ }
  }, [preferences]);
  const overlay = viewport < 1000;
  const sidebarOpen=narrow?drawerOpen:!preferences.collapsed;
  useEffect(()=>{setDrawerOpen(false);},[narrow]);
  const sidebarMin = 180;
  const sidebarMax = Math.max(sidebarMin, Math.min(360, narrow?viewport-32:viewport - 360 - (inspectorOpen && !overlay ? 280 : 0)));
  const sidebarWidth = Math.min(sidebarMax, Math.max(sidebarMin, preferences.sidebar ?? (narrow?280:224)));
  const mainWidth = viewport - (narrow||!sidebarOpen ? 0 : sidebarWidth);
  const inspectorMax = Math.max(0, Math.min(640, mainWidth - (overlay ? 32 : 360)));
  const inspectorMin = Math.min(280, inspectorMax);
  const inspectorWidth = Math.min(inspectorMax, Math.max(inspectorMin, preferences.inspector ?? (overlay ? 380 : 328)));
  return {overlay, narrow, sidebarWidth, sidebarMin, sidebarMax, inspectorWidth, inspectorMin, inspectorMax,
    sidebarOpen,
    closeDrawer:()=>setDrawerOpen(false),
    toggleSidebar: () => narrow?setDrawerOpen(v=>!v):setPreferences(p => ({...p, collapsed: !p.collapsed})),
    resizeSidebar: (sidebar: number) => setPreferences(p => ({...p, sidebar})),
    resizeInspector: (inspector: number) => setPreferences(p => ({...p, inspector})),
    resetSidebar: () => setPreferences(p => ({...p, sidebar: undefined})),
    resetInspector: () => setPreferences(p => ({...p, inspector: undefined})),
  };
}
