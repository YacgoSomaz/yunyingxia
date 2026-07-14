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
$scriptPath = Join-Path $PSScriptRoot 'build_release.ps1'
$forwardedParameters = @{
  Version = $Version
  Commercial = $Commercial
  LicenseServerUrl = $LicenseServerUrl
  LicensePublicKey = $LicensePublicKey
  AccountServerUrl = $AccountServerUrl
  AccountPublicKey = $AccountPublicKey
  ProductCode = $ProductCode
  UpdatePublicKey = $UpdatePublicKey
  IntegrityPrivateKeyPath = $IntegrityPrivateKeyPath
  CodeSignTool = $CodeSignTool
  CodeSignArgument = $CodeSignArgument
  InnoSignToolCommand = $InnoSignToolCommand
  OutputRoot = $OutputRoot
  SkipInstaller = $SkipInstaller
}

& $scriptPath @forwardedParameters
exit $LASTEXITCODE
