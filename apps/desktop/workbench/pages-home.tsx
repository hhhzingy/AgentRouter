/** 首页：项目卡网格 + 同尺寸创建卡。 */
import React from 'react';
import { EmptyState } from '../../../packages/ui/index.ts';
import { CreateProjectCard, ProjectCard } from './composites.tsx';
import { useStore } from './store.tsx';

export function HomePage() {
  const s = useStore();
  const projects = s.snapshot.projects.filter((p) => p.status === 'ACTIVE');
  return (
    <div className="page page-home" data-page="home">
      <header className="page-head">
        <div>
          <h1>项目</h1>
          <p>每个项目对应一个 Core 上的工作区。角色与协作组都在项目内。</p>
        </div>
      </header>
      {projects.length === 0 ? (
        <div className="home-empty">
          <EmptyState
            title="还没有项目"
            body="从一个项目目录开始。登记后项目保留稳定身份，角色与协作记录都挂在项目内。"
          />
          <div className="project-grid">
            <CreateProjectCard />
          </div>
        </div>
      ) : (
        <div className="project-grid">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
          <CreateProjectCard />
        </div>
      )}
    </div>
  );
}
