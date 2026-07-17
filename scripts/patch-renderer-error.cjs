#!/usr/bin/env node
const fs = require('node:fs')

const fallbackPattern = /function _xe\(\)\{.*?\}const Nxe=c\.createElement\(_xe,null\);/
const replacement = 'function _xe(){return c.createElement("div",{style:{padding:"24px",fontFamily:"-apple-system,BlinkMacSystemFont,Segoe UI,Microsoft YaHei,sans-serif",color:"#344054"}},c.createElement("strong",null,"操作错误，稍后再试"),c.createElement("div",{style:{marginTop:"8px",fontSize:"13px"}},"请稍后重试。"))}const Nxe=c.createElement(_xe,null);'

const files = process.argv.slice(2)
if (!files.length) {
  console.error('usage: node patch-renderer-error.cjs <renderer bundle>...')
  process.exit(2)
}

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8')
  if (source.includes('Unexpected Application Error!')) {
    if (!fallbackPattern.test(source)) {
      throw new Error(`React Router fallback pattern not found: ${file}`)
    }
    const patched = source.replace(fallbackPattern, replacement)
    fs.writeFileSync(file, patched, 'utf8')
    continue
  }
  if (!source.includes('操作错误，稍后再试')) {
    throw new Error(`renderer fallback marker not found: ${file}`)
  }
}
