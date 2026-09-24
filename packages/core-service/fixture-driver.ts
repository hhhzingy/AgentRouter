import type { ApplicationService } from './application.ts';
import { ExecutionCoordinator } from './execution-coordinator.ts';
import { FixtureBackend } from './fixture-backend.ts';
/** 兼容现有隔离测试入口；生产入口不得实例化此驱动。 */
export class FixtureDriver extends ExecutionCoordinator {
  constructor(app: ApplicationService, executable: string) {
    super(app, new FixtureBackend(executable));
  }
}
