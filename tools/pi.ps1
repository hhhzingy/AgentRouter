$ErrorActionPreference = 'Stop'
$piEntry = Join-Path $env:APPDATA 'npm/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js'
if (-not (Test-Path -LiteralPath $piEntry)) { throw '用户级 pi 尚未安装，请按 REPRODUCTION.md 安装固定版本。' }
& node $piEntry @args
exit $LASTEXITCODE
