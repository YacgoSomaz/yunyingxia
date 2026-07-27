import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const binaries = ["ffmpeg.exe", "ffprobe.exe", "yt-dlp.exe"];

describe("bundled media binaries", () => {
  it("keeps the original media binaries in the development resources directory", () => {
    for (const binary of binaries) {
      expect(existsSync(join(projectRoot, "resources", "bin", binary))).toBe(true);
    }
  });

  it("publishes media binaries beside the packaged app", () => {
    const buildScript = readFileSync(
      join(projectRoot, "packaging", "build", "build_release.ps1"),
      "utf8",
    );

    expect(buildScript).toContain("resources\\bin");
    for (const binary of binaries) {
      expect(buildScript).toContain(binary);
    }
  });

  it("removes Electron's default app archive from the release resources directory", () => {
    const buildScript = readFileSync(
      join(projectRoot, "packaging", "build", "build_release.ps1"),
      "utf8",
    );

    expect(buildScript).toContain("$stageDefaultAppArchive");
    expect(buildScript).toContain("resources\\default_app.asar");
  });

  it("requires unpacked native modules in the release output and installer cleanup", () => {
    const buildScript = readFileSync(
      join(projectRoot, "packaging", "build", "build_release.ps1"),
      "utf8",
    );
    const installerScript = readFileSync(
      join(projectRoot, "packaging", "installer", "WanshanMedia.iss"),
      "utf8",
    );

    expect(buildScript).toContain("resources/app.asar.unpacked");
    expect(buildScript).toContain("integrity-policy.js");
    expect(buildScript).toContain("$packagedPackageJson.version = $Version");
    expect(buildScript).toContain("sharp-win32-x64.node");
    expect(installerScript).toContain('Name: "{app}\\resources"');
    expect(installerScript).toContain("CloseApplicationsFilter=Yunyingxia.exe,WanshanMedia.exe");
    expect(installerScript).toContain('CloseApplications=no');
    expect(installerScript).toContain('UsePreviousAppDir=yes');
    expect(installerScript).toContain('AlwaysShowDirOnReadyPage=yes');
    expect(installerScript).toContain('任务管理器结束 Yunyingxia.exe 后重试');
    expect(installerScript).toContain('tasklist /FI');
    expect(installerScript).toContain('/F /IM "Yunyingxia.exe" /T');
    expect(installerScript).toContain('/F /IM "WanshanMedia.exe" /T');
    expect(installerScript).toContain('SignTool');
    expect(installerScript).toContain('AppId={{B5D3D2EF-32D0-4E9B-A9CB-6CFEF7F0D7D6}');
    expect(installerScript).toContain('ValueName: "InstallDir"');
    expect(installerScript).toContain('ValueName: "Version"');
    expect(installerScript).toContain('function InitializeSetup(): Boolean;');
    expect(installerScript).toContain('function ShouldLaunchExistingInsteadOfInstall(): Boolean;');
    expect(installerScript).toContain('CompareVersionStrings(InstalledVersion, \'{#MyAppVersion}\') >= 0');
    expect(installerScript).toContain('function IsUpdateInvocation(): Boolean;');
    expect(installerScript).toContain("ParamStr(Index), '/UPDATE'");
    expect(installerScript).toContain('已安装运营虾，现已为你打开程序。');
    expect(installerScript).toContain('Name: "{userdesktop}\\{#MyAppName}.lnk"');
    expect(installerScript).toContain('Name: "{commondesktop}\\{#MyAppName}.lnk"');
    expect(installerScript).toContain('Name: "chinesesimp"; MessagesFile: "{#SourcePath}\\languages\\ChineseSimplified.isl"');
    expect(existsSync(join(projectRoot, "packaging", "installer", "languages", "ChineseSimplified.isl"))).toBe(true);
    expect(installerScript).toContain('{autopf}\\Yunyingxia\\Yunyingxia.exe');
    expect(installerScript).toContain('Name: "{app}\\resources"');
    expect(installerScript).toContain('RemoveUserDataOnUninstall');
    expect(existsSync(join(projectRoot, "electron", "integrity-policy.ts"))).toBe(true);
  });

  it("keeps installers in an immutable product/version directory and reserves real signing hooks", () => {
    const buildScript = readFileSync(join(projectRoot, "packaging", "build", "build_release.ps1"), "utf8");
    expect(buildScript).toContain("operation-shrimp");
    expect(buildScript).toContain("$Version");
    expect(buildScript).toContain("CodeSignTool");
    expect(buildScript).toContain("InnoSignToolCommand");
    expect(buildScript).toContain("Get-FileHash");
  });

  it("tracks versioned installer directories through Git LFS", () => {
    const attributes = readFileSync(join(projectRoot, ".gitattributes"), "utf8");
    expect(attributes).toContain("release/**/*.exe filter=lfs");
  });

  it("keeps a clearly named Yunyingxia release entrypoint that forwards build options", () => {
    const entrypoint = readFileSync(
      join(projectRoot, "packaging", "build", "build_yunyingxia_release.ps1"),
      "utf8",
    );
    const packageJson = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));

    expect(entrypoint).toContain("Join-Path $PSScriptRoot 'build_release.ps1'");
    expect(entrypoint).toContain("& $scriptPath @forwardedParameters");
    expect(packageJson.scripts["package:yunyingxia"]).toContain(
      "build_yunyingxia_release.ps1",
    );
  });

  it("ships a double-clickable commercial release batch entrypoint", () => {
    const batchFile = readFileSync(join(projectRoot, "build_yunyingxia_release.bat"), "utf8");

    expect(batchFile).toContain("packaging\\build\\build_yunyingxia_release.ps1");
    expect(batchFile).toContain("operation_shrimp");
    expect(batchFile).toContain("-Commercial");
    expect(batchFile).toContain("-IntegrityPrivateKeyPath");
    expect(batchFile).toContain("Release version");
  });

  it("rejects source directories and native build source files from commercial packages", () => {
    const buildScript = readFileSync(
      join(projectRoot, "packaging", "build", "build_release.ps1"),
      "utf8",
    );

    expect(buildScript).toContain("^(src|test|tests|__tests__|\\.git)$");
    expect(buildScript).toContain("*.cpp");
    expect(buildScript).toContain("forbiddenDirs");
    expect(buildScript).toContain("源码/测试目录");
  });

  it("moves runtime dependency entrypoints out of src before pruning source directories", () => {
    const buildScript = readFileSync(
      join(projectRoot, "packaging", "build", "build_release.ps1"),
      "utf8",
    );

    expect(buildScript).toContain("迁移第三方依赖中指向 src/ 的运行入口");
    expect(buildScript).toContain("$packageJson.$field");
    expect(buildScript).toContain("./dist/");
  });

  it("hardens core commercial JavaScript before signing the integrity manifest", () => {
    const buildScript = readFileSync(
      join(projectRoot, "packaging", "build", "build_release.ps1"),
      "utf8",
    );
    const hardenScript = readFileSync(
      join(projectRoot, "packaging", "build", "harden-core-js.cjs"),
      "utf8",
    );

    expect(buildScript).toContain("harden-core-js.cjs");
    expect(buildScript.indexOf("harden-core-js.cjs")).toBeLessThan(
      buildScript.indexOf("生成 integrity_manifest.json"),
    );
    expect(hardenScript).toContain("dist-electron/electron/account-service.js");
    expect(hardenScript).toContain("dist-electron/electron/integrity-verifier.js");
    expect(hardenScript).toContain("dist-electron/electron/update-service.js");
    expect(hardenScript).toContain("vendor/qianshan-runtime/dist/paid-action-auth.js");
    expect(hardenScript).toContain("minify: true");
    expect(hardenScript).toContain("JavaScriptObfuscator.obfuscate");
    expect(hardenScript).toContain("controlFlowFlattening: true");
    expect(hardenScript).toContain("stringArrayEncoding: ['base64']");
    expect(hardenScript).toContain("splitStrings: true");
  });

  it("packages the compiled runtime release monitor without development-only files", () => {
    const buildScript = readFileSync(
      join(projectRoot, "packaging", "build", "build_release.ps1"),
      "utf8",
    );
    const monitorSource = readFileSync(join(projectRoot, "electron", "release-monitor.ts"), "utf8");

    expect(buildScript).toContain("Copy-Item (Join-Path $ProjectRoot 'dist-electron')");
    expect(monitorSource).toContain("RELEASE_POLL_INTERVAL_MS = 60_000");
    expect(monitorSource).toContain("releaseEventsEndpoint");
    expect(monitorSource).not.toContain("process.env.UPDATE_");
  });
});
