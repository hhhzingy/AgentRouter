import {it,expect} from 'vitest';
import {blankPlan,newGroup,newRole,parsePlan,mapPlan,mappingRequired} from '../../apps/desktop/workbench/role-draft.ts';
import {modelCatalog} from '../../packages/ui-mocks/data.ts';
it('J2 手工草稿符合冻结 Schema，空方案/额外属性/超大输入明确拒绝',()=>{
 const p=blankPlan('p');expect(()=>parsePlan(JSON.stringify(p))).toThrow();const g=newGroup('w',1);p.groups=[g];p.roles=[newRole(g,modelCatalog[0],1)];expect(parsePlan(JSON.stringify(p)).roles).toHaveLength(1);expect(()=>parsePlan(JSON.stringify({...p,secret:'not_allowed'}))).toThrow();expect(()=>parsePlan(' '.repeat(131073))).toThrow('128 KiB');
});
it('J2 外部项目/工作区需显式映射；保留角色目标，不静默改写原方案',()=>{
 const p=blankPlan('external'),g=newGroup('old_ws',1);p.groups=[g];p.roles=[newRole(g,modelCatalog[0],1)];expect(mappingRequired(p,'local',['new_ws'])).toBe(true);const next=mapPlan(p,'local',{old_ws:'new_ws'});expect(mappingRequired(next,'local',['new_ws'])).toBe(false);expect(p.project_id).toBe('external');expect(next.roles[0].default_completion_target).toEqual(p.roles[0].default_completion_target);
});
