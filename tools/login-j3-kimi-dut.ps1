$ErrorActionPreference = 'Stop'
$dutRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../.local/j3-kimi/dut/home'))
$kimiExe = 'C:/Users/hap_p/.kimi-code/bin/kimi.exe'
if (!(Test-Path -LiteralPath $kimiExe -PathType Leaf)) { throw 'KIMI_NOT_INSTALLED' }
$names = @('HOME','USERPROFILE','KIMI_CODE_HOME','APPDATA','LOCALAPPDATA','TEMP','TMP','KIMI_CODE_NO_AUTO_UPDATE','KIMI_DISABLE_TELEMETRY','KIMI_DISABLE_CRON')
$prior = @{}
foreach ($name in $names) { $prior[$name] = [Environment]::GetEnvironmentVariable($name,'Process') }
try {
  [IO.Directory]::CreateDirectory($dutRoot) | Out-Null
  [IO.Directory]::CreateDirectory((Join-Path $dutRoot 'tmp')) | Out-Null
  $env:HOME = $dutRoot
  $env:USERPROFILE = $dutRoot
  $env:KIMI_CODE_HOME = Join-Path $dutRoot '.kimi-code'
  $env:APPDATA = Join-Path $dutRoot 'AppData/Roaming'
  $env:LOCALAPPDATA = Join-Path $dutRoot 'AppData/Local'
  $env:TEMP = Join-Path $dutRoot 'tmp'
  $env:TMP = $env:TEMP
  $env:KIMI_CODE_NO_AUTO_UPDATE = '1'
  $env:KIMI_DISABLE_TELEMETRY = '1'
  $env:KIMI_DISABLE_CRON = '1'
  Write-Host 'Log in only to this independent AgentRouter Kimi DUT. Do not share login codes or credentials.'
  & $kimiExe login --region mainland-cn
  if ($LASTEXITCODE -ne 0) { throw 'KIMI_DUT_LOGIN_FAILED' }
  Write-Host 'KIMI_DUT_LOGIN_COMPLETED'
} finally {
  foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name,$prior[$name],'Process') }
}
