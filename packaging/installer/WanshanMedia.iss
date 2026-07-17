#define MyAppName "运营虾"
#ifndef MyAppVersion
  #define MyAppVersion "0.1.0"
#endif
#ifndef StageDir
  #define StageDir "release\stage\Yunyingxia"
#endif
#ifndef OutputDir
  #define OutputDir "release"
#endif
#ifndef IconFile
  #define IconFile "..\..\resources\icon.ico"
#endif
#ifndef SignToolName
  #define SignToolName ""
#endif

[Setup]
AppId={{B5D3D2EF-32D0-4E9B-A9CB-6CFEF7F0D7D6}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=运营虾
DefaultDirName={autopf}\Yunyingxia
UsePreviousAppDir=yes
DisableDirPage=no
AlwaysShowDirOnReadyPage=yes
DefaultGroupName={#MyAppName}
OutputDir={#OutputDir}
OutputBaseFilename=YunyingxiaSetup_{#MyAppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=no
CloseApplicationsFilter=Yunyingxia.exe,WanshanMedia.exe
RestartApplications=no
UninstallDisplayName={#MyAppName}
UninstallDisplayIcon={app}\Yunyingxia.exe
SetupIconFile={#IconFile}
#if SignToolName != ""
; When configured by the build script, Inno signs both the setup EXE and its embedded uninstaller.
SignTool={#SignToolName}
#endif

[Languages]
Name: "chinesesimp"; MessagesFile: "{#SourcePath}\languages\ChineseSimplified.isl"

[Files]
Source: "{#StageDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Registry]
; Used only to identify an existing installation when a user manually runs the installer again.
Root: HKLM64; Subkey: "Software\Yunyingxia"; ValueType: string; ValueName: "InstallDir"; ValueData: "{app}"; Flags: uninsdeletevalue
Root: HKLM64; Subkey: "Software\Yunyingxia"; ValueType: string; ValueName: "Version"; ValueData: "{#MyAppVersion}"; Flags: uninsdeletevalue

; 覆盖安装前清理全部旧运行时。用户数据位于 %LOCALAPPDATA%，不在安装目录。
[InstallDelete]
Type: files; Name: "{userdesktop}\{#MyAppName}.lnk"
Type: files; Name: "{commondesktop}\{#MyAppName}.lnk"
Type: files; Name: "{userdesktop}\万山自媒体.lnk"
Type: files; Name: "{commondesktop}\万山自媒体.lnk"
Type: files; Name: "{userdesktop}\千山AI.lnk"
Type: files; Name: "{commondesktop}\千山AI.lnk"
Type: files; Name: "{userdesktop}\WanshanMedia.lnk"
Type: files; Name: "{commondesktop}\WanshanMedia.lnk"
Type: filesandordirs; Name: "{app}\resources"
Type: filesandordirs; Name: "{app}\locales"
Type: files; Name: "{app}\WanshanMedia.exe"
Type: files; Name: "{app}\Yunyingxia.exe"
Type: files; Name: "{app}\*.dll"
Type: files; Name: "{app}\*.pak"
Type: files; Name: "{app}\*.bin"
Type: files; Name: "{app}\*.dat"
Type: files; Name: "{app}\*.py"
Type: files; Name: "{app}\*.pyc"
Type: files; Name: "{app}\*.map"
Type: files; Name: "{app}\README*"
Type: files; Name: "{app}\*.log"
Type: files; Name: "{app}\*.tmp"
Type: files; Name: "{app}\*.bak"

[Icons]
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\Yunyingxia.exe"; WorkingDir: "{app}"; IconFilename: "{app}\resources\icon.ico"
Name: "{group}\{#MyAppName}"; Filename: "{app}\Yunyingxia.exe"; WorkingDir: "{app}"; IconFilename: "{app}\resources\icon.ico"

[Run]
Filename: "{app}\Yunyingxia.exe"; Description: "启动 {#MyAppName}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}"
Type: filesandordirs; Name: "{localappdata}\Yunyingxia"; Check: RemoveUserDataOnUninstall
Type: filesandordirs; Name: "{localappdata}\WanshanMedia"; Check: RemoveUserDataOnUninstall
Type: filesandordirs; Name: "{tmp}\YunyingxiaUpdates"; Check: RemoveUserDataOnUninstall

[Code]
var
  RemoveUserData: Boolean;

function ProcessIsRunning(const ImageName: String): Boolean;
var
  ResultCode: Integer;
begin
  Exec(ExpandConstant('{cmd}'), '/C tasklist /FI "IMAGENAME eq ' + ImageName + '" /NH ^| find /I "' + ImageName + '" > nul', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := ResultCode = 0;
end;

function CloseYunyingxiaProcesses(): Boolean;
var
  ResultCode: Integer;
  Attempt: Integer;
begin
  for Attempt := 1 to 5 do begin
    if ProcessIsRunning('Yunyingxia.exe') then
      Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM "Yunyingxia.exe" /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    if ProcessIsRunning('WanshanMedia.exe') then
      Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM "WanshanMedia.exe" /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Sleep(500);
    if (not ProcessIsRunning('Yunyingxia.exe')) and (not ProcessIsRunning('WanshanMedia.exe')) then
      break;
  end;
  Result := (not ProcessIsRunning('Yunyingxia.exe')) and (not ProcessIsRunning('WanshanMedia.exe'));
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  if not CloseYunyingxiaProcesses() then
    Result := '安装器已尝试强制关闭运营虾，但进程仍被系统占用。请在任务管理器结束 Yunyingxia.exe 后重试。';
end;

function ExistingInstallExe(): String;
var
  InstallDir: String;
begin
  Result := '';
  if not RegQueryStringValue(HKLM64, 'Software\Yunyingxia', 'InstallDir', InstallDir) then
    RegQueryStringValue(HKLM32, 'Software\Yunyingxia', 'InstallDir', InstallDir);
  if FileExists(AddBackslash(InstallDir) + 'Yunyingxia.exe') then
    Result := AddBackslash(InstallDir) + 'Yunyingxia.exe';
  if (Result = '') and FileExists(ExpandConstant('{autopf}\Yunyingxia\Yunyingxia.exe')) then
    Result := ExpandConstant('{autopf}\Yunyingxia\Yunyingxia.exe');
end;

function ExistingInstallVersion(): String;
begin
  Result := '';
  if not RegQueryStringValue(HKLM64, 'Software\Yunyingxia', 'Version', Result) then
    RegQueryStringValue(HKLM32, 'Software\Yunyingxia', 'Version', Result);
end;

function VersionPart(const Version: String; var Offset: Integer): Integer;
var
  Buffer: String;
begin
  Buffer := '';
  while (Offset <= Length(Version)) and (Copy(Version, Offset, 1) <> '.') do begin
    Buffer := Buffer + Copy(Version, Offset, 1);
    Offset := Offset + 1;
  end;
  Offset := Offset + 1;
  Result := StrToIntDef(Buffer, 0);
end;

function CompareVersionStrings(const Left, Right: String): Integer;
var
  Index: Integer;
  LeftOffset: Integer;
  RightOffset: Integer;
  LeftPart: Integer;
  RightPart: Integer;
begin
  Result := 0;
  LeftOffset := 1;
  RightOffset := 1;
  for Index := 1 to 3 do begin
    LeftPart := VersionPart(Left, LeftOffset);
    RightPart := VersionPart(Right, RightOffset);
    if LeftPart > RightPart then begin
      Result := 1;
      exit;
    end;
    if LeftPart < RightPart then begin
      Result := -1;
      exit;
    end;
  end;
end;

function ShouldLaunchExistingInsteadOfInstall(): Boolean;
var
  InstalledVersion: String;
begin
  Result := False;
  InstalledVersion := ExistingInstallVersion();
  // Old packages did not always write Version. In that case allow the installer
  // to continue so a downloaded newer package can repair the installation.
  if InstalledVersion = '' then exit;
  Result := CompareVersionStrings(InstalledVersion, '{#MyAppVersion}') >= 0;
end;

function IsUpdateInvocation(): Boolean;
var
  Index: Integer;
begin
  Result := False;
  for Index := 1 to ParamCount do
    if CompareText(ParamStr(Index), '/UPDATE') = 0 then begin
      Result := True;
      exit;
    end;
end;

function InitializeSetup(): Boolean;
var
  InstalledExe: String;
  ResultCode: Integer;
begin
  Result := True;
  // Client updater always passes /UPDATE so signed in-app upgrades retain the normal Inno flow.
  if IsUpdateInvocation() then exit;
  InstalledExe := ExistingInstallExe();
  if (InstalledExe <> '') and ShouldLaunchExistingInsteadOfInstall() then begin
    ShellExec('', InstalledExe, '', ExtractFileDir(InstalledExe), SW_SHOWNORMAL, ewNoWait, ResultCode);
    MsgBox('已安装运营虾，现已为你打开程序。', mbInformation, MB_OK);
    Result := False;
  end;
end;

function InitializeUninstall(): Boolean;
begin
  RemoveUserData := MsgBox(
    '是否同时删除本机的账号会话、模型配置、作品和缓存？' + #13#10 + #13#10 +
    '选择“是”会彻底清除本地数据，选择“否”则保留数据以便后续重装恢复。',
    mbConfirmation,
    MB_YESNO
  ) = IDYES;
  Result := True;
end;

function RemoveUserDataOnUninstall(): Boolean;
begin
  Result := RemoveUserData;
end;
