import { useLayoutEffect, useRef, useState } from 'react';
import type { DesktopThread } from '../../packages/app-contracts/desktop.ts';

type Position = {top: number; following: boolean; anchor?: string; offset: number};
/** Renderer-only viewing position. Native history and execution ownership remain in the host. */
export function useTimelineScroll(threadId: string, snapshot: DesktopThread | null) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const expectedScroll = useRef<number | null>(null);
  const positions = useRef(new Map<string, Position>());
  const [browsing, setBrowsing] = useState(false);
  const loaded = snapshot?.thread.id === threadId;
  const capturePosition = () => {
    const element = viewport.current;
    if (!element || !loaded) return;
    const following = element.scrollHeight - element.clientHeight - element.scrollTop <= 24;
    const top = element.getBoundingClientRect().top;
    const anchor = Array.from(element.querySelectorAll<HTMLElement>('[data-run]')).find(run => run.getBoundingClientRect().bottom > top);
    positions.current.set(threadId, {top: element.scrollTop, following, anchor: anchor?.dataset.run, offset: anchor ? anchor.getBoundingClientRect().top - top : 0});
    setBrowsing(!following);
  };
  const onScroll = () => {
    const element = viewport.current;
    // Like pi-gui's expectedScrollTop, do not turn delayed events from our own
    // positioning into new reading intent (or accidentally re-enable following).
    if (element && expectedScroll.current !== null && Math.abs(element.scrollTop - expectedScroll.current) < 1) return;
    expectedScroll.current = null; capturePosition();
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
    expectedScroll.current = element.scrollTop;
    // Do not convert a reader into a follower because a resize temporarily fits all content.
    setBrowsing(position ? !position.following : false);
  };
  // Polling produces fresh DTO objects even when no layout changed. Restoring on
  // every object identity can overwrite a user scroll before its scroll event fires.
  // Thread admission restores once; ResizeObserver owns subsequent layout changes.
  useLayoutEffect(restore, [threadId, loaded]);
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
  const revealApproval = (operationId: string) => {
    const element = viewport.current;
    const target = Array.from(element?.querySelectorAll<HTMLElement>('[data-approval]') ?? []).find(item => item.dataset.approval === operationId);
    if (!element || !target) return;
    // The same scroll owner handles explicit navigation and passive reading anchors.
    element.scrollTop += target.getBoundingClientRect().bottom - element.getBoundingClientRect().bottom + 12;
    target.focus({preventScroll: true}); capturePosition(); expectedScroll.current = element.scrollTop;
  };
  return {viewport, content, onScroll, browsing, returnLatest, revealApproval};
}
