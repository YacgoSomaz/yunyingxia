import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

describe('renderer error surface', () => {
  it('keeps runtime failures compact and non-blocking', () => {
    for (const file of [
      join(root, 'legacy-renderer', 'operating-shrimp-theme.js'),
      join(root, 'vendor', 'qianshan-runtime', 'renderer', 'dist', 'operating-shrimp-theme.js'),
    ]) {
      const theme = readFileSync(file, 'utf8')
      expect(theme).toContain('操作错误，稍后再试')
      expect(theme).toContain('window.addEventListener(\'error\'')
      expect(theme).toContain('window.addEventListener(\'unhandledrejection\'')
      expect(theme).toContain('Unexpected Application Error!')
      expect(theme).toContain("querySelectorAll('pre').forEach((node) => node.remove())")
    }
  })

  it('does not ship React Router raw-stack fallback text', () => {
    for (const file of [
      join(root, 'vendor', 'qianshan-runtime', 'renderer', 'dist', 'assets', 'index-BponW6ps.js'),
      join(root, 'legacy-renderer', 'assets', 'index-BponW6ps.js'),
    ]) {
      const bundle = readFileSync(file, 'utf8')
      expect(bundle).not.toContain('Unexpected Application Error!')
      expect(bundle).toContain('操作错误，稍后再试')
    }
  })
})
