import { useLayoutEffect, useRef, useState } from 'react';
import type { DesktopThread } from '../../packages/app-contracts/desktop.ts';

type Position = {top: number; following: boolean; anchor?: string; offset: number};
/** Renderer-only viewing position. Native history and execution ownership remain in the host. */
export function useTimelineScroll(threadId: string, snapshot: DesktopThread | null) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, Position>());
  const [browsing, setBrowsing] = useState(false);
  const loaded = snapshot?.thread.id === threadId;
  const onScroll = () => {
    const element = viewport.current;
    if (!element || !loaded) return;
    const following = element.scrollHeight - element.clientHeight - element.scrollTop <= 24;
    const top = element.getBoundingClientRect().top;
    const anchor = Array.from(element.querySelectorAll<HTMLElement>('[data-run]')).find(run => run.getBoundingClientRect().bottom > top);
    positions.current.set(threadId, {top: element.scrollTop, following, anchor: anchor?.dataset.run, offset: anchor ? anchor.getBoundingClientRect().top - top : 0});
    setBrowsing(!following);
  };
  const restore = () => {
    const element = viewport.current;
    if (!element || !loaded) return;
    const position = positions.current.get(threadId);
    if (!position || position.following) element.scrollTop = element.scrollHeight;
    else {
      const anchor = Array.from(element.querySelectorAll<HTMLElement>('[data-run]')).find(run => run.dataset.run === position.anchor);
      element.scrollTop = anchor ? element.scrollTop + anchor.getBoundingClientRect().top - element.getBoundingClientRect().top - position.offset : position.top;
    }
    // Do not convert a reader into a follower because a resize temporarily fits all content.
    setBrowsing(position ? !position.following : false);
  };
  useLayoutEffect(restore, [threadId, snapshot]);
  useLayoutEffect(() => {
    const element = viewport.current; const inner = content.current;
    if (!element || !inner || !loaded) return;
    const observer = new ResizeObserver(restore);
    observer.observe(element); observer.observe(inner);
    return () => observer.disconnect();
  }, [threadId, loaded]);
  const returnLatest = () => {
    positions.current.set(threadId, {top: 0, following: true, offset: 0});
    restore(); setBrowsing(false);
  };
  return {viewport, content, onScroll, browsing, returnLatest};
}
