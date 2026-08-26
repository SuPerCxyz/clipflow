import { describe, expect, it } from 'vitest'
import { normalizeCaptureText } from '../src/auto-capture/normalize'
import { createCaptureFingerprint } from '../src/auto-capture/fingerprint'

describe('normalizeCaptureText（保守归一）', () => {
  it('CRLF → LF', () => {
    expect(normalizeCaptureText('a\r\nb')).toBe('a\nb')
    expect(normalizeCaptureText('a\rb')).toBe('a\nb')
  })
  it('连续空格/制表符折叠为单空格', () => {
    expect(normalizeCaptureText('ERROR   timeout\t\tagain')).toBe('ERROR timeout again')
    expect(normalizeCaptureText('ERROR\u00a0 timeout')).toBe('ERROR timeout')
  })
  it('3 个以上连续换行折叠为一个空行', () => {
    expect(normalizeCaptureText('a\n\n\n\nb')).toBe('a\n\nb')
  })
  it('保留单个换行（不破坏日志结构）', () => {
    expect(normalizeCaptureText('line1\nline2')).toBe('line1\nline2')
  })
  it('trim 首尾空白', () => {
    expect(normalizeCaptureText('  hello  ')).toBe('hello')
  })
})

describe('createCaptureFingerprint', () => {
  const base = { ruleId: 'r1', content: 'error timeout' }

  it('相同输入 → 相同指纹', async () => {
    const a = await createCaptureFingerprint({ ...base, url: 'https://e.com/a', scope: 'page' })
    const b = await createCaptureFingerprint({ ...base, url: 'https://e.com/a', scope: 'page' })
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('不同规则 → 不同指纹', async () => {
    const a = await createCaptureFingerprint({ ...base, ruleId: 'r1', url: 'https://e.com/', scope: 'page' })
    const b = await createCaptureFingerprint({ ...base, ruleId: 'r2', url: 'https://e.com/', scope: 'page' })
    expect(a).not.toBe(b)
  })

  it('page scope：不同 URL → 不同指纹；仅 hash 差异不影响', async () => {
    const a = await createCaptureFingerprint({ ...base, url: 'https://e.com/p1', scope: 'page' })
    const b = await createCaptureFingerprint({ ...base, url: 'https://e.com/p2', scope: 'page' })
    const c = await createCaptureFingerprint({ ...base, url: 'https://e.com/p1#section', scope: 'page' })
    expect(a).not.toBe(b)
    expect(a).toBe(c)
  })

  it('global scope：URL 不参与指纹', async () => {
    const a = await createCaptureFingerprint({ ...base, url: 'https://e.com/p1', scope: 'global' })
    const b = await createCaptureFingerprint({ ...base, url: 'https://other.com/x?y=1', scope: 'global' })
    expect(a).toBe(b)
  })

  it('query 变化视为不同页面（page scope）', async () => {
    const a = await createCaptureFingerprint({ ...base, url: 'https://e.com/log?page=1', scope: 'page' })
    const b = await createCaptureFingerprint({ ...base, url: 'https://e.com/log?page=2', scope: 'page' })
    expect(a).not.toBe(b)
  })
})
