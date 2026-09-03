import { describe, expect, it } from 'vitest'
import { extractPageText } from '../src/content/auto-capture/page-text'
import { executeRule } from '../src/auto-capture/regex'
import type { AutoCaptureRule } from '../src/auto-capture/types'

function fakeBody(
  innerText: string,
  controls: Array<{ value: string; type?: string }>,
  attrs: Record<string, string>[],
): HTMLElement {
  return {
    innerText,
    textContent: innerText,
    querySelectorAll(selector: string) {
      if (selector.startsWith('textarea')) return controls as unknown as NodeListOf<Element>
      return attrs.map((values) => ({
        getAttribute(name: string) {
          return values[name] ?? null
        },
      })) as unknown as NodeListOf<Element>
    },
  } as unknown as HTMLElement
}

describe('extractPageText', () => {
  it('把复制控件值和复制载荷属性交给自动采集规则', () => {
    const magnet = 'magnet:?xt=urn:btih:c18718df1a4b785a50690e04f0a207a429cf00b5'
    const page = extractPageText(
      fakeBody('页面正文\n磁力链接\n复制', [{ value: magnet }], [
        { 'data-magnet': magnet },
        { 'data-copy-text': '可复制的其他内容' },
      ]),
    )

    expect(page.text).toContain('页面正文')
    expect(page.text.match(/magnet:\?xt=urn:btih:/g)).toHaveLength(1)
    expect(page.text).toContain('可复制的其他内容')

    const rule = {
      pattern: {
        regex: '(magnet:\\?\\S+)',
        flags: 'i',
        captureGroup: 1,
      },
    } as AutoCaptureRule
    expect(executeRule(rule, page.text)[0].content).toBe(magnet)
  })

  it('不采集密码控件值', () => {
    const page = extractPageText(
      fakeBody('正文', [{ value: 'secret', type: 'password' }], []),
    )

    expect(page.text).not.toContain('secret')
  })
})
