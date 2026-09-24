import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const source = readFileSync('contracts/client-api.c1.schema.json', 'utf8').replaceAll('\r\n', '\n');
const schema = JSON.parse(source);
function type(s) {
  if (s.$ref) return s.$ref.split('/').at(-1);
  if ('const' in s) return JSON.stringify(s.const);
  if (s.enum) return s.enum.map((v) => JSON.stringify(v)).join(' | ');
  if (s.oneOf || s.anyOf) return '(' + (s.oneOf ?? s.anyOf).map(type).join(' | ') + ')';
  if (Array.isArray(s.type)) return s.type.map((t) => type({ ...s, type: t })).join(' | ');
  if (s.type === 'object') {
    if (s.additionalProperties !== false) throw Error('Unbounded object');
    if (Object.keys(s.properties).length === 0) return 'Record<string, never>';
    const props = Object.entries(s.properties)
      .map(([k, v]) => `${JSON.stringify(k)}${s.required?.includes(k) ? '' : '?'}: ${type(v)}`)
      .join(';\n');
    return '{\n' + props + '\n}';
  }
  if (s.type === 'array') return `Array<${type(s.items)}>`;
  if (s.type === 'integer' || s.type === 'number') return 'number';
  if (['string', 'boolean', 'null'].includes(s.type)) return s.type;
  throw Error('Unsupported schema: ' + JSON.stringify(s));
}
const hash = createHash('sha256').update(source).digest('hex');
let output = `// 自动生成；唯一来源 contracts/client-api.c1.schema.json。禁止手改。\n// SHA256 ${hash}\n`;
for (const [name, s] of Object.entries(schema.$defs))
  output += `export type ${name} = ${type(s)};\n`;
output += 'export interface MethodMap {\n';
for (const [n, m] of Object.entries(schema['x-methods']))
  output += `${JSON.stringify(n)}: {params: ${m.params}; result: ${m.result}};\n`;
output += '}\nexport type Method = keyof MethodMap;\n';
output +=
  'export const methodMetadata = ' + JSON.stringify(schema['x-methods'], null, 2) + ' as const;\n';
const doc =
  '# C1 方法表（生成）\n\n唯一来源：`contracts/client-api.c1.schema.json`。参数与返回值参见生成类型；声明方法不代表运行时已实现。\n\n| 方法 | 参数 | 返回 | 写操作 | 作用域 |\n|---|---|---|---|---|\n' +
  Object.entries(schema['x-methods'])
    .map(([n, m]) => `| ${n} | ${m.params} | ${m.result} | ${m.mutation} | ${m.scope} |`)
    .join('\n') +
  '\n';
for (const [p, text] of [
  ['packages/client-contract/generated.ts', output],
  ['docs/api/methods.c1.md', doc],
]) {
  if (process.argv.includes('--check')) {
    if (readFileSync(p, 'utf8') !== text) throw Error('CONTRACT_DRIFT:' + p);
  } else writeFileSync(p, text);
}
console.log('C1 generation ' + (process.argv.includes('--check') ? 'verified' : 'written'));
