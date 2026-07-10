#define MyAppName "万山自媒体"
#ifndef MyAppVersion
  #define MyAppVersion "0.1.0"
#endif
#ifndef StageDir
  #define StageDir "release\stage\WanshanMedia"
#endif
#ifndef OutputDir
  #define OutputDir "release"
#endif

[Setup]
AppId={{B5D3D2EF-32D0-4E9B-A9CB-6CFEF7F0D7D6}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=万山自媒体
DefaultDirName={autopf}\WanshanMedia
DefaultGroupName={#MyAppName}
OutputDir={#OutputDir}
OutputBaseFilename=WanshanMediaSetup_{#MyAppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes
RestartApplications=no
UninstallDisplayName={#MyAppName}

[Files]
Source: "{#StageDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

; 覆盖安装前清理旧的应用文件。用户数据位于 %LOCALAPPDATA%，不在安装目录。
[InstallDelete]
Type: filesandordirs; Name: "{app}\resources\app"
Type: files; Name: "{app}\*.py"
Type: files; Name: "{app}\*.pyc"
Type: files; Name: "{app}\*.map"
Type: files; Name: "{app}\README*"
Type: files; Name: "{app}\*.log"
Type: files; Name: "{app}\*.tmp"
Type: files; Name: "{app}\*.bak"

[Icons]
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\WanshanMedia.exe"; WorkingDir: "{app}"
Name: "{group}\{#MyAppName}"; Filename: "{app}\WanshanMedia.exe"; WorkingDir: "{app}"

[Run]
Filename: "{app}\WanshanMedia.exe"; Description: "启动 {#MyAppName}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}"
