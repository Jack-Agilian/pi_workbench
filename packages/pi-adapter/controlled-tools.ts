// Pi public tool factories and per-call Operations. Authority comes from the host callback.
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import {
  createBashToolDefinition, createEditToolDefinition, createReadToolDefinition, createWriteToolDefinition,
  detectSupportedImageMimeTypeFromFile,
  type BashOperations, type ToolDefinition,
} from '@earendil-works/pi-coding-agent';

export const digest = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
export const parametersDigest = (value: unknown): string => digest(JSON.stringify(value));

export interface ToolBinding {
  readonly runId: string;
  readonly runtimeBindingId: string;
  readonly runtimeEpoch: number;
  readonly workspaceRef: string;
}
export interface ToolOperation extends ToolBinding {
  readonly operationId: string;
  readonly toolCallId: string;
  readonly tool: string;
  readonly parameters: unknown;
  readonly parametersDigest: string;
  readonly deadline: number;
  readonly target?: string;
}
export interface ToolApproval {
  readonly operationId: string;
  readonly parametersDigest: string;
  readonly expiresAt: number;
  /** Required for edit/write: null means the approved target must not exist. */
  readonly fileVersion?: string | null;
}
export interface ToolObservation {
  readonly operation: ToolOperation;
  readonly phase: string;
  readonly contentDigest?: string;
}
export interface ControlledToolOptions {
  binding: ToolBinding;
  deadline: () => number;
  authorize: (operation: ToolOperation, signal: AbortSignal) => Promise<ToolApproval | undefined>;
  /** Explicit backend only. Tests label synthetic backends; real shell uses Pi's public factory. */
  bash: BashOperations;
  observe: (event: ToolObservation) => void;
}

function freeze(value: unknown): void {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
}

function fileTarget(workspace: string, parameters: unknown): string | undefined {
  if (!parameters || typeof parameters !== 'object' || !('path' in parameters)) return undefined;
  const path = parameters.path;
  // Narrow probe policy: Pi-specific aliases need an upstream pre-resolution seam.
  // Do not recreate Pi's ~/@/Unicode fallback path resolver here.
  if (typeof path !== 'string' || /^[@~]/.test(path) || /[\u00a0\u202f\0]/.test(path)) {
    throw new Error('unsupported_probe_path');
  }
  const target = resolve(workspace, path);
  const rel = relative(workspace, target);
  if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) throw new Error('outside_workspace');
  return target;
}

async function noSymlinks(workspace: string, target: string): Promise<void> {
  const rel = relative(workspace, target);
  if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) throw new Error('outside_workspace');
  let path = workspace;
  // Check the workspace too. This is a precondition check, not OS-atomic containment.
  for (const part of ['', ...rel.split(sep).filter(Boolean)]) {
    path = resolve(path, part);
    try {
      if ((await lstat(path)).isSymbolicLink()) throw new Error('symlink_denied');
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
  }
}

async function version(path: string): Promise<string | null> {
  try { return digest(await readFile(path)); }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

async function waitForApproval<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  let onAbort: () => void = () => {};
  try {
    return await Promise.race([pending, new Promise<never>((_, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    })]);
  } finally { signal.removeEventListener('abort', onAbort); }
}

