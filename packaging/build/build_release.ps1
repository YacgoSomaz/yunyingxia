[CmdletBinding()]
param(
  [string]$Version = '',
  [switch]$Commercial,
  [string]$LicenseServerUrl = 'https://license.runmo.art',
  [string]$LicensePublicKey = '',
  [string]$ProductCode = 'wanshan_media',
  [string]$OutputRoot = '',
  [switch]$SkipInstaller
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if (-not $OutputRoot) { $OutputRoot = Join-Path $ProjectRoot 'release' }
$OutputRoot = [IO.Path]::GetFullPath($OutputRoot)

function Assert-UnderProject([string]$Target) {
  $root = ([IO.Path]::GetFullPath($ProjectRoot)).TrimEnd('\') + '\'
  if (-not ([IO.Path]::GetFullPath($Target)).StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) {
    throw "输出目录必须位于项目目录内: $Target"
  }
}

Assert-UnderProject $OutputRoot
$package = Get-Content (Join-Path $ProjectRoot 'package.json') -Raw | ConvertFrom-Json
if (-not $Version) { $Version = [string]$package.version }
if ($Version -notmatch '^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$') { throw "版本号格式无效: $Version" }
if ($Commercial) {
  $uri = [Uri]$LicenseServerUrl
  if ($uri.Scheme -ne 'https') { throw '商业版授权服务必须使用 HTTPS' }
  if ([string]::IsNullOrWhiteSpace($LicensePublicKey)) { throw '商业版构建必须提供 -LicensePublicKey' }
  if ($ProductCode -notmatch '^[A-Za-z0-9_.-]{1,64}$') { throw "产品代码格式无效: $ProductCode" }
}

function Invoke-Step([string]$File, [string[]]$Arguments) {
  & $File @Arguments
  if ($LASTEXITCODE -ne 0) { throw "命令失败 ($LASTEXITCODE): $File $($Arguments -join ' ')" }
}

Write-Host "[1/7] 运行测试和构建"
Invoke-Step 'npm.cmd' @('test')
Invoke-Step 'npm.cmd' @('run', 'build')

$electronDist = Join-Path $ProjectRoot '.runtime-electron\node_modules\electron\dist'
$runtimeRoot = Join-Path $ProjectRoot 'vendor\qianshan-runtime'
foreach ($required in @(
  (Join-Path $electronDist 'electron.exe'),
  (Join-Path $ProjectRoot 'dist-electron\electron\main.js'),
  (Join-Path $runtimeRoot 'dist\server.js'),
  (Join-Path $runtimeRoot 'renderer\dist\index.html'),
  (Join-Path $runtimeRoot 'node_modules')
)) {
  if (-not (Test-Path $required)) { throw "缺少发布依赖: $required" }
}

$stageRoot = Join-Path $OutputRoot 'stage\WanshanMedia'
if (Test-Path $stageRoot) { Remove-Item $stageRoot -Recurse -Force }
New-Item $stageRoot -ItemType Directory -Force | Out-Null
$appRoot = Join-Path $stageRoot 'resources\app'
New-Item $appRoot -ItemType Directory -Force | Out-Null

Write-Host "[2/7] 复制 Electron 运行时"
Copy-Item (Join-Path $electronDist '*') $stageRoot -Recurse -Force
if (Test-Path (Join-Path $stageRoot 'electron.exe')) {
  Rename-Item (Join-Path $stageRoot 'electron.exe') 'WanshanMedia.exe'
}
if (Test-Path (Join-Path $appRoot 'default_app.asar')) { Remove-Item (Join-Path $appRoot 'default_app.asar') -Force }

Write-Host "[3/7] 复制运行所需的编译产物"
Copy-Item (Join-Path $ProjectRoot 'package.json') $appRoot -Force
Copy-Item (Join-Path $ProjectRoot 'dist-electron') (Join-Path $appRoot 'dist-electron') -Recurse -Force
New-Item (Join-Path $appRoot 'vendor\qianshan-runtime') -ItemType Directory -Force | Out-Null
Copy-Item (Join-Path $runtimeRoot 'package.json') (Join-Path $appRoot 'vendor\qianshan-runtime\package.json') -Force
foreach ($dir in @('dist', 'renderer', 'drizzle', 'node_modules')) {
  Copy-Item (Join-Path $runtimeRoot $dir) (Join-Path $appRoot "vendor\qianshan-runtime\$dir") -Recurse -Force
}

Write-Host "[4/7] 写入商业配置并清理源码/开发文件"
$commercialConfig = [ordered]@{
  commercial = [bool]$Commercial
  licenseServerUrl = $LicenseServerUrl.TrimEnd('/')
  licensePublicKey = if ($Commercial) { $LicensePublicKey } else { '' }
  productCode = $ProductCode
  offlineGraceHours = 72
  appName = '万山自媒体'
  version = $Version
}
$commercialConfig | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $appRoot 'commercial-config.json') -Encoding UTF8

$removePatterns = @('*.map', '*.ts', '*.tsx', '*.py', '*.pyc', '*.md', '*.log', '*.db', '*.sqlite', '*.sqlite3', '*.pem', '*.key')
foreach ($pattern in $removePatterns) {
  Get-ChildItem $appRoot -Recurse -File -Filter $pattern -ErrorAction SilentlyContinue | Remove-Item -Force
}
Get-ChildItem $appRoot -Recurse -Directory -Force -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match '^(test|tests|__tests__|\.git)$' } |
  Sort-Object FullName -Descending |
  Remove-Item -Recurse -Force
