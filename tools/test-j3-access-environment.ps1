# 无秘密诊断：仅在本次新建目录操作 ACL；不读取账号，不启动 Harness。
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
$timer = [Diagnostics.Stopwatch]::StartNew()
$process = [System.Diagnostics.Process]::Start($start)
$stdout = $process.StandardOutput.ReadToEndAsync()
$stderr = $process.StandardError.ReadToEndAsync()
$timedOut = -not $process.WaitForExit(30000)
if ($timedOut) { $process.Kill(); [void]$process.WaitForExit(5000) }
# Only this Process object is terminated; the self-created broker also self-exits after 12 seconds.
$probeExit = $(if ($timedOut) { 124 } else { $process.ExitCode })
$readComplete = [Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($stdout,$stderr),15000)
$events = @()
if ($readComplete) {
 foreach ($line in ($stdout.Result -split '\r?\n')) { if ($line.Trim()) { $events += ($line | ConvertFrom-Json) } }
}
$process.Dispose()
$record = [ordered]@{
 runId = $runId
 at = [DateTime]::UtcNow.ToString('o')
 sourceHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLower()
 binaryHash = (Get-FileHash -LiteralPath $binary -Algorithm SHA256).Hash.ToLower()
 runnerHash = (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLower()
 elapsedMs = $timer.ElapsedMilliseconds
 watchdogTimedOut = $timedOut
 outputCompleted = $readComplete
 stderrPresent = $(if ($readComplete) { [bool]$stderr.Result } else { $null })
 exitCode = $probeExit
 status = $(if ($probeExit -eq 0) { 'THREAD_ACCESS_CHECK_PASS_ONLY' } else { 'BLOCKED_ENV_OR_CHECK_FAILED' })
 fullIsolationCertified = $false
 realAccountsRead = $false
 events = $events
}
$recordPath = Join-Path $runRoot 'result.json'
$record | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $recordPath -Encoding utf8
Write-Output "Result: $recordPath"
Write-Output "Status: $($record.status); exit=$probeExit; fullIsolationCertified=false"
exit $probeExit
