import { InMemoryCredentialStore, InMemoryModelsStore } from '@earendil-works/pi-ai';
import { createExtensionRuntime, ModelRuntime, SettingsManager, type AgentSessionServices, type ResourceLoader } from '@earendil-works/pi-coding-agent';

/** Supply empty resources BEFORE discovery; never instantiate the discovery loader. */
export function explicitEmptyResources(systemPrompt = ''): ResourceLoader {
  const extensions = { extensions: [], errors: [], runtime: createExtensionRuntime() };
  return {
    getExtensions: () => extensions,
    getSkills: () => ({ skills: [], diagnostics: [] }),
    getPrompts: () => ({ prompts: [], diagnostics: [] }),
    getThemes: () => ({ themes: [], diagnostics: [] }),
    getAgentsFiles: () => ({ agentsFiles: [] }),
    getSystemPrompt: () => systemPrompt,
    getSystemPromptSource: () => undefined,
    getAppendSystemPrompt: () => [],
    getAppendSystemPromptSources: () => [],
    extendResources: () => { throw new Error('resource_extension_not_authorized'); },
    reload: async () => {},
  };
}

export async function createIsolatedServices(options: { cwd: string; agentDir: string }): Promise<AgentSessionServices> {
  const credentials = new InMemoryCredentialStore();
  const services: AgentSessionServices = {
    cwd: options.cwd,
    agentDir: options.agentDir,
    settingsManager: SettingsManager.inMemory(),
    resourceLoader: explicitEmptyResources(),
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
