// Compatibility entry for the A2 tests; production imports controlled-tools.
export * from './controlled-tools.ts';
export { createControlledTools as createToolProbe } from './controlled-tools.ts';
export type { ToolApproval as ProbeApproval, ControlledToolOptions as ToolProbeOptions } from './controlled-tools.ts';
