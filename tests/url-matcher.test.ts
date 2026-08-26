import { describe, expect, it } from 'vitest'
import { matchUrl } from '../src/auto-capture/url-matcher'
import type { AutoCaptureUrlCondition } from '../src/auto-capture/types'

const c = (type: AutoCaptureUrlCondition['type'], value: string): AutoCaptureUrlCondition => ({
  type,
  value,
})

describe('matchUrl', () => {
  it('all：匹配任意 http(s)，拒绝浏览器内部页面', () => {
    expect(matchUrl(c('all', '*'), 'https://example.com/logs')).toBe(true)
    expect(matchUrl(c('all', '*'), 'http://127.0.0.1:8765/a?x=1#hash')).toBe(true)
    expect(matchUrl(c('all', '*'), 'chrome://extensions')).toBe(false)
    expect(matchUrl(c('all', '*'), 'about:blank')).toBe(false)
  })

  it('wildcard：https://example.com/* 匹配同源任意路径', () => {
    const cond = c('wildcard', 'https://example.com/*')
    expect(matchUrl(cond, 'https://example.com/')).toBe(true)
    expect(matchUrl(cond, 'https://example.com/logs?page=2')).toBe(true)
    expect(matchUrl(cond, 'https://evil.example.com/logs')).toBe(false)
    expect(matchUrl(cond, 'http://example.com/logs')).toBe(false)
  })

  it('wildcard：*://*.example.com/* 跨 scheme 与子域', () => {
    const cond = c('wildcard', '*://*.example.com/*')
    expect(matchUrl(cond, 'https://api.example.com/v1/list')).toBe(true)
    expect(matchUrl(cond, 'http://www.example.com/')).toBe(true)
    expect(matchUrl(cond, 'https://example.com/root')).toBe(true) // 裸域名同样命中
    expect(matchUrl(cond, 'https://a.b.example.com/deep')).toBe(true)
    expect(matchUrl(cond, 'https://example.org/')).toBe(false)
    expect(matchUrl(cond, 'https://api.example.org/v1')).toBe(false)
  })

  it('wildcard：* 与空值等价于所有页面', () => {
    expect(matchUrl(c('wildcard', '*'), 'https://a.com/x')).toBe(true)
    expect(matchUrl(c('wildcard', ''), 'ftp://a.com/x')).toBe(false)
  })

  it('regex：正则 URL 条件', () => {
    const cond = c('regex', 'https:\\/\\/example\\.com\\/logs\\/.*')
    expect(matchUrl(cond, 'https://example.com/logs/app-2026')).toBe(true)
    expect(matchUrl(cond, 'https://example.com/logsX/app')).toBe(false) // /logs/ 后必须有斜杠
    expect(matchUrl(cond, 'https://example.com/logs/x/y')).toBe(true)
    expect(matchUrl(cond, 'https://example.com/other')).toBe(false)
  })

  it('非法 URL 正则不抛异常，返回 false（规则隔离）', () => {
    expect(matchUrl(c('regex', '(['), 'https://example.com/')).toBe(false)
    expect(matchUrl(c('regex', ''), 'https://example.com/')).toBe(false)
  })
})
