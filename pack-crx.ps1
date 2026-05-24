$ErrorActionPreference = 'Stop'

$chrome  = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$src     = 'D:\Project\chromeetx\markdownView'
$out     = 'D:\Project\chromeetx\dist'
$pemKeep = Join-Path $out 'markdown-viewer-chrome.pem'

New-Item -ItemType Directory -Force -Path $out | Out-Null

# 干净副本：排除 .git / .claude / dist / node_modules / 已有的打包产物
# 直接把 staging 放到 dist 同级的隐藏目录，不依赖 %TEMP%
$staging = 'D:\Project\chromeetx\.pack-staging'
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
$null = robocopy $src $staging /E /XD .git .claude dist node_modules /XF .gitignore *.zip *.crx *.pem

# 如果已经有 pem，复用它以保持扩展 ID 不变
$packArgs = @('--pack-extension="{0}"' -f $staging)
if (Test-Path $pemKeep) {
    $packArgs += '--pack-extension-key="{0}"' -f $pemKeep
    Write-Host "Reusing existing key: $pemKeep"
} else {
    Write-Host "Generating new key (will be saved to $pemKeep)"
}

$proc = Start-Process -FilePath $chrome -ArgumentList $packArgs -Wait -PassThru -NoNewWindow
Write-Host "chrome exit code: $($proc.ExitCode)"

$tmpParent = Split-Path $staging -Parent
$crxTmp = Join-Path $tmpParent '.pack-staging.crx'
$pemTmp = Join-Path $tmpParent '.pack-staging.pem'

if (Test-Path $crxTmp) {
    Move-Item $crxTmp (Join-Path $out 'markdown-viewer-chrome-v1.0.0.crx') -Force
}
# 只在 pem 不存在时（首次生成）才搬到 dist
if ((Test-Path $pemTmp) -and -not (Test-Path $pemKeep)) {
    Move-Item $pemTmp $pemKeep -Force
} elseif (Test-Path $pemTmp) {
    Remove-Item $pemTmp -Force
}

Remove-Item $staging -Recurse -Force

Get-ChildItem $out | Select-Object Name, @{N='SizeKB';E={[math]::Round($_.Length/1KB,1)}}, LastWriteTime | Format-Table -AutoSize
