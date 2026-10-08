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
export function usePaneLayout() {
  const [preferences, setPreferences] = useState(readPreferences);
  const [viewport, setViewport] = useState(window.innerWidth);
  const [drawerOpen,setDrawerOpen]=useState(false);
  const narrow=viewport<760;
  useEffect(() => {
    const resize = () => setViewport(window.innerWidth);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  useEffect(() => {
    try { localStorage.setItem(preferenceKey, JSON.stringify(preferences)); } catch { /* Read-only profiles still work in memory. */ }
  }, [preferences]);
  const sidebarOpen=narrow?drawerOpen:!preferences.collapsed;
  useEffect(()=>{setDrawerOpen(false);},[narrow]);
  const sidebarMin=200,sidebarMax=narrow?Math.max(200,Math.min(300,viewport-44)):300;
  const sidebarWidth=Math.min(sidebarMax,Math.max(sidebarMin,preferences.sidebar??(narrow?280:232)));
  const mainWidth=viewport-(narrow||!sidebarOpen?0:sidebarWidth);
  const desired=Math.min(620,Math.max(360,preferences.inspector??440));
  const overlay=mainWidth-desired<448;
  const inspectorMin=360,inspectorMax=overlay?620:Math.min(620,mainWidth-448);
  const inspectorWidth=overlay?mainWidth:desired;
  return {overlay, narrow, sidebarWidth, sidebarMin, sidebarMax, inspectorWidth, inspectorMin, inspectorMax,
    sidebarOpen,
    showSidebar:()=>narrow?setDrawerOpen(true):setPreferences(p=>({...p,collapsed:false})),
    closeDrawer:()=>setDrawerOpen(false),
    toggleSidebar: () => narrow?setDrawerOpen(v=>!v):setPreferences(p => ({...p, collapsed: !p.collapsed})),
    resizeSidebar: (sidebar: number) => setPreferences(p => ({...p, sidebar})),
    resizeInspector: (inspector: number) => setPreferences(p => ({...p, inspector})),
    resetSidebar: () => setPreferences(p => ({...p, sidebar: undefined})),
    resetInspector: () => setPreferences(p => ({...p, inspector: undefined})),
  };
}
