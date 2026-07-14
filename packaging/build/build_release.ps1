[CmdletBinding()]
param(
  [string]$Version = '',
  [switch]$Commercial,
  [string]$LicenseServerUrl = 'https://license.runmo.art',
  [string]$LicensePublicKey = '',
  [string]$AccountServerUrl = 'https://anyq.site',
  [string]$AccountPublicKey = 'CqLAEE2KnduTFtw1gVQIExS1qLRa-XI3TaWpbchMbKc',
  [string]$ProductCode = 'operation_shrimp',
  [string]$UpdatePublicKey = '',
  [string]$IntegrityPrivateKeyPath = '',
  [string]$CodeSignTool = '',
  [string[]]$CodeSignArgument = @(),
  [string]$InnoSignToolCommand = '',
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
if ([bool]$CodeSignTool -ne [bool]$InnoSignToolCommand) { throw '代码签名必须同时配置主启动 EXE 和 Inno 安装器/卸载器签名步骤，或全部留空。' }
if ($Commercial) {
  $accountUri = [Uri]$AccountServerUrl
  if ($accountUri.Scheme -ne 'https') { throw '商业版账号服务必须使用 HTTPS' }
  if (-not $AccountPublicKey.Trim()) { throw '商业版构建必须提供 -AccountPublicKey' }
  if (-not $UpdatePublicKey.Trim()) { throw '商业版构建必须提供 -UpdatePublicKey' }
  if ($ProductCode -notmatch '^[A-Za-z0-9_.-]{1,64}$') { throw "产品代码格式无效: $ProductCode" }
  if (-not $IntegrityPrivateKeyPath) { throw '商业版构建必须提供 -IntegrityPrivateKeyPath' }
}

function Invoke-Step([string]$File, [string[]]$Arguments) {
  & $File @Arguments
  if ($LASTEXITCODE -ne 0) { throw "命令失败 ($LASTEXITCODE): $File $($Arguments -join ' ')" }
}

function Invoke-CodeSigning([string]$Target) {
  if (-not $CodeSignTool) {
    Write-Host "未配置代码签名工具，跳过签名: $Target"
    return
  }
  if (-not (Test-Path $CodeSignTool)) { throw "代码签名工具不存在: $CodeSignTool" }
  Invoke-Step $CodeSignTool @($CodeSignArgument + @($Target))
}

Write-Host "[1/7] 运行测试和构建"
Invoke-Step 'npm.cmd' @('test', '--', '--maxWorkers=1', '--minWorkers=1')
Invoke-Step 'npm.cmd' @('run', 'build')

$electronDist = Join-Path $ProjectRoot '.runtime-electron\node_modules\electron\dist'
$runtimeRoot = Join-Path $ProjectRoot 'vendor\qianshan-runtime'
$binaryRoot = Join-Path $ProjectRoot 'resources\bin'
$loginBackground = Join-Path $ProjectRoot 'resources\operation-login-bg.mp4'
$loginBackgroundImage = Join-Path $ProjectRoot 'resources\operation-login-bg.png'
$binaryNames = @('ffmpeg.exe', 'ffprobe.exe', 'yt-dlp.exe')
foreach ($required in @(
  (Join-Path $electronDist 'electron.exe'),
  (Join-Path $ProjectRoot 'dist-electron\electron\main.js'),
    (Join-Path $ProjectRoot 'resources\icon.png'),
    (Join-Path $ProjectRoot 'resources\icon.ico'),
    $loginBackground,
    $loginBackgroundImage,
  (Join-Path $runtimeRoot 'dist\server.js'),
  (Join-Path $runtimeRoot 'renderer\dist\index.html'),
  (Join-Path $runtimeRoot 'node_modules')
)) {
  if (-not (Test-Path $required)) { throw "缺少发布依赖: $required" }
}
foreach ($binaryName in $binaryNames) {
  $binaryPath = Join-Path $binaryRoot $binaryName
  if (-not (Test-Path $binaryPath)) { throw "缺少媒体运行组件: $binaryPath" }
}

$releaseDirectory = Join-Path $OutputRoot "operation-shrimp\$Version"
$stageRoot = Join-Path $OutputRoot "stage\operation-shrimp\$Version\Yunyingxia"
Assert-UnderProject $releaseDirectory
if (Test-Path $stageRoot) { Remove-Item $stageRoot -Recurse -Force }
New-Item $stageRoot -ItemType Directory -Force | Out-Null
$appRoot = Join-Path $stageRoot 'resources\app'
New-Item $appRoot -ItemType Directory -Force | Out-Null

Write-Host "[2/7] 复制 Electron 运行时"
Copy-Item (Join-Path $electronDist '*') $stageRoot -Recurse -Force
if (Test-Path (Join-Path $stageRoot 'electron.exe')) {
  Rename-Item (Join-Path $stageRoot 'electron.exe') 'Yunyingxia.exe'
}
$rcedit = Join-Path $ProjectRoot 'node_modules\rcedit\bin\rcedit-x64.exe'
if (-not (Test-Path $rcedit)) { throw "缺少 rcedit，无法写入 exe 图标: $rcedit" }
Invoke-Step $rcedit @(
  (Join-Path $stageRoot 'Yunyingxia.exe'),
  '--set-icon',
  (Join-Path $ProjectRoot 'resources\icon.ico')
)
Invoke-CodeSigning (Join-Path $stageRoot 'Yunyingxia.exe')
$stageDefaultAppArchive = Join-Path $stageRoot 'resources\default_app.asar'
if (Test-Path $stageDefaultAppArchive) { Remove-Item $stageDefaultAppArchive -Force }

$stageBinaryRoot = Join-Path $stageRoot 'resources\bin'
New-Item $stageBinaryRoot -ItemType Directory -Force | Out-Null
Copy-Item (Join-Path $binaryRoot '*') $stageBinaryRoot -Force
Copy-Item (Join-Path $ProjectRoot 'resources\icon.png') (Join-Path $stageRoot 'resources\icon.png') -Force
Copy-Item (Join-Path $ProjectRoot 'resources\icon.ico') (Join-Path $stageRoot 'resources\icon.ico') -Force
Copy-Item $loginBackground (Join-Path $stageRoot 'resources\operation-login-bg.mp4') -Force
Copy-Item $loginBackgroundImage (Join-Path $stageRoot 'resources\operation-login-bg.png') -Force

Write-Host "[3/7] 复制运行所需的编译产物"
Copy-Item (Join-Path $ProjectRoot 'package.json') $appRoot -Force
Copy-Item (Join-Path $ProjectRoot 'dist-electron') (Join-Path $appRoot 'dist-electron') -Recurse -Force
New-Item (Join-Path $appRoot 'vendor\qianshan-runtime') -ItemType Directory -Force | Out-Null
Copy-Item (Join-Path $runtimeRoot 'package.json') (Join-Path $appRoot 'vendor\qianshan-runtime\package.json') -Force
foreach ($dir in @('dist', 'renderer', 'drizzle', 'node_modules')) {
  Copy-Item (Join-Path $runtimeRoot $dir) (Join-Path $appRoot "vendor\qianshan-runtime\$dir") -Recurse -Force
}

Write-Host "[4/7] 写入商业配置并清理源码/开发文件"
$manifestTool = Join-Path $ProjectRoot 'packaging\build\manifest-tool.cjs'
$asarTool = Join-Path $ProjectRoot 'packaging\build\package-app.cjs'
$temporaryIntegrityKey = $false
if (-not $IntegrityPrivateKeyPath) {
  $IntegrityPrivateKeyPath = Join-Path $env:TEMP "wanshan-integrity-$([guid]::NewGuid().ToString('N')).pem"
  Invoke-Step 'node.exe' @($manifestTool, 'generate', $IntegrityPrivateKeyPath)
  $temporaryIntegrityKey = $true
} elseif (-not (Test-Path $IntegrityPrivateKeyPath)) {
  throw "完整性签名私钥文件不存在: $IntegrityPrivateKeyPath"
}
$integrityPublicKey = (& node.exe $manifestTool 'public' $IntegrityPrivateKeyPath).Trim()
if ($LASTEXITCODE -ne 0 -or $integrityPublicKey.Length -lt 40) { throw '无法读取完整性签名公钥' }
$commercialConfig = [ordered]@{
  commercial = [bool]$Commercial
  licenseServerUrl = $LicenseServerUrl.TrimEnd('/')
  licensePublicKey = if ($Commercial) { $LicensePublicKey } else { '' }
  accountServerUrl = $AccountServerUrl.TrimEnd('/')
  accountPublicKey = if ($Commercial) { $AccountPublicKey.Trim() } else { '' }
  updatePublicKey = if ($Commercial) { $UpdatePublicKey.Trim() } else { '' }
  integrityPublicKey = $integrityPublicKey
  productCode = $ProductCode
  offlineGraceHours = 72
  appName = '运营虾'
  version = $Version
}
$commercialConfig | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $appRoot 'commercial-config.json') -Encoding UTF8

