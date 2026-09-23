// Explicitly selected by the desktop --demo composition; no Renderer can choose this entry or tool args.
import { validateToolArguments, type AssistantMessage } from '@earendil-works/pi-ai';
import { serveWorker } from './worker-runtime.ts';
import { demoIntent } from './demo-intent.ts';
const { runId, input } = JSON.parse(process.argv[4]!) as { runId: string; input: string };
serveWorker({
  afterGrant: signal => new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new Error('demo_cancelled')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 1500);
    if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
  }),
  execute: async (runtime, signal) => {
    const manager = runtime.session.sessionManager;
    manager.appendCustomEntry('workbench-synthetic-run', { runId, modelInvoked: false });
    manager.appendMessage({ role: 'user', content: input, timestamp: Date.now() });
    const assistant: AssistantMessage = { role: 'assistant', content: [{ type: 'text', text: '演示已准备 Markdown 工作记录，等待你批准文件写入。此内容为合成记录，未调用模型。' }],
      api: 'openai-responses', provider: 'synthetic-desktop', model: 'synthetic-desktop', timestamp: Date.now(), stopReason: 'stop',
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
    manager.appendMessage(assistant);
    const tool = runtime.session.agent.state.tools.find(t => t.name === 'write'); if (!tool) throw new Error('write_missing');
    const call = { type: 'toolCall' as const, id: `demo-${runId}`, name: 'write', arguments: demoIntent(runId, input) };
    await tool.execute(call.id, validateToolArguments(tool, call), signal);
    manager.appendMessage({ ...assistant, content: [{ type: 'text', text: '文件写入已返回。成果是否可用、任务是否结束，以右侧宿主核验和任务状态为准。' }], timestamp: Date.now() });
  },
});
