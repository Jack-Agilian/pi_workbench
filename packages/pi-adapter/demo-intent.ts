// Explicit no-model composition. Host chooses the target; submitted text is data, never a command.
import { identifier } from '../app-contracts/index.ts';
export function demoIntent(runId: string, input: string) {
  identifier(runId);
  return { path: `result-${runId}.md`, content: `# 工作记录\n\n> SYNTHETIC 演示 · 未调用模型\n\n## 任务目标\n\n${input}\n\n## 执行记录\n\n此文件由 Pi 原生 write 工具在一次审批后生成。\n` };
}
