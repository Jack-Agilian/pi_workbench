// Adapted from pi-gui 0b4cd334942ac01bfc6b3cba736a79984925d8cf,
// apps/desktop/src/features/conversation/hooks/use-session-composer.tsx (MIT).
// See THIRD_PARTY_NOTICES.md. No steer/followUp: every submission is a product Run.
export function shouldSubmit(event: { key: string; shiftKey: boolean; isComposing: boolean; keyCode: number; repeat: boolean }): boolean {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return false;
  // Additional legacy IME/repeated-key guards; no dependencies on the upstream session driver.
  return event.keyCode !== 229 && !event.repeat;
}
