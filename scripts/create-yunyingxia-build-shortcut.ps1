[CmdletBinding()]
param(
  [string]$DesktopPath = [Environment]::GetFolderPath('Desktop')
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$target = Join-Path $projectRoot 'build_yunyingxia_release.bat'
$icon = Join-Path $projectRoot 'resources\icon.ico'
$shortcutPath = Join-Path $DesktopPath '运营虾一键打包.lnk'

if (-not (Test-Path -LiteralPath $target)) { throw "找不到打包脚本: $target" }
if (-not (Test-Path -LiteralPath $icon)) { throw "找不到图标: $icon" }

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $target
$shortcut.WorkingDirectory = $projectRoot
$shortcut.IconLocation = "$icon,0"
$shortcut.Description = '运营虾商业版一键打包'
$shortcut.Save()

Write-Host "已创建桌面快捷方式: $shortcutPath"
