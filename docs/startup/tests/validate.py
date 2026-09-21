"""Validate design examples only; does NOT test a real Pi runtime or sandbox."""
from pathlib import Path
import copy, hashlib, json, re, sqlite3, sys
try:
    from jsonschema import Draft202012Validator
except ImportError:
    sys.exit('Install the Python jsonschema package to run these example checks.')
ROOT = Path(__file__).resolve().parents[1]
results = []
def check(name, fn):
    try:
        fn()
        results.append({'name': name, 'status': 'passed'})
    except Exception as exc:
        results.append({'name': name, 'status': 'failed', 'error': str(exc)})

def require(ok, message):
    if not ok: raise AssertionError(message)

schema = json.loads((ROOT/'contracts/plugin-manifest.schema.json').read_text())
manifest = json.loads((ROOT/'examples/weekly-report/workbench.plugin.json').read_text())
validator = Draft202012Validator(schema)
check('JSON Schema is valid Draft 2020-12', lambda: Draft202012Validator.check_schema(schema))
check('Sample manifest conforms to schema', lambda: validator.validate(manifest))

def rejects(change):
    value = copy.deepcopy(manifest)
    change(value)
    require(not validator.is_valid(value), 'Invalid manifest was accepted')
check('Reject unknown manifest property', lambda: rejects(lambda x: x.update({'postinstall': 'arbitrary command'})))
check('Reject directory traversal resource path', lambda: rejects(lambda x: x['contributes']['skills'][0].update(path='../outside/SKILL.md')))
check('Reject Windows absolute resource path', lambda: rejects(lambda x: x['contributes']['skills'][0].update(path='C:\\outside\\SKILL.md')))
check('Reject POSIX absolute resource path', lambda: rejects(lambda x: x['contributes']['skills'][0].update(path='/etc/passwd')))

def resource_exists():
    root=(ROOT/'examples/weekly-report').resolve()
    for resources in manifest['contributes'].values():
        for resource in resources:
            p=(root/resource['path']).resolve()
            require(p.is_relative_to(root) and p.is_file(), 'Resource missing or outside package')
check('All contributed resources exist inside example package', resource_exists)

def hash_matches():
    lock=json.loads((ROOT/'examples/resource-lock.example.json').read_text())
    for res in lock['resources']:
        content=(ROOT/'examples'/res['path']).read_bytes()
        require(hashlib.sha256(content).hexdigest()==res['contentSha256'], 'Hash mismatch')
check('Example resource lock matches exact skill bytes', hash_matches)

conn=sqlite3.connect(':memory:')
check('SQLite initial schema executes', lambda: conn.executescript((ROOT/'contracts/initial-schema.sql').read_text()))

def seed():
    conn.execute("INSERT INTO projects VALUES ('p','Project','2026-09-07')")
    conn.execute("INSERT INTO workspaces VALUES ('w','p','host','mac1','posix','/workspace','/workspace')")
    conn.execute("INSERT INTO threads VALUES ('t','w','Task','2026-09-07')")
    conn.execute("INSERT INTO runs(id,thread_id,idempotency_key,state,resource_lock_json,created_at) VALUES ('r','t','key1','running','{}','2026-09-07')")
    conn.commit()
check('Create minimal linked product records', seed)

def rejects_sql(sql):
    try: conn.execute(sql)
    except sqlite3.IntegrityError: return
    raise AssertionError('Expected SQLite integrity failure')
check('Reject second active Run on same Thread', lambda: rejects_sql("INSERT INTO runs(id,thread_id,idempotency_key,state,resource_lock_json,created_at) VALUES ('r2','t','key2','running','{}','now')"))
check('Reject invalid Run state', lambda: rejects_sql("UPDATE runs SET state='made_up' WHERE id='r'"))
check('Reject orphan Thread', lambda: rejects_sql("INSERT INTO threads VALUES ('bad','missing','Task','now')"))

def duplicate_seq():
    conn.execute("INSERT INTO run_events VALUES ('e1','r',1,1,'run.state','{}','now')")
    rejects_sql("INSERT INTO run_events VALUES ('e2','r',1,1,'run.state','{}','now')")
check('Reject duplicate product sequence number', duplicate_seq)

def no_secret_columns():
    banned={'api_key','access_token','refresh_token','password'}
    for (name,) in conn.execute("SELECT name FROM sqlite_master WHERE type='table'"):
        columns={x[1] for x in conn.execute(f'PRAGMA table_info({name})')}
        require(not (columns & banned), f'Secret value column found in {name}')
check('No direct long-lived secret columns in sample SQL', no_secret_columns)

def refs_exist():
    known={s['id'] for s in json.loads((ROOT/'sources.json').read_text())}
    for p in (ROOT/'docs').glob('*.md'):
        for sid in re.findall(r'\bS\d{2}\b', p.read_text()):
            require(sid in known, f'Unknown citation {sid} in {p.name}')
check('All source IDs have a source catalog entry', refs_exist)

report={'scope':'Design-example validation only; no runtime, OS or sandbox implementation tested',
 'checks':results,'passed':sum(x['status']=='passed' for x in results),'failed':sum(x['status']=='failed' for x in results)}
(ROOT/'tests/validation-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
sys.exit(1 if report['failed'] else 0)