Get-ChildItem $appRoot -Recurse -File -Force -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match '^(README|CHANGELOG|CONTRIBUTING)' } |
  Remove-Item -Force

$forbidden = Get-ChildItem $appRoot -Recurse -File -Force | Where-Object {
  $_.Extension -match '^\.(map|ts|tsx|py|pyc|db|sqlite|sqlite3|pem|key)$' -or $_.Name -match '^\.env'
}
if ($forbidden) { throw "发布目录仍包含敏感/源码文件: $($forbidden.FullName -join ', ')" }

Write-Host "[5/7] 生成 integrity_manifest.json"
$entries = [ordered]@{}
foreach ($file in Get-ChildItem $appRoot -Recurse -File -Force) {
  $relative = [IO.Path]::GetRelativePath($appRoot, $file.FullName).Replace('\', '/')
  if ($relative -eq 'integrity_manifest.json') { continue }
  $hash = (Get-FileHash $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  $entries[$relative] = [ordered]@{ sha256 = $hash; size = [int64]$file.Length }
}
$manifestObject = [ordered]@{ version = 1; algorithm = 'sha256'; files = $entries }
$manifestObject |
  ConvertTo-Json -Depth 10 -Compress:$false |
  Set-Content (Join-Path $appRoot 'integrity_manifest.json') -Encoding UTF8

Write-Host "[6/7] 验收发布目录"
$requiredRelease = @(
  'resources/app/package.json',
  'resources/app/commercial-config.json',
  'resources/app/integrity_manifest.json',
  'resources/app/dist-electron/electron/main.js',
  'resources/app/vendor/qianshan-runtime/dist/server.js',
  'resources/app/vendor/qianshan-runtime/renderer/dist/index.html',
  'WanshanMedia.exe'
)
foreach ($relative in $requiredRelease) {
  if (-not (Test-Path (Join-Path $stageRoot $relative))) { throw "发布文件缺失: $relative" }
}
$manifest = Get-Content (Join-Path $appRoot 'integrity_manifest.json') -Raw | ConvertFrom-Json
$manifestCount = @($manifest.files.psobject.Properties).Count
if ($manifestCount -lt 10) { throw '完整性清单文件数量异常，拒绝发布' }

$installer = $null
if (-not $SkipInstaller) {
  $iscc = Get-Command iscc.exe -ErrorAction SilentlyContinue
  if (-not $iscc) {
    $installedIscc = Get-ChildItem 'C:\Program Files (x86)\Inno Setup*', 'C:\Program Files\Inno Setup*' -Filter iscc.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($installedIscc) { $iscc = [pscustomobject]@{ Source = $installedIscc.FullName } }
  }
  if (-not $iscc) {
    Write-Warning '未找到 Inno Setup Compiler (iscc.exe)，已完成发布目录构建，跳过安装包生成。'
  } else {
    Write-Host "[7/7] 生成 Inno Setup 安装包"
    $installer = Join-Path $OutputRoot "WanshanMediaSetup_$Version.exe"
    Invoke-Step $iscc.Source @(
      "/DMyAppVersion=$Version",
      "/DStageDir=$stageRoot",
      "/DOutputDir=$OutputRoot",
      (Join-Path $ProjectRoot 'packaging\installer\WanshanMedia.iss')
    )
    if (-not (Test-Path $installer)) { throw "安装包未生成: $installer" }
  }
}

[pscustomobject]@{
  version = $Version
  commercial = [bool]$Commercial
  stage = $stageRoot
  manifest = Join-Path $appRoot 'integrity_manifest.json'
  installer = $installer
} | ConvertTo-Json
