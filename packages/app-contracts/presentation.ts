// Disposable display DTOs; never a second native message history or an execution input.
import { identifier } from './index.ts';
export interface MessageView { id: string; role: 'user' | 'assistant'; text: string; truncated: boolean }
export interface Presentation { messages: MessageView[]; omitted: boolean }
/** Plain text only. Known credential forms/control characters are removed, not arbitrary semantic secrets. */
export function displayText(value: string, limit = 2048): string {
  return value.replace(/-----BEGIN [^-\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\n]*PRIVATE KEY-----/g, '[redacted key]')
    .replace(/\b(?:sk-[a-zA-Z0-9_-]{8,}|gh[pousr]_[a-zA-Z0-9_]{8,}|github_pat_[a-zA-Z0-9_]{8,})\b/g, '[redacted token]')
    .replace(/\b(Bearer)\s+[a-zA-Z0-9._~+\/-]+=*/gi, '$1 [redacted]')
    .replace(/\b(api[_-]?key|access[_-]?token|refresh[_-]?token|password)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '').slice(0, limit);
}
export function parsePresentation(value: unknown): Presentation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_presentation');
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(fields).length !== 2 || Object.keys(fields).sort().join() !== 'messages,omitted' || Object.values(fields).some(f => !('value' in f))) throw new Error('invalid_presentation');
  const messages: unknown = fields.messages!.value; const omitted: unknown = fields.omitted!.value;
  if (!Array.isArray(messages) || messages.length > 16 || typeof omitted !== 'boolean') throw new Error('invalid_presentation');
  let size = 0; const ids = new Set<string>();
  const parsed = messages.map((raw): MessageView => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('invalid_message');
    const f = Object.getOwnPropertyDescriptors(raw);
    if (Reflect.ownKeys(f).length !== 4 || Object.keys(f).sort().join() !== 'id,role,text,truncated' || Object.values(f).some(v => !('value' in v))) throw new Error('invalid_message');
    const id = identifier(f.id!.value); const role: unknown = f.role!.value; const text: unknown = f.text!.value; const truncated: unknown = f.truncated!.value;
    if (ids.has(id) || (role !== 'user' && role !== 'assistant') || typeof text !== 'string' || text.length > 2048 || typeof truncated !== 'boolean') throw new Error('invalid_message');
    ids.add(id); size += text.length; if (size > 8000) throw new Error('presentation_limit');
    return { id, role, text: displayText(text), truncated };
  });
  return { messages: parsed, omitted };
}
