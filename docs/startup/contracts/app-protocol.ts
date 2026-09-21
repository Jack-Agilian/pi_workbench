/**
 * Product protocol proposal 0.1. Not Pi/WorkBuddy APIs.
 * No runtime implementation is supplied. Validate every IPC boundary at runtime.
 */
export type RunState =
  | "queued" | "starting" | "running" | "waiting_approval" | "waiting_input"
  | "cancelling" | "succeeded" | "failed" | "cancelled" | "interrupted";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type ResourceId = string;

export type WorkspaceLocation =
  | { kind: "host"; platform: "darwin"; pathFlavor: "posix"; canonicalRoot: string }
  | { kind: "host"; platform: "win32"; pathFlavor: "win32"; canonicalRoot: string }
  | { kind: "wsl"; distro: string; pathFlavor: "posix"; canonicalRoot: string }
  | { kind: "isolated"; backendId: string; sandboxId: string; pathFlavor: "posix"; canonicalRoot: string };

export interface CapabilityGrant {
  name: string;
  scope: string;
  grantId: string;
  expiresAt?: string;
}

export interface RunResourceLock {
  schemaVersion: "0.1";
  lockId: string;
  resources: ReadonlyArray<{
    resourceId: ResourceId;
    packageVersion: string;
    contentSha256: string;
    materializedPath: string;
  }>;
  runtime: { engine: "pi"; sdkVersion: string; hostVersion: string };
  effectiveCapabilities: ReadonlyArray<CapabilityGrant>;
}

export interface ApprovalRequest {
  approvalId: string;
  operationId: string;
  parameterSha256: string;
  runtimeEpoch: number;
  title: string;
  targetSummary: string;
  dataDestination?: string;
  requestedCapabilities: ReadonlyArray<{ name: string; scope: string }>;
  expiresAt: string;
}

export interface ArtifactRef {
  artifactId: string;
  versionId: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
  createdByRunId: string;
  validation: "pending" | "passed" | "failed" | "unsupported";
}

/** seq is assigned by App Server per Run and NEVER reset after worker replacement. */
export interface EventEnvelope {
  protocolVersion: "0.1";
  eventId: string;
  threadId: string;
  runId: string;
  runtimeEpoch: number;
  seq: number;
  timestamp: string;
}

export type AgentEventPayload = (
  | { type: "run.state"; state: RunState; reason?: string }
  | { type: "message.delta"; messageId: string; contentIndex: number; text: string }
  | { type: "message.final"; messageId: string; content: Json }
  | { type: "tool.started"; callId: string; toolName: string; displayArguments: Json }
  | { type: "tool.snapshot"; callId: string; cumulativeOutput: Json }
  | { type: "tool.finished"; callId: string; isError: boolean; result: Json }
  | { type: "approval.requested"; request: ApprovalRequest }
  | { type: "approval.resolved"; approvalId: string; decision: "allow_once" | "deny" | "expired" }
  | { type: "artifact.registered"; artifact: ArtifactRef }
  | { type: "resources.locked"; lockId: string }
  | { type: "runtime.diagnostic"; code: string; safeMessage: string; retryable: boolean }
);

export type AgentEvent = EventEnvelope & AgentEventPayload;

/** Worker observations are not the authoritative product event stream. */
export interface RuntimeObservation {
  threadId: string;
  runId: string;
  runtimeEpoch: number;
  localSeq: number;
  timestamp: string;
  payload:
    | Extract<AgentEventPayload, { type:
        "message.delta" | "message.final" | "tool.started" | "tool.snapshot"
        | "tool.finished" | "runtime.diagnostic" }>
    | { type: "runtime.started" }
    | { type: "runtime.settled"; outcome: "ok" | "failed" | "aborted" };
}

export interface BackendCapabilities {
  filesystemIsolation: "none" | "policy" | "os-enforced";
  networkEnforcement: "none" | "proxy-only" | "os-enforced";
  processIsolation: "host" | "container" | "vm";
  credentialIsolation: "same-user" | "brokered" | "isolated-brokered";
  nativeToolchain: boolean;
  writableMounts: ReadonlyArray<string>;
  /** An audit/test record, not a package-author claim. */
  enforcementEvidence: string | null;
}

export interface StartRun {
  requestId: string;
  idempotencyKey: string;
  threadId: string;
  runId: string;
  input: string;
  lock: RunResourceLock;
}

export interface HarnessAdapter {
  /** Called in a dedicated worker; implementation must not own product SQLite. */
  openSession(input: { threadId: string; cwd: string; nativeSessionRef?: string }): Promise<void>;
  start(input: StartRun): Promise<{ accepted: true }>;
  subscribe(listener: (event: RuntimeObservation) => void): () => void;
  cancel(input: { runId: string; discardQueuedInput: boolean }): Promise<void>;
  close(): Promise<void>;
}

export interface ApprovalService {
  /** Host must re-check parameter hash, epoch, expiry and current policy. */
  resolve(input: {
    requestId: string;
    approvalId: string;
    parameterSha256: string;
    runtimeEpoch: number;
    decision: "allow_once" | "deny";
  }): Promise<void>;
}

export interface ExecutionBackend {
  readonly id: string;
  readonly capabilities: BackendCapabilities;
  runCommand(input: {
    runId: string;
    command: string;
    shell: "posix" | "powershell" | "git-bash";
    cwd: string;
    timeoutMs: number;
  }, signal: AbortSignal): AsyncIterable<
    { type: "stdout" | "stderr"; text: string } |
    { type: "exit"; code: number | null; cancelled: boolean }
  >;
  terminateTree(runId: string): Promise<{ verifiedStopped: boolean }>;
}
