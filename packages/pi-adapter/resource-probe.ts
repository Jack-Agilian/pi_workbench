// A3: approved content snapshots and one admission seam, not a skill parser or Run coordinator.
import { createHash } from 'node:crypto';
import { chmodSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import {
  DefaultPackageManager, SettingsManager, loadSkills,
  type AgentSession, type ResourceLoader,
} from '@earendil-works/pi-coding-agent';
import { emptyResources } from './probe.ts';

type FileEntry = Readonly<{ path: string; sha256: string }>;
export interface ContentSnapshot {
  readonly root: string;
  readonly id: string;
  readonly files: readonly FileEntry[];
  readonly expectedSkillNames: readonly string[];
}
const digest = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
const inside = (root: string, path: string): boolean => {
  const rel = relative(root, resolve(path));
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !rel.startsWith(sep));
};

/** Whole approved content tree: templates/scripts are copied as bytes, never executed.
 * Closure is reviewed by the caller; arbitrary Markdown references are not statically proved safe.
 * Links and special files are rejected; this is not protection against a hostile concurrent writer.
 */
export function inspectContent(root: string): readonly FileEntry[] {
  if (lstatSync(root).isSymbolicLink() || realpathSync(root) !== resolve(root)) throw new Error('content_root_alias');
  const entries: FileEntry[] = [];
  const visit = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw new Error('content_symlink');
      if (stat.isDirectory()) visit(path);
      else if (stat.isFile()) entries.push(Object.freeze({ path: relative(root, path), sha256: digest(readFileSync(path)) }));
      else throw new Error('content_special_file');
    }
  };
  visit(root);
  return Object.freeze(entries);
}

export function contentId(files: readonly FileEntry[]): string { return digest(JSON.stringify(files)); }

export function materializeContent(options: {
  source: string; destination: string; approvedDigest: string;
  // Explicit review declaration, not inferred from a manifest or untrusted resource text.
  externalDependencies: readonly string[];
  expectedSkillNames: readonly string[];
}): ContentSnapshot {
  if (options.externalDependencies.length) throw new Error('external_dependency_not_supported');
  const files = inspectContent(options.source);
  if (contentId(files) !== options.approvedDigest) throw new Error('approval_content_changed');
  if (inside(options.source, options.destination)) throw new Error('snapshot_inside_source');
  // exclusive root: never overwrite an existing active snapshot
  mkdirSync(options.destination);
  for (const file of files) {
    const bytes = readFileSync(join(options.source, file.path));
    if (digest(bytes) !== file.sha256) throw new Error('source_changed_during_copy');
    const target = join(options.destination, file.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes, { flag: 'wx', mode: 0o444 });
  }
  if (contentId(inspectContent(options.source)) !== options.approvedDigest
      || contentId(inspectContent(options.destination)) !== options.approvedDigest) throw new Error('snapshot_changed');
  const seal = (dir: string): void => {
    for (const name of readdirSync(dir)) if (lstatSync(join(dir, name)).isDirectory()) seal(join(dir, name));
    chmodSync(dir, 0o555);
  };
  seal(options.destination);
  return Object.freeze({ root: options.destination, id: options.approvedDigest, files,
    expectedSkillNames: Object.freeze([...options.expectedSkillNames].sort()) });
}

export function verifyContent(snapshot: ContentSnapshot): void {
  if (contentId(inspectContent(snapshot.root)) !== snapshot.id) throw new Error('snapshot_integrity_failure');
}

/** No DefaultResourceLoader discovery in the runtime path. Pi resolves only the
 * approved package in a sterile directory, then parses its explicitly selected skills.
 * Extensions/prompts/themes are deliberately not adopted by this content-only probe.
 */
export function contentLoader(options: { cwd: string; agentDir: string }) {
  let requested: ContentSnapshot | undefined;
  let loaded: ContentSnapshot | undefined;
  let skills: ReturnType<typeof loadSkills> = { skills: [], diagnostics: [] };
  const loader: ResourceLoader = {
    ...emptyResources(),
    getSkills: () => ({ skills: [...skills.skills], diagnostics: [...skills.diagnostics] }),
    reload: async () => {
      const target = requested;
      if (!target) throw new Error('resource_not_selected');
      verifyContent(target);
      const settings = SettingsManager.inMemory();
      settings.setProjectTrusted(true);
      settings.setProjectPackages([{ source: target.root, extensions: [], prompts: [], themes: [] }]);
      const manager = new DefaultPackageManager({ ...options, settingsManager: settings });
      const resolved = await manager.resolve(async () => 'error');
      // Ignore discovered top-level paths BEFORE invoking any loader. No factory is executed by resolve.
      const paths = resolved.skills.filter(item => item.enabled && item.metadata.origin === 'package'
        && item.metadata.source === target.root).map(item => item.path);
      if (paths.some(path => !inside(target.root, path))) throw new Error('resource_path_escape');
      const candidate = loadSkills({ ...options, skillPaths: paths, includeDefaults: false });
      if (candidate.diagnostics.length || candidate.skills.length !== paths.length) throw new Error('resource_load_failed');
      if (JSON.stringify(candidate.skills.map(skill => skill.name).sort()) !== JSON.stringify(target.expectedSkillNames)) {
        throw new Error('resource_expected_skills_missing');
      }
      if (candidate.skills.some(skill => !inside(target.root, skill.filePath))) throw new Error('skill_path_escape');
      verifyContent(target);
      if (requested !== target) throw new Error('resource_selection_changed');
      skills = candidate;
      loaded = target;
    },
  };
  return {
    loader,
    select(snapshot: ContentSnapshot) { requested = snapshot; },
    get requested() { return requested; },
    get loaded() { return loaded; },
  };
}

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
