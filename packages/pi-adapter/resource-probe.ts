// A3 admission harness only; approved content loading is shared with the Worker.
import type { AgentSession } from '@earendil-works/pi-coding-agent';
import { contentLoader, verifyContent, type ContentSnapshot } from './approved-resources.ts';
export * from './approved-resources.ts';

/** Test-only admission state. No prompt is invoked. A failed reload or persistence
 * leaves admission blocked even if Pi still exposes old resource data.
 */
export class ResourceAdmission {
  private readyId?: string;
  private preparing = false;
  private session: AgentSession;
  private resources: ReturnType<typeof contentLoader>;
  constructor(session: AgentSession, resources: ReturnType<typeof contentLoader>) {
    this.session = session;
    this.resources = resources;
  }

  async prepare(target: ContentSnapshot, options: {
    hostSettled: () => boolean;
    commitLock: (id: string) => Promise<void>;
  }): Promise<void> {
    if (this.preparing) throw new Error('resource_prepare_in_progress');
    this.readyId = undefined;
    this.preparing = true;
    const settled = () => options.hostSettled() && !this.session.isStreaming
      && !this.session.isCompacting && !this.session.isRetrying;
    try {
      if (!settled()) throw new Error('resource_not_settled');
      this.resources.select(target);
      await this.session.waitForIdle();
      if (!settled()) throw new Error('resource_not_settled');
      await this.session.reload();
      if (this.resources.loaded !== target || this.resources.requested !== target) throw new Error('resource_lock_mismatch');
      verifyContent(target);
      await options.commitLock(target.id);
      if (!settled() || this.resources.requested !== target) throw new Error('resource_changed_before_admission');
      verifyContent(target);
      this.readyId = target.id;
    } finally { this.preparing = false; }
  }

  requireReady(expectedId: string): void {
    const loaded = this.resources.loaded;
    if (this.preparing || this.readyId !== expectedId || loaded?.id !== expectedId
        || this.resources.requested !== loaded) throw new Error('resource_admission_blocked');
    verifyContent(loaded);
  }
}
