$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
# WC00 X-04: DUT 登录态迁出可清理的 .local,存受保护目录;清理计划不得覆盖 .local-protected。
$dutRoot = Join-Path $repoRoot '.local-protected/codex-dut'
$dutHome = Join-Path $dutRoot 'home'
$dutCodex = Join-Path $dutHome '.codex'
New-Item -ItemType Directory -Force -Path $dutCodex | Out-Null
$configPath = Join-Path $dutCodex 'config.toml'
if (-not (Test-Path -LiteralPath $configPath)) {
    [IO.File]::WriteAllText($configPath, "cli_auth_credentials_store = `"file`"`nsandbox_mode = `"read-only`"`napproval_policy = `"never`"`n[features]`napps = false`nplugins = false`nremote_plugin = false`n")
}
$priorCodexHome = $env:CODEX_HOME
$priorHome = $env:HOME
$priorUserProfile = $env:USERPROFILE
try {
    $env:CODEX_HOME = $dutCodex
    $env:HOME = $dutHome
    $env:USERPROFILE = $dutHome
    Write-Host 'Login ONLY the isolated AgentRouter DUT using fj. Keep the Codex desktop account unchanged.'
    $codexBin = Get-ChildItem 'C:/Users/hap_p/AppData/Local/OpenAI/Codex/bin' -Filter codex.exe -Recurse | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    & $codexBin.FullName -c 'cli_auth_credentials_store="file"' login --device-auth
    if ($LASTEXITCODE -ne 0) { throw 'DUT_LOGIN_FAILED' }
    Write-Host 'DUT_LOGIN_COMPLETED. Report only this status. Never send login codes or credentials.'
} finally {
    $env:CODEX_HOME = $priorCodexHome
    $env:HOME = $priorHome
    $env:USERPROFILE = $priorUserProfile
}
