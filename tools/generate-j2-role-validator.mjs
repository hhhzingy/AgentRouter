import {readFileSync,writeFileSync} from 'node:fs';
import {Ajv2020} from 'ajv/dist/2020.js';
import standalone from 'ajv/dist/standalone/index.js';
const schema=JSON.parse(readFileSync('contracts/agentrouter-role-plan.v1.schema.json','utf8'));
const ajv=new Ajv2020({strict:false,allErrors:true,code:{source:true}});
const source=standalone(ajv,ajv.compile(schema));
const path='apps/desktop/workbench/role-plan-validator.cjs';
if(process.argv.includes('--check')){if(readFileSync(path,'utf8')!==source)throw Error('J2_VALIDATOR_STALE');}else writeFileSync(path,source);
