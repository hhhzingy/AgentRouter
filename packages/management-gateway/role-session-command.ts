/** 调用方保存整个命令；响应丢失后保持三项元数据原样重试。 */
export type RoleSessionCommand = {
  request_key: string;
  expected_revision: number;
  preflight_hash: string;
};
export type ManagementMutationCommand = {
  request_key: string;
  expected_revision: number;
};

export const roleSessionCommandProperties = {
  request_key: { type: 'string', pattern: '^[A-Za-z0-9_.:-]{1,128}$' },
  expected_revision: { type: 'integer', minimum: 0 },
  preflight_hash: { type: 'string', pattern: '^[a-f0-9]{64}$' },
};
export const managementMutationCommandProperties = {
  request_key: roleSessionCommandProperties.request_key,
  expected_revision: roleSessionCommandProperties.expected_revision,
};

export function validateManagementMutationCommand(input: unknown): ManagementMutationCommand {
  const value = input as Partial<ManagementMutationCommand> | undefined;
  if (
    !value ||
    typeof value.request_key !== 'string' ||
    !/^[A-Za-z0-9_.:-]{1,128}$/.test(value.request_key) ||
    !Number.isSafeInteger(value.expected_revision) ||
    value.expected_revision! < 0
  )
    throw Error('REQUEST_KEY_AND_REVISION_REQUIRED');
  return { request_key: value.request_key, expected_revision: value.expected_revision! };
}

export function validateRoleSessionCommand(input: unknown): RoleSessionCommand {
  const value = input as Partial<RoleSessionCommand> | undefined;
  if (!value || typeof value.request_key !== 'string' || !/^[A-Za-z0-9_.:-]{1,128}$/.test(value.request_key)
    || !Number.isSafeInteger(value.expected_revision) || value.expected_revision! < 0
    || typeof value.preflight_hash !== 'string' || !/^[a-f0-9]{64}$/.test(value.preflight_hash))
    throw Error('REQUEST_KEY_AND_REVISION_REQUIRED');
  return { request_key: value.request_key, expected_revision: value.expected_revision!, preflight_hash: value.preflight_hash };
}
