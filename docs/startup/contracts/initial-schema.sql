-- Product data proposal 0.1. Not a production migration set.
-- Pi transcripts remain Pi-owned; any message indexes are rebuildable projections.
PRAGMA foreign_keys = ON;

CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  runtime_kind TEXT NOT NULL CHECK(runtime_kind IN ('host','wsl','isolated')),
  runtime_id TEXT NOT NULL,
  path_flavor TEXT NOT NULL CHECK(path_flavor IN ('posix','win32')),
  canonical_root TEXT NOT NULL,
  display_root TEXT NOT NULL,
  UNIQUE(runtime_id, canonical_root)
);
CREATE TABLE threads (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  title TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id),
  idempotency_key TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN (
    'queued','starting','running','waiting_approval','waiting_input',
    'cancelling','succeeded','failed','cancelled','interrupted')),
  runtime_epoch INTEGER NOT NULL DEFAULT 1 CHECK(runtime_epoch > 0),
  last_seq INTEGER NOT NULL DEFAULT 0 CHECK(last_seq >= 0),
  resource_lock_json TEXT NOT NULL CHECK(json_valid(resource_lock_json)),
  pi_session_ref TEXT,
  result_review TEXT NOT NULL DEFAULT 'unreviewed'
    CHECK(result_review IN ('unreviewed','accepted','rejected')),
  created_at TEXT NOT NULL,
  finished_at TEXT,
  UNIQUE(thread_id, idempotency_key)
);
CREATE UNIQUE INDEX one_active_run_per_thread ON runs(thread_id)
  WHERE state IN ('starting','running','waiting_approval','waiting_input','cancelling');
CREATE TABLE run_events (
  event_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  seq INTEGER NOT NULL CHECK(seq > 0),
  runtime_epoch INTEGER NOT NULL CHECK(runtime_epoch > 0),
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  timestamp TEXT NOT NULL,
  UNIQUE(run_id, seq)
);
CREATE TABLE operation_intents (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  tool_call_id TEXT,
  parameter_sha256 TEXT NOT NULL,
  business_idempotency_key TEXT,
  state TEXT NOT NULL CHECK(state IN ('planned','approved','dispatched','confirmed','unknown','rejected')),
  safe_target_summary TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  operation_id TEXT NOT NULL REFERENCES operation_intents(id),
  parameter_sha256 TEXT NOT NULL,
  runtime_epoch INTEGER NOT NULL CHECK(runtime_epoch > 0),
  state TEXT NOT NULL CHECK(state IN ('pending','allow_once','deny','expired','revoked')),
  expires_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE TABLE artifacts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE artifact_versions (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL REFERENCES artifacts(id),
  version INTEGER NOT NULL CHECK(version > 0),
  created_by_run_id TEXT NOT NULL REFERENCES runs(id),
  blob_ref TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_length INTEGER NOT NULL CHECK(byte_length >= 0),
  validation TEXT NOT NULL CHECK(validation IN ('pending','passed','failed','unsupported')),
  UNIQUE(artifact_id, version)
);
CREATE TABLE packages (
  id TEXT PRIMARY KEY,
  publisher_id TEXT NOT NULL,
  source_id TEXT NOT NULL
);
CREATE TABLE package_versions (
  package_id TEXT NOT NULL REFERENCES packages(id),
  version TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  manifest_json TEXT NOT NULL CHECK(json_valid(manifest_json)),
  review_state TEXT NOT NULL CHECK(review_state IN ('draft','reviewed','revoked')),
  store_path TEXT NOT NULL,
  PRIMARY KEY(package_id,version)
);
CREATE TABLE installations (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL,
  version TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('installed_disabled','enabled','disabled','removing')),
  installed_at TEXT NOT NULL,
  FOREIGN KEY(package_id,version) REFERENCES package_versions(package_id,version)
);
-- Polymorphic scope ownership requires host authorization, not just CHECK constraints.
CREATE TABLE resource_activations (
  id TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL REFERENCES installations(id),
  resource_id TEXT NOT NULL,
  scope_type TEXT NOT NULL CHECK(scope_type IN ('user','project','thread')),
  scope_id TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
  UNIQUE(resource_id, scope_type, scope_id)
);
CREATE TABLE connector_definitions (
  id TEXT PRIMARY KEY,
  definition_json TEXT NOT NULL CHECK(json_valid(definition_json))
);
CREATE TABLE connector_accounts (
  id TEXT PRIMARY KEY,
  definition_id TEXT NOT NULL REFERENCES connector_definitions(id),
  display_name TEXT NOT NULL,
  secret_ref TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('connected','expired','needs_scope','rate_limited','disconnected','error'))
);
CREATE TABLE connector_bindings (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES connector_accounts(id),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  grants_json TEXT NOT NULL CHECK(json_valid(grants_json))
);
-- P2 placeholders: schema existence is not a scheduler implementation.
CREATE TABLE schedules (
  id TEXT PRIMARY KEY,
  timezone TEXT NOT NULL,
  definition_json TEXT NOT NULL CHECK(json_valid(definition_json)),
  enabled INTEGER NOT NULL CHECK(enabled IN (0,1))
);
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL REFERENCES schedules(id),
  scheduled_occurrence TEXT NOT NULL,
  run_id TEXT REFERENCES runs(id),
  state TEXT NOT NULL CHECK(state IN ('due','queued','running','done','failed','missed','needs_attention')),
  UNIQUE(schedule_id,scheduled_occurrence)
);