Write-Host "迁移第三方依赖中指向 src/ 的运行入口"
$runtimeNodeModules = Join-Path $appRoot 'vendor\qianshan-runtime\node_modules'
if (Test-Path $runtimeNodeModules) {
  foreach ($packageJsonFile in Get-ChildItem $runtimeNodeModules -Recurse -File -Filter 'package.json' -ErrorAction SilentlyContinue) {
    $packageRoot = $packageJsonFile.Directory.FullName
    $packageJsonText = Get-Content $packageJsonFile.FullName -Raw
    $packageJson = $packageJsonText | ConvertFrom-Json
    $changedPackageJson = $false
    foreach ($field in @('main', 'module')) {
      $entry = [string]$packageJson.$field
      if ($entry -match '^(?:\./)?src[\\/]') {
        $srcDir = Join-Path $packageRoot 'src'
        $distDir = Join-Path $packageRoot 'dist'
        if (-not (Test-Path $srcDir)) { throw "依赖入口指向 src 但目录不存在: $($packageJsonFile.FullName) -> $entry" }
        if (Test-Path $distDir) { Remove-Item $distDir -Recurse -Force }
        Copy-Item $srcDir $distDir -Recurse -Force
        $packageJson.$field = ($entry -replace '^(?:\./)?src([\\/])', './dist/')
        $changedPackageJson = $true
      }
    }
    if ($changedPackageJson) {
      $packageJson |
        ConvertTo-Json -Depth 50 -Compress:$false |
        Set-Content $packageJsonFile.FullName -Encoding UTF8
    }
  }
}

