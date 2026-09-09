#!/usr/bin/env python3
"""Offline spec checks only. No real Harness calls, credentials, network or app tests.
Requires Python 3.10+, jsonschema and PyYAML. Run from any directory.
"""
from __future__ import annotations
import argparse
import datetime as dt
import json
from pathlib import Path
import re
import sqlite3
import sys
import tempfile
try:
    from jsonschema import Draft202012Validator
    import yaml
except ImportError as exc:
    raise SystemExit('Install the explicit prerequisites: python -m pip install jsonschema PyYAML') from exc


def validate(root: Path) -> dict:
    checks: list[dict] = []
    def check(name: str, fn) -> None:
        try:
            detail = fn()
            if detail is not None and not isinstance(detail, (str, int, float, bool, list, dict)):
                detail = type(detail).__name__ + ' completed'
            checks.append({'name': name, 'status': 'PASS', 'detail': detail})
        except Exception as exc:
            checks.append({'name': name, 'status': 'FAIL', 'detail': f'{type(exc).__name__}: {exc}'})
    def require(condition: bool, detail: str = 'assertion failed') -> None:
        if not condition: raise AssertionError(detail)
    def load(path: str): return json.loads((root / path).read_text(encoding='utf-8'))
    schema = load('spec/route.schema.json')
    check('Draft2020-12 schema valid', lambda: Draft202012Validator.check_schema(schema))
    validator = Draft202012Validator(schema)
    for path in sorted((root / 'examples').glob('*.json')):
        data = json.loads(path.read_text(encoding='utf-8'))
        errors = list(validator.iter_errors(data))
        invalid = path.name.startswith('invalid_')
        check(f'example:{path.name}', lambda e=errors, inv=invalid: require(bool(e) == inv, 'expected rejection' if inv else str([x.message for x in e])))
    req=load('examples/task_request_handoff.json'); finish=load('examples/finish_handoff.json')
    check('handoff recipient agreement', lambda: require(req['completion']['to']==finish['next_request']['to']))
    settings=load('spec/defaults.json')
    check('V1.0 exact harness scope', lambda: require(settings['harnesses']==['codex','kimi_code','pi']))
    check('silent success and no sender copy', lambda: require(settings['success_business_receipt'] is False and settings['notify_originator_by_default'] is False))
    check('settled barrier enabled', lambda: require(settings['release_after_run_settled'] is True))
    check('external management not enabled', lambda: require(settings['external_management_enabled'] is False))
    check('quota/auth conservative default', lambda: require(settings['unverified_refresh_auth_concurrency']==1))
    policy=yaml.safe_load((root/'06_项目规则模板.yaml').read_text(encoding='utf-8'))
    check('project template is an unapproved draft', lambda: require(policy['status']=='DRAFT' and policy['approved_by'] is None and policy['protocol_version']==settings['protocol_version']))
    lock=load('templates/compatibility-lock.template.json')
    check('no invented live compatibility evidence', lambda: require(lock['tested_at'] is None and all(h['status']=='NOT_RUN' and h['version'] is None for h in lock['harnesses'])))
    cases=load('spec/acceptance-cases.json')
    check('all 26 functional IDs mapped', lambda: require(set(f for c in cases for f in c['features'])=={f'F{i:02d}' for i in range(1,27)}))
    check('all 10 milestones mapped', lambda: require({c['milestone'] for c in cases}=={f'M{i:02d}' for i in range(10)}))
    check('planned acceptance is not reported as tested', lambda: require(all(c['status']=='NOT_RUN' for c in cases)))
    sources=load('spec/sources.json')
    source_ids={s['id'] for s in sources}
    referenced=set()
    for p in root.glob('*.md'): referenced |= set(re.findall(r'\[(S\d{2})\]',p.read_text(encoding='utf-8')))
    check('all cited source IDs exist', lambda: require(referenced <= source_ids, str(referenced-source_ids)))
    check('all required manuals exist', lambda: require(all((root/p).is_file() for p in ['01_功能手册.md','02_开发手册.md','03_总协议与工具契约.md','04_验收与追踪矩阵.md','05_AI编排指南.md','06_项目规则模板.yaml','07_研究依据与版本核查.md','08_Codex实施入口.md','spec/adapter-contract.d.ts'])))
    # These test SQL syntax and declared DB constraints, NOT the application's scheduler.
    with tempfile.TemporaryDirectory(prefix='agentrouter-spec-') as folder:
        db=sqlite3.connect(str(Path(folder)/'test.db'))
        check('SQL migration baseline parses', lambda: db.executescript((root/'spec/schema.sql').read_text(encoding='utf-8')))
        def seed():
            db.execute("INSERT INTO projects VALUES('project_test','test','/test','/test','ACTIVE',1)")
            db.execute("INSERT INTO spaces VALUES('space_test','project_test','test','ACTIVE',1)")
            db.execute("INSERT INTO workspaces VALUES('workspace_test','project_test',NULL,'/test','/test','DIRECTORY',NULL,NULL,'READY')")
            db.execute("INSERT INTO policies VALUES('policy_test','project_test',1,'agentrouter/1.0','{}','hash',1)")
            db.execute("INSERT INTO roles VALUES('role_a','space_test','A','','ACTIVE',1)")
            db.execute("INSERT INTO roles VALUES('role_b','space_test','B','','ACTIVE',1)")
            db.execute("INSERT INTO bindings VALUES('binding_a','role_a','pi','workspace_test',NULL,NULL,'{}','{}','native-a',1,1,'policy_test','NEW',1)")
            db.execute("INSERT INTO chains VALUES('chain_test','space_test','operation_root',1,100,28800000,'ACTIVE')")
            db.execute("INSERT INTO tasks(id,space_id,assignee_role_id,chain_id,policy_id,summary,body,request_json,completion_json,problem_target_json,state,created_at_ms,updated_at_ms) VALUES('task_a','space_test','role_a','chain_test','policy_test','x','x','{}','{}','{}','ACTIVE',1,1)")
            db.execute("INSERT INTO runs VALUES('run_a','role_a','binding_a','task_a','chain_test','TASK',1,NULL,'{}','RUNNING',NULL,NULL,NULL,1)")
            db.execute("INSERT INTO operations(scope_key,operation_id,request_hash,response_json,committed_at_ms) VALUES('role_a','op_a','hash','{}',1)")
            db.commit()
        check('SQL seed valid linked records',seed)
        def reject(sql: str):
            db.execute('SAVEPOINT invalid_test')
            rejected=False
            try: db.execute(sql)
            except sqlite3.IntegrityError: rejected=True
            finally:
                db.execute('ROLLBACK TO invalid_test');db.execute('RELEASE invalid_test')
            require(rejected,'constraint was expected to reject this input')
        check('SQL duplicate operation rejected',lambda:reject("INSERT INTO operations(scope_key,operation_id,request_hash,response_json,committed_at_ms) VALUES('role_a','op_a','other','{}',1)"))
        check('SQL second current binding rejected',lambda:reject("INSERT INTO bindings VALUES('binding_b','role_a','pi','workspace_test',NULL,NULL,'{}','{}','native-b',2,1,'policy_test','NEW',1)"))
        check('SQL second live run rejected',lambda:reject("INSERT INTO runs VALUES('run_b','role_a','binding_a','task_a','chain_test','TASK',1,NULL,'{}','RUNNING',NULL,NULL,NULL,1)"))
        check('SQL second active task rejected',lambda:reject("INSERT INTO tasks(id,space_id,assignee_role_id,chain_id,policy_id,summary,body,request_json,completion_json,problem_target_json,state,created_at_ms,updated_at_ms) VALUES('task_b','space_test','role_a','chain_test','policy_test','x','x','{}','{}','{}','ACTIVE',1,1)"))
        check('SQL forged recipient shape rejected',lambda:reject("INSERT INTO messages(id,space_id,kind,from_kind,to_kind,to_role_id,payload_json,operation_row_id,created_at_ms) VALUES('message_bad','space_test','notice','user','user','role_a','{}',1,1)"))
        check('SQL missing foreign identity rejected',lambda:reject("INSERT INTO roles VALUES('role_bad','space_missing','X','','ACTIVE',1)"))
        def transaction_rollback():
            try:
                db.execute('BEGIN')
                db.execute("INSERT INTO messages(id,space_id,kind,from_kind,to_kind,payload_json,operation_row_id,created_at_ms) VALUES('message_rolled','space_test','notice','user','user','{}',1,1)")
                db.execute("INSERT INTO outbox(id,message_id,after_run_id,state,updated_at_ms) VALUES('outbox_bad','message_rolled',NULL,'HELD',1)")
                raise AssertionError('HELD without required run was not rejected')
            except sqlite3.IntegrityError: db.rollback()
            require(db.execute("SELECT count(*) FROM messages WHERE id='message_rolled'").fetchone()[0]==0)
        check('SQL atomic rollback of invalid held outbox', transaction_rollback)
        def held_record():
            with db:
                db.execute("INSERT INTO messages(id,space_id,task_id,kind,from_kind,from_role_id,to_kind,payload_json,operation_row_id,created_at_ms) VALUES('message_result','space_test','task_a','task.result','role','role_a','user','{}',1,1)")
                db.execute("INSERT INTO results VALUES('result_a','task_a','run_a','succeeded','x','x','[]','STAGED',1)")
                db.execute("INSERT INTO outbox(id,message_id,after_run_id,state,updated_at_ms) VALUES('outbox_a','message_result','run_a','HELD',1)")
            require(db.execute("SELECT count(*) FROM outbox WHERE state='QUEUED'").fetchone()[0]==0)
        check('SQL stores result and HELD outbox together',held_record)
        check('SQL foreign_key_check clean',lambda: require(db.execute('PRAGMA foreign_key_check').fetchall()==[]))
        check('SQL integrity_check clean',lambda: require(db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'))
        db.close()
    return {
        'scope':'Offline specification / examples / SQL declared constraints only; not application tests',
        'checked_at_utc':dt.datetime.now(dt.timezone.utc).isoformat(),
        'python':sys.version.split()[0], 'sqlite_used_for_syntax_check':sqlite3.sqlite_version,
        'sqlite_runtime_is_production_certified':False,
        'planned_acceptance_cases':len(cases),
        'passed':sum(c['status']=='PASS' for c in checks),
        'failed':sum(c['status']=='FAIL' for c in checks),
        'checks':checks,
        'not_performed':['Real Codex/Kimi/pi calls','Actual account switching and quota','Windows process/Job Objects tests','Packaged Electron/Node tests','Real scheduler and crash/power-loss tests','Security audit']
    }

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[1])
    parser.add_argument('--report',type=Path)
    args=parser.parse_args()
    report=validate(args.root.resolve())
    dest=args.report or args.root/'validation/spec_validation.json'
    dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f"Spec checks: {report['passed']} passed; {report['failed']} failed. Report: {dest}")
    for c in report['checks']:
        if c['status']=='FAIL': print(c['name'],c['detail'])
    return 1 if report['failed'] else 0
if __name__=='__main__': raise SystemExit(main())
