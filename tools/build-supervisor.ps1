$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$outDir=Join-Path $projectRoot '.local/native'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
if (-not (Test-Path -LiteralPath $compiler)) { throw 'BLOCKED_ENV: .NET Framework C# compiler unavailable' }
& $compiler /nologo /platform:x64 /target:exe "/out:$outDir/agentrouter-supervisor.exe" (Join-Path $projectRoot 'native/windows-supervisor/Supervisor.cs')
exit $LASTEXITCODE
