// 从隔离 DUT 的 Codex auth.json 写出仅含哈希的 approved-identity.json。绝不打印邮箱或 token。
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';

const hash = (s) => createHash('sha256').update(s).digest('hex');
const authPath = resolve(process.argv[2] ?? '.local-protected/codex-dut/home/.codex/auth.json');
const outPath = resolve(
  process.argv[3] ?? '.local-protected/codex-dut/dut-fj/approved-identity.json',
);
if (!existsSync(authPath)) throw Error('FRESH_DUT_LOGIN_REQUIRED');
const auth = JSON.parse(readFileSync(authPath, 'utf8'));
const idToken = auth?.tokens?.id_token;
const accountId = auth?.tokens?.account_id;
if (typeof idToken !== 'string' || typeof accountId !== 'string') throw Error('DUT_AUTH_INCOMPLETE');
const claims = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'));
const email = typeof claims.email === 'string' ? claims.email : undefined;
if (!email || typeof claims.sub !== 'string') throw Error('DUT_IDENTITY_CLAIMS_MISSING');
mkdirSync(dirname(outPath), { recursive: true });
const identity = {
  emailSha256: hash(email.trim().toLowerCase()),
  accountIdSha256: hash(accountId),
  subjectSha256: hash(claims.sub),
};
writeFileSync(outPath, JSON.stringify(identity, null, 2) + '\n');
console.log(JSON.stringify({ status: 'SEALED', path: outPath, hashes_only: true }));