$removePatterns = @(
  '*.map', '*.ts', '*.tsx', '*.py', '*.pyc', '*.md', '*.log', '*.db', '*.sqlite', '*.sqlite3', '*.pem', '*.key',
  '*.c', '*.cc', '*.cpp', '*.cxx', '*.h', '*.hh', '*.hpp'
)
foreach ($pattern in $removePatterns) {
  Get-ChildItem $appRoot -Recurse -File -Filter $pattern -ErrorAction SilentlyContinue | Remove-Item -Force
}
Get-ChildItem $appRoot -Recurse -Directory -Force -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match '^(src|test|tests|__tests__|\.git)$' } |
  Sort-Object FullName -Descending |
  Remove-Item -Recurse -Force
Get-ChildItem $appRoot -Recurse -File -Force -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match '^(README|CHANGELOG|CONTRIBUTING)' } |
  Remove-Item -Force

$forbidden = Get-ChildItem $appRoot -Recurse -File -Force | Where-Object {
  $_.Extension -match '^\.(map|ts|tsx|py|pyc|db|sqlite|sqlite3|pem|key|c|cc|cpp|cxx|h|hh|hpp)$' -or $_.Name -match '^\.env'
}
if ($forbidden) { throw "发布目录仍包含敏感/源码文件: $($forbidden.FullName -join ', ')" }
$forbiddenDirs = Get-ChildItem $appRoot -Recurse -Directory -Force | Where-Object {
  $_.Name -match '^(src|test|tests|__tests__|\.git)$'
}
if ($forbiddenDirs) { throw "发布目录仍包含源码/测试目录: $($forbiddenDirs.FullName -join ', ')" }

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
Invoke-Step 'node.exe' @($manifestTool, 'sign', (Join-Path $appRoot 'integrity_manifest.json'), $IntegrityPrivateKeyPath)
if ($temporaryIntegrityKey -and (Test-Path $IntegrityPrivateKeyPath)) { Remove-Item $IntegrityPrivateKeyPath -Force }
$manifestPath = Join-Path $appRoot 'integrity_manifest.json'
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
$manifestCount = @($manifest.files.psobject.Properties).Count
if ($manifestCount -lt 10) { throw '完整性清单文件数量异常，拒绝发布' }

Write-Host "[6/7] 打包应用为 app.asar"
$appArchive = Join-Path $stageRoot 'resources\app.asar'
Invoke-Step 'node.exe' @($asarTool, $appRoot, $appArchive)
Remove-Item $appRoot -Recurse -Force

Write-Host "[7/7] 验收发布目录"
$requiredRelease = @(
  'resources/app.asar',
  'resources/app.asar.unpacked/vendor/qianshan-runtime/node_modules/@img/sharp-win32-x64/lib/sharp-win32-x64.node',
  'resources/bin/ffmpeg.exe',
  'resources/bin/ffprobe.exe',
  'resources/bin/yt-dlp.exe',
  'Yunyingxia.exe'
)
foreach ($relative in $requiredRelease) {
  if (-not (Test-Path (Join-Path $stageRoot $relative))) { throw "发布文件缺失: $relative" }
}

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
    Write-Host "生成 Inno Setup 安装包"
    $installer = Join-Path $releaseDirectory "YunyingxiaSetup_$Version.exe"
    New-Item $releaseDirectory -ItemType Directory -Force | Out-Null
    $isccArguments = @(
      "/DMyAppVersion=$Version",
      "/DStageDir=$stageRoot",
      "/DOutputDir=$releaseDirectory",
      "/DIconFile=$(Join-Path $ProjectRoot 'resources\icon.ico')",
      (Join-Path $ProjectRoot 'packaging\installer\WanshanMedia.iss')
    )
    if ($InnoSignToolCommand) {
      $isccArguments = @("/SCodeSign=$InnoSignToolCommand", '/DSignToolName=CodeSign') + $isccArguments
    }
    Invoke-Step $iscc.Source $isccArguments
     if (-not (Test-Path $installer)) { throw "安装包未生成: $installer" }
    $installerInfo = Get-Item $installer
    $installerHash = (Get-FileHash $installer -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-Host "发布产物: $installer"
    Write-Host "版本: $Version  SHA256: $installerHash  字节数: $($installerInfo.Length)"
  }
}

[pscustomobject]@{
  version = $Version
  commercial = [bool]$Commercial
  stage = $stageRoot
  manifest = "$appArchive::/integrity_manifest.json"
  installer = $installer
} | ConvertTo-Json
