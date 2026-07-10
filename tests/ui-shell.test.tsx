import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import App from '../src/App'

describe('App shell', () => {
  it('starts on the 万山自媒体创作工作台 without a login view', () => {
    const html = renderToStaticMarkup(<App />)
    expect(html).toContain('万山自媒体')
    expect(html).toContain('创作工作台')
    expect(html).toContain('提示词库')
    expect(html).not.toContain('手机号')
    expect(html).not.toContain('密码')
  })
})