export function createControlledTools(options: ControlledToolOptions) {
  const binding = Object.freeze({ ...options.binding, workspaceRef: resolve(options.binding.workspaceRef) });
  const lifetime = new AbortController();
  const emit = (operation: ToolOperation, phase: string, contentDigest?: string) => {
    options.observe({ operation, phase, ...(contentDigest ? { contentDigest } : {}) });
  };

  function guard<S extends ToolDefinition['parameters'], D, State>(
    template: ToolDefinition<S, D, State>,
    build: (io: CallOperations) => ToolDefinition<S, D, State>,
  ): ToolDefinition<S, D, State> {
    return {
      ...template,
      async execute(toolCallId, params, inputSignal, onUpdate, ctx) {
        // Pi owns prepareArguments and schema validation before this entrypoint.
        const parameters = structuredClone(params);
        freeze(parameters);
        const operation: ToolOperation = Object.freeze({
          ...binding, toolCallId, tool: template.name, operationId: randomUUID(), parameters,
          parametersDigest: parametersDigest(parameters), deadline: options.deadline(),
          target: fileTarget(binding.workspaceRef, parameters),
        });
        const controller = new AbortController();
        const signal = AbortSignal.any([controller.signal, lifetime.signal, ...(inputSignal ? [inputSignal] : [])]);
        let approval: ToolApproval | undefined;
        let open = true;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const check = () => {
          signal.throwIfAborted();
          if (!open) throw new Error('operation_closed');
          if (Date.now() >= operation.deadline) throw new Error('operation_expired');
          if (parametersDigest(parameters) !== operation.parametersDigest) throw new Error('parameters_changed');
          if (approval && (approval.operationId !== operation.operationId ||
              approval.parametersDigest !== operation.parametersDigest || !Number.isFinite(approval.expiresAt) ||
              Date.now() >= approval.expiresAt)) {
            throw new Error('approval_invalid_or_expired');
          }
        };
        const acceptsOutput = () => {
          if (!open || signal.aborted) return false;
          if (Date.now() >= Math.min(operation.deadline, approval?.expiresAt ?? operation.deadline)) {
            controller.abort(new Error('approval_expired')); return false;
          }
          return true;
        };
        const pathCheck = async (path: string, directory = false) => {
          check();
          if (!operation.target || path !== (directory ? dirname(operation.target) : operation.target)) {
            throw new Error('unapproved_target');
          }
          await noSymlinks(binding.workspaceRef, path);
          check();
        };
        let readVersion: string | undefined;
        const io: CallOperations = {
          access: async path => {
            await pathCheck(path); emit(operation, 'access'); check();
            await access(path, constants.R_OK | (operation.tool === 'edit' ? constants.W_OK : 0)); check();
          },
          detectImageMimeType: async path => {
            await pathCheck(path); emit(operation, 'detect_image'); check();
            const mime = await detectSupportedImageMimeTypeFromFile(path); check(); return mime;
          },
          readFile: async path => {
            await pathCheck(path); emit(operation, 'read'); check(); const data = await readFile(path); check();
            readVersion = digest(data); emit(operation, 'read_completed', readVersion); return data;
          },
          mkdir: async path => { await pathCheck(path, true); emit(operation, 'mkdir'); check(); await mkdir(path, { recursive: true }); check(); },
          writeFile: async (path, content) => {
            await pathCheck(path);
            if (!approval || approval.fileVersion === undefined) throw new Error('missing_file_precondition');
            const current = await version(path); check();
            if (current !== approval.fileVersion || (readVersion !== undefined && current !== readVersion)) {
              throw new Error('write_conflict');
            }
            emit(operation, 'write_start', digest(content)); check();
            await writeFile(path, content, 'utf8');
            // Preserve the originating operation even if a late write completed after cancellation.
            emit(operation, 'write_completed', digest(content)); check();
          },
          exec: async (command, cwd, execution) => {
            check();
            if (!parameters || typeof parameters !== 'object' || !('command' in parameters) ||
                command !== parameters.command || cwd !== binding.workspaceRef) throw new Error('unapproved_command');
            emit(operation, 'exec_start'); check();
            try {
              return await options.bash.exec(command, cwd, { ...execution, signal,
                onData: data => {
                  if (!acceptsOutput()) { emit(operation, 'late_output'); return; }
                  execution.onData(data);
                },
              });
            } finally { emit(operation, 'exec_settled'); }
          },
        };
        try {
          check();
          if (!Number.isFinite(operation.deadline) || operation.deadline - Date.now() > 2_147_483_647) throw new Error('invalid_deadline');
          if (ctx.cwd !== binding.workspaceRef) throw new Error('workspace_binding_changed');
          if (operation.target) await noSymlinks(binding.workspaceRef, operation.target);
          check();
          timer = setTimeout(() => controller.abort(new Error('operation_expired')), operation.deadline - Date.now());
          emit(operation, 'approval_requested');
          const decision = await waitForApproval(options.authorize(operation, signal), signal);
          if (!decision) throw new Error('approval_denied');
          approval = Object.freeze({ ...decision });
          check();
          if (operation.tool === 'edit' || operation.tool === 'write') {
            if (approval.fileVersion === undefined || !operation.target) throw new Error('missing_file_precondition');
            await noSymlinks(binding.workspaceRef, operation.target); check();
            if (await version(operation.target) !== approval.fileVersion) throw new Error('write_conflict');
            check();
          }
          clearTimeout(timer);
          timer = setTimeout(() => controller.abort(new Error('approval_expired')),
            Math.min(operation.deadline, approval.expiresAt) - Date.now());
          emit(operation, 'approved');
          const tool = build(io);
          const result = await tool.execute(toolCallId, parameters, signal,
            onUpdate ? update => {
              if (!acceptsOutput()) { emit(operation, 'late_update'); return; }
              emit(operation, 'update'); onUpdate(update);
            } : undefined, ctx);
          check();
          return result;
        } finally {
          open = false;
          if (timer) clearTimeout(timer);
          emit(operation, 'settled');
        }
      },
    };
  }

  interface CallOperations {
    access(path: string): Promise<void>;
    readFile(path: string): Promise<Buffer>;
    detectImageMimeType(path: string): Promise<string | null>;
    mkdir(path: string): Promise<void>;
    writeFile(path: string, content: string): Promise<void>;
    exec: BashOperations['exec'];
  }
  const cwd = binding.workspaceRef;
  // Templates supply ALL public metadata. Only their execute property is replaced.
  const originals = {
    read: createReadToolDefinition(cwd, { autoResizeImages: false }),
    edit: createEditToolDefinition(cwd), write: createWriteToolDefinition(cwd),
    bash: createBashToolDefinition(cwd, { exposeSessionEnvironment: false }),
  };
  const read = guard(originals.read, io =>
    createReadToolDefinition(cwd, { autoResizeImages: false, operations: io }));
  const edit = guard(originals.edit, io => createEditToolDefinition(cwd, { operations: io }));
  const write = guard(originals.write, io => createWriteToolDefinition(cwd, { operations: io }));
  const bash = guard(originals.bash, io =>
    createBashToolDefinition(cwd, { exposeSessionEnvironment: false, operations: io }));
  // Expose only original metadata for parity inspection, never original execute callbacks.
  const metadata = Object.values(originals).map(({ execute: _execute, ...rest }) => rest);
  return { definitions: [read, edit, write, bash], read, edit, write, bash,
    metadata,
    revoke: () => lifetime.abort(new Error('binding_revoked')) };
}
