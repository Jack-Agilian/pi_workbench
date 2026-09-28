// Trusted no-model driver: host-selected command, actual registered Pi bash tool.
import { validateToolArguments } from '@earendil-works/pi-ai';
import { serveWorker } from './worker-runtime.ts';
const args = JSON.parse(process.argv[4]!) as { command: string; timeout: number };
serveWorker({ execute: async (runtime, signal) => {
  const manager = runtime.session.sessionManager;
  manager.appendCustomEntry('workbench-synthetic-shell', { modelInvoked: false });
  manager.appendMessage({ role: 'user', content: 'SYNTHETIC approved shell demonstration; no model.', timestamp: Date.now() });
  const tool = runtime.session.agent.state.tools.find(t => t.name === 'bash'); if (!tool) throw new Error('bash_missing');
  const call = { type: 'toolCall' as const, id: 'synthetic-shell', name: 'bash', arguments: args };
  const result = await tool.execute(call.id, validateToolArguments(tool, call), signal);
  manager.appendCustomEntry('workbench-synthetic-shell-result', { result });
} });
