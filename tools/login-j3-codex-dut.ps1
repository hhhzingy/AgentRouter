$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$dutRoot = Join-Path $repoRoot '.local/j3-codex/dut-fj'
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
    Write-Host '仅登录 AgentRouter 独立 DUT 的 fj 账号；不要注销 Codex 桌面开发账号。'
    & 'C:/Users/hap_p/AppData/Local/OpenAI/Codex/bin/7ac07f4ce733f89a/codex.exe' login --device-auth
    if ($LASTEXITCODE -ne 0) { throw 'DUT_LOGIN_FAILED' }
    Write-Host 'DUT_LOGIN_COMPLETED：只需回报此状态，不发送登录代码或凭据。'
} finally {
    $env:CODEX_HOME = $priorCodexHome
    $env:HOME = $priorHome
    $env:USERPROFILE = $priorUserProfile
}
