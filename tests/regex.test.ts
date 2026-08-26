import { describe, expect, it } from 'vitest'
import { executeRule, validateRegex } from '../src/auto-capture/regex'
import type { AutoCaptureRule } from '../src/auto-capture/types'

function rule(regex: string, flags = '', captureGroup = 0): AutoCaptureRule {
  return {
    id: 'r_test',
    name: 'test',
    enabled: true,
    urlCondition: { type: 'all', value: '*' },
    pattern: { regex, flags, captureGroup },
    triggers: { pageLoad: true, spaNavigation: false, domChange: false },
    deduplication: { enabled: true, scope: 'page' },
    createdAt: 0,
    updatedAt: 0,
  }
}

describe('validateRegex', () => {
  it('合法正则通过', () => {
    expect(validateRegex('ERROR\\s+(.+)', 'gi').valid).toBe(true)
  })
  it('非法正则报具体错误且不抛出', () => {
    const v = validateRegex('([', '')
    expect(v.valid).toBe(false)
    expect(v.error).toBeTruthy()
  })
  it('拒绝非法与重复 flags', () => {
    expect(validateRegex('a', 'gx').valid).toBe(false)
    expect(validateRegex('a', 'ggi').valid).toBe(false)
    expect(validateRegex('a', 'gimsuy').valid).toBe(true)
  })
  it('空正则视为错误', () => {
    expect(validateRegex('   ', '').valid).toBe(false)
  })
})

describe('executeRule', () => {
  const pageText = [
    'INFO server started',
    'ERROR RabbitMQ connection timeout',
    'INFO retrying',
    'ERROR database disconnected',
  ].join('\n')

  it('多行多匹配（m + g）', () => {
    const ms = executeRule(rule('^ERROR.*$', 'gm'), pageText)
    expect(ms).toHaveLength(2)
    expect(ms[0].content).toContain('RabbitMQ')
    expect(ms[1].content).toContain('database disconnected')
  })

  it('用户漏写 g 时仍提取全部结果（内部强制 g）', () => {
    const ms = executeRule(rule('ERROR \\w+', 'i'), pageText)
    expect(ms).toHaveLength(2)
  })

  it('captureGroup 提取捕获组内容', () => {
    const text = '订单号：ORD-20260826-10001 处理完成'
    const ms = executeRule(rule('订单号[:：]\\s*([A-Z0-9-]+)', '', 1), text)
    expect(ms).toHaveLength(1)
    expect(ms[0].content).toBe('ORD-20260826-10001')
    expect(ms[0].index).toBe(0)
  })

  it('$0 返回完整匹配；越界组回退完整匹配', () => {
    const ms0 = executeRule(rule('ID: (\\d+)', '', 0), 'ID: 123')
    expect(ms0[0].content).toBe('ID: 123')
    const msBad = executeRule(rule('ID: (\\d+)', '', 5), 'ID: 123')
    expect(msBad[0].content).toBe('ID: 123')
  })

  it('zero-length 匹配不死循环、跳过空结果', () => {
    const ms = executeRule(rule('a*', ''), 'bab')
    expect(ms.map((m) => m.content)).toEqual(['a'])
    const dots = executeRule(rule('.*', 's'), '') // 空文本上的 .*
    expect(dots).toEqual([])
  })

  it('非法正则 throw，由调用方逐规则隔离', () => {
    expect(() => executeRule(rule('(['), 'abc')).toThrow()
  })

  it('匹配数量受 MAX_MATCHES_PER_RULE 上限保护', () => {
    const bigText = 'x'.repeat(50000)
    const ms = executeRule(rule('x', 'g'), bigText)
    expect(ms.length).toBeLessThanOrEqual(500)
  })
})
