# 仅本地假 Provider；不写用户证书库、不读取账号。
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$probeRoot = Join-Path $projectRoot ('.local/j3-https-check/'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $probeRoot | Out-Null
$rsa=[Security.Cryptography.RSA]::Create(2048)
$req=[Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=localhost',$rsa,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1)
$san=[Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
$san.AddDnsName('localhost'); $req.CertificateExtensions.Add($san.Build())
$cert=$req.CreateSelfSigned([DateTimeOffset]::UtcNow.AddMinutes(-1),[DateTimeOffset]::UtcNow.AddDays(1))
$priorCa=$env:NODE_EXTRA_CA_CERTS
try {
 [IO.File]::WriteAllBytes((Join-Path $probeRoot 'server.pfx'),$cert.Export([Security.Cryptography.X509Certificates.X509ContentType]::Pfx,''))
 [IO.File]::WriteAllText((Join-Path $probeRoot 'ca.pem'),$cert.ExportCertificatePem())
 $env:NODE_EXTRA_CA_CERTS=$null
 Push-Location $projectRoot
 try {
  & node tools/test-j3-provider-https.mjs $probeRoot --untrusted
  if($LASTEXITCODE -ne 0){throw 'TLS_NEGATIVE_FAILED'}
  $env:NODE_EXTRA_CA_CERTS=Join-Path $probeRoot 'ca.pem'
  & node tools/test-j3-provider-https.mjs $probeRoot
  $testExit=$LASTEXITCODE
 } finally { Pop-Location }
} finally {
 $env:NODE_EXTRA_CA_CERTS=$priorCa
 $cert.Dispose(); $rsa.Dispose()
 foreach($name in @('server.pfx','ca.pem','provider.mjs')) { $generated=Join-Path $probeRoot $name; if(Test-Path -LiteralPath $generated){Remove-Item -LiteralPath $generated} }
}
Write-Output "Result: $(Join-Path $probeRoot 'report.json')"
exit $testExit
