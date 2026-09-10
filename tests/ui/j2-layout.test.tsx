import React from 'react';
import {it,expect} from 'vitest';
import {ProjectCard} from '../../apps/desktop/workbench/composites.tsx';
import {ProjectPage} from '../../apps/desktop/workbench/pages-project.tsx';
import {makeStore,render as page} from './helpers.tsx';
it('大项目只展示3组5个可访问角色链接，身份用精确ID',()=>{
 const s=makeStore({}),project=s.snapshot.projects[0],g=s.snapshot.spaces[0],r=s.snapshot.roles[0];
 s.snapshot.spaces=Array.from({length:4},(_,i)=>({...g,id:'g'+i,projectId:project.id,name:'组'+i}));
 s.snapshot.roles=s.snapshot.spaces.flatMap(g=>Array.from({length:7},(_,i)=>({...r,id:g.id+'r'+i,spaceId:g.id,name:'完整姓名'+i})));
 const html=page(s,<ProjectCard project={project}/>);expect((html.match(/class="project-card-group"/g)??[])).toHaveLength(3);expect((html.match(/href="#\/role\//g)??[])).toHaveLength(15);expect(html).toContain('aria-label="完整姓名0');expect(html).toContain('另有 1 个小组');expect(html).not.toContain('href="#/role/g3r0"');
});
it('旧8个项目路由仍有明确功能落点',()=>{const s=makeStore({}),id=s.snapshot.projects[0].id;for(const tab of ['overview','spaces','timeline','inbox','issues','artifacts','models','settings']){const html=page(s,<ProjectPage projectId={id} tab={tab}/>);expect(html).toContain(`data-tab="${tab}"`);expect((html.match(/role="tab"/g)??[])).toHaveLength(4);}});
