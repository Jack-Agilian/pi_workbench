// A0/A1 only: no product protocol, Run coordinator, tool execution or model calls.
import { randomUUID } from 'node:crypto';
import { InMemoryCredentialStore, InMemoryModelsStore } from '@earendil-works/pi-ai';
import {
  createAgentSession,
  createAgentSessionRuntime,
  createExtensionRuntime,
  ModelRuntime,
  SettingsManager,
  type AgentSession,
  type AgentSessionEvent,
  type AgentSessionRuntime,
  type AgentSessionServices,
  type CreateAgentSessionRuntimeFactory,
  type ResourceLoader,
  type SessionManager,
} from '@earendil-works/pi-coding-agent';

/** Supply empty resources BEFORE discovery; never instantiate the discovery loader. */
export function emptyResources(): ResourceLoader {
  const extensions = { extensions: [], errors: [], runtime: createExtensionRuntime() };
  return {
    getExtensions: () => extensions,
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => 'Synthetic offline Session probe. No model invocation.',
    getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [],
    getAppendSystemPromptSources: () => [],
    extendResources: () => { throw new Error('Probe resources are explicitly empty'); },
    reload: async () => {},
  };
}

export async function createProbeServices(options: { cwd: string; agentDir: string }): Promise<AgentSessionServices> {
  const credentials = new InMemoryCredentialStore();
  const services: AgentSessionServices = {
    cwd: options.cwd,
    agentDir: options.agentDir,
    settingsManager: SettingsManager.inMemory(),
    resourceLoader: emptyResources(),
    modelRuntime: await ModelRuntime.create({
      credentials,
      modelsPath: null,
      modelsStore: new InMemoryModelsStore(),
      allowModelNetwork: false,
      refreshOnCreate: false,
    }),
    diagnostics: [],
  };
  return services;
}

export const createProbeRuntime: CreateAgentSessionRuntimeFactory = async (options) => {
  const services = await createProbeServices(options);
  return {
    ...await createAgentSession({
      ...services,
      sessionManager: options.sessionManager,
      sessionStartEvent: options.sessionStartEvent,
      tools: [],
      customTools: [],
      noTools: 'all',
      thinkingLevel: 'off',
    }),
    services,
    diagnostics: services.diagnostics,
  };
};

export interface Observation {
  readonly bindingId: string;
  readonly nativeSessionId: string;
  readonly event: AgentSessionEvent;
}

interface Binding {
  readonly id: string;
  readonly session: AgentSession;
  readonly nativeSessionId: string;
  active: boolean;
  unsubscribe: () => void;
}

/** Minimal host lifetime seam. Pi alone owns replacement and native history. */
export class ProbeBinding {
  private current?: Binding;
  private replacing = false;
  private closed = false;
  lastNativeSessionFile?: string;
  readonly runtime: AgentSessionRuntime;
  private readonly observe: (observation: Observation) => void;
  private readonly afterSubscribe?: (callback: (event: AgentSessionEvent) => void) => void;

  private constructor(
    runtime: AgentSessionRuntime,
    observe: (observation: Observation) => void,
    // Synthetic test seam: capture a queued callback or throw during host rebinding.
    afterSubscribe?: (callback: (event: AgentSessionEvent) => void) => void,
  ) {
    this.runtime = runtime;
    this.observe = observe;
    this.afterSubscribe = afterSubscribe;
  }

  static async create(options: {
    cwd: string;
    agentDir: string;
    sessionManager: SessionManager;
    factory?: CreateAgentSessionRuntimeFactory;
    observe: (observation: Observation) => void;
    afterSubscribe?: (callback: (event: AgentSessionEvent) => void) => void;
  }): Promise<ProbeBinding> {
    const runtime = await createAgentSessionRuntime(options.factory ?? createProbeRuntime, options);
    const binding = new ProbeBinding(runtime, options.observe, options.afterSubscribe);
    runtime.setBeforeSessionInvalidate(() => binding.invalidate());
    runtime.setRebindSession(async (session) => binding.bind(session));
    try {
      await binding.bind(runtime.session);
      return binding;
    } catch (error) {
      await runtime.dispose();
      throw error;
    }
  }

  get bindingId(): string | undefined { return this.current?.id; }
  get available(): boolean { return !!this.current?.active && !this.closed && !this.replacing; }

  private invalidate(): void {
    const old = this.current;
    this.current = undefined;
    if (old) {
      this.lastNativeSessionFile = old.session.sessionFile;
      old.active = false;
      old.unsubscribe();
    }
  }

  private async bind(session: AgentSession): Promise<void> {
    this.invalidate();
    const binding: Binding = {
      id: randomUUID(), session, nativeSessionId: session.sessionId,
      active: true, unsubscribe: () => {},
    };
    try {
      await session.bindExtensions({});
      const callback = (event: AgentSessionEvent) => {
        // Capture immutable identity, never fill in "current session" at delivery time.
        if (!binding.active || this.current !== binding || this.closed) return;
        this.observe({ bindingId: binding.id, nativeSessionId: binding.nativeSessionId, event });
      };
      binding.unsubscribe = session.subscribe(callback);
      this.afterSubscribe?.(callback);
      this.current = binding;
    } catch (error) {
      binding.active = false;
      binding.unsubscribe();
      session.dispose();
      throw error;
    }
  }

  async appendSynthetic(bindingId: string, content: string): Promise<void> {
    const binding = this.current;
    if (!this.available || !binding || binding.id !== bindingId) {
      throw new Error('session_unavailable: stale or closed probe binding');
    }
    await binding.session.sendCustomMessage({
      customType: 'synthetic-a1-probe', content, display: true,
      details: { synthetic: true, modelInvoked: false },
    }, { triggerTurn: false });
  }

  private async replace(action: () => Promise<unknown>): Promise<void> {
    if (!this.available) throw new Error('session_unavailable');
    this.replacing = true;
    try { await action(); }
    finally { this.replacing = false; }
    // A failure before invalidation retains the old binding; after invalidation
    // current stays absent. No rollback to Pi's disposed runtime.session object.
  }

  async newSession(): Promise<void> { await this.replace(() => this.runtime.newSession()); }
  async fork(entryId: string): Promise<void> {
    await this.replace(() => this.runtime.fork(entryId, { position: 'at' }));
  }
  async switchSession(path: string): Promise<void> {
    await this.replace(() => this.runtime.switchSession(path));
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.invalidate();
    await this.runtime.dispose();
  }
}
