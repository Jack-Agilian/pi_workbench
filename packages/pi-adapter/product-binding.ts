import type { AgentSession } from '@earendil-works/pi-coding-agent';
import type { Binding, RuntimeObservation } from '../app-contracts/index.ts';

const activities = new Set(['agent_start', 'agent_end', 'turn_start', 'turn_end', 'message_start', 'message_update',
  'message_end', 'entry_appended', 'tool_execution_start', 'tool_execution_update', 'tool_execution_end', 'queue_update']);
const label = (value: unknown): string | null => typeof value === 'string' && /^[a-zA-Z0-9_:-]{1,64}$/.test(value) ? value : null;

/** No message bodies, tool arguments, error details or provider objects enter the product event index. */
export function projectObservation(event: unknown): RuntimeObservation {
  const type = event && typeof event === 'object' && 'type' in event ? label(event.type) : null;
  const source = event && typeof event === 'object' && 'source' in event ? event.source : null;
  const sourceType = source && typeof source === 'object' && 'type' in source ? label(source.type) : label(source);
  return { kind: type === 'agent_settled' ? 'idle' : type && activities.has(type) ? 'activity' : 'diagnostic',
    eventType: type ?? 'unknown', sourceType };
}

/** A lifetime captures all product identity. The host port owns persistence; this module cannot open SQLite. */
export function bindProductSession(session: AgentSession, identity: Binding,
  observe: (binding: Binding, observation: RuntimeObservation) => void) {
  const captured = Object.freeze({ runId: identity.runId, threadId: identity.threadId,
    runtimeBindingId: identity.runtimeBindingId, workerEpoch: identity.workerEpoch, sessionGeneration: identity.sessionGeneration });
  let active = true;
  const unsubscribe = session.subscribe(event => { if (active) observe(captured, projectObservation(event)); });
  return () => { if (active) { active = false; unsubscribe(); } };
}
