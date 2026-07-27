import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(path.resolve(__dirname, '../electron/account-window.ts'), 'utf8')

describe('account login window entitlement handoff', () => {
  it('uses the main-process entitled result to enter the workbench after refresh', () => {
    expect(source).toContain('if (entitled) activeWindowAuthenticated = true')
    expect(source).toContain('showMember(res.state,plans.plans,res.entitled===true)')
    expect(source).toContain('if(res.entitled===true)return true')
    expect(source).toContain('function closeWhenEntitled()')
  })

  it('does not rely on the login page duplicating account license validation', () => {
    expect(source).toContain('if(r.entitled){setStatus')
    expect(source).toContain('closeWhenEntitled();return')
    expect(source).not.toContain('if(r.entitled){setStatus(\'会员状态有效，正在进入工作台…\',true);return}')
  })
})
