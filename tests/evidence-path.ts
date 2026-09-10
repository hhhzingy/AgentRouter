import { resolve, relative, isAbsolute } from 'node:path';
/** 本轮证据可重定向到项目内新目录，避免覆盖历史验收。 */
export function evidencePath(path: string) {
  const root = resolve(process.env.AGENTROUTER_TEST_EVIDENCE_ROOT ?? 'evidence');
  const rel = relative(process.cwd(), root);
  if (isAbsolute(rel) || rel === '..' || rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/'))) throw Error('EVIDENCE_OUTSIDE_WORKSPACE');
  return resolve(root, path);
}
