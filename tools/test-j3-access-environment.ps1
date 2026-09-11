# 无秘密离线环境检查：不启动 Harness，不读取账号，不修改已有目录 ACL。
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'BLOCKED_ENV: compiler unavailable' }
$runId = [Guid]::NewGuid().ToString('N')
$runRoot = Join-Path $projectRoot ".local/j3-access-check/$runId"
New-Item -ItemType Directory -Path $runRoot | Out-Null
$source = Join-Path $projectRoot 'native/windows-isolation/AccessCanary.cs'
$binary = Join-Path $runRoot 'access-check.exe'
& $compiler /nologo /platform:x64 /target:exe "/out:$binary" $source
if ($LASTEXITCODE -ne 0) { throw 'COMPILE_FAILED' }
$start = New-Object System.Diagnostics.ProcessStartInfo
$start.FileName = $binary
$start.Arguments = '"' + (Join-Path $runRoot 'new-canary-only') + '"'
$start.UseShellExecute = $false
$start.CreateNoWindow = $true
$start.RedirectStandardOutput = $true
$start.RedirectStandardError = $true
$process = [System.Diagnostics.Process]::Start($start)
$stdout = $process.StandardOutput.ReadToEndAsync()
$stderr = $process.StandardError.ReadToEndAsync()
$process.WaitForExit()
$probeExit = $process.ExitCode
$lines = @($stdout.Result, $stderr.Result) | Where-Object { $_ }
$process.Dispose()
$record = [ordered]@{
  at = [DateTime]::UtcNow.ToString('o')
  sourceHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLower()
  binaryHash = (Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash.ToLower()
  exitCode = $probeExit
  status = $(if ($probeExit -eq 0) { 'ACCESS_CHECK_PASS_ONLY' } else { 'BLOCKED_ENV_OR_CHECK_FAILED' })
  fullIsolationCertified = $false
  realAccountsRead = $false
  result = ($lines | ForEach-Object { $_.ToString() })
}
$recordPath = Join-Path $runRoot 'result.json'
$record | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $recordPath -Encoding utf8
Write-Output "Result: $recordPath"
Write-Output "Status: $($record.status); exit=$probeExit; fullIsolationCertified=false"
exit $probeExit
