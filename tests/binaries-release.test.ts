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
    expect(buildScript).toContain("sharp-win32-x64.node");
    expect(installerScript).toContain("{app}\\resources\\app.asar.unpacked");
  });
});
