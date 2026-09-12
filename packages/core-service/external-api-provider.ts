import type Database from 'better-sqlite3';
import type { ExternalApiProfile } from '../management-gateway/external-api-registry.ts';
/** Core 固定 Provider：只读数据集诊断。动作闭包自有固定数据源，不接受传输参数、
 * 不出网、不读取凭据；输出为已脱敏的非秘密计数与时间戳。真实上游 API 需另行授权注册。 */
export function createCoreDatasetProfile(db: Database.Database): ExternalApiProfile {
  return {
    id: 'core_dataset',
    displayName: 'Core dataset diagnostics',
    enabled: true,
    actions: [
      {
        id: 'snapshot',
        inputSchema: { type: 'object', additionalProperties: false, properties: {} },
        outputSchema: {
          type: 'object',
          additionalProperties: false,
          required: ['dataset_id', 'revision', 'server_time_ms'],
          properties: {
            dataset_id: { type: 'string' },
            revision: { type: 'integer', minimum: 0 },
            server_time_ms: { type: 'integer', minimum: 0 },
          },
        },
        sideEffect: 'READ_ONLY',
        async execute() {
          const row = (id: string) =>
            (db.prepare("select value from app_meta where key=?").get(id) as
              | { value: string }
              | undefined)?.value;
          const datasetId = row('dataset_id'),
            revision = row('revision');
          if (!datasetId || revision === undefined) throw Error('DATASET_STATE_UNAVAILABLE');
          return {
            dataset_id: datasetId,
            revision: Number(revision),
            server_time_ms: Date.now(),
          };
        },
        redact: (raw) => structuredClone(raw),
      },
    ],
  };
}
