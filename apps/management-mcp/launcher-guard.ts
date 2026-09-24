/** Generic Management MCP start gate. Cursor uses clientId mcp_management_cursor; it is not a Role. */
export function assertManagementLauncher(input: {
  data?: string;
  mode: string;
  clientId: string;
  managedRole?: string;
}): void {
  if (
    !input.data ||
    !['observer', 'controller'].includes(input.mode) ||
    !/^mcp_management_[A-Za-z0-9_.:-]{1,100}$/.test(input.clientId) ||
    input.managedRole === '1'
  )
    throw Error('MANAGEMENT_START_DENIED');
}

export function visibleManagementTools<
  T extends { annotations: { readOnlyHint: boolean } },
>(tools: readonly T[], mode: string): T[] {
  if (!['observer', 'controller'].includes(mode)) throw Error('MANAGEMENT_START_DENIED');
  return tools.filter((tool) => tool.annotations.readOnlyHint || mode === 'controller');
}
