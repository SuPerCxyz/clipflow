/**
 * Manual Capture：监听原生 copy 事件捕获复制文本（Ctrl/Cmd+C）。
 *
 * 设计约束：
 * - 只读取用户主动复制的选区（getSelection），不轮询、不读取系统剪贴板；
 * - 连续相同内容去重（页面级 lastContent + 后台最新一条双重校验）；
 * - 与 Auto Capture 并列的采集通道，由 ../content/main.ts 统一装配。
 */
import type { CapturePayload } from '../types'
import { resolveFavicon } from './favicon'

const MIN_LENGTH = 2

let lastContent = ''

/** 优先取文档选区；输入框内取 selection；兜底读 copy 事件携带的纯文本 */
function selectedText(event: ClipboardEvent): string {
  const sel = document.getSelection()?.toString() ?? ''
  if (sel.trim()) return sel

  const active = document.activeElement as
    | HTMLInputElement
    | HTMLTextAreaElement
    | null
  if (
    active &&
    ((active instanceof HTMLInputElement && active.type !== 'password') ||
      active instanceof HTMLTextAreaElement)
  ) {
    const s = active.selectionStart
    const e = active.selectionEnd
    if (s != null && e != null && e > s) return active.value.slice(s, e)
  }

  return event.clipboardData?.getData('text/plain') ?? ''
}

async function report(content: string): Promise<void> {
  const payload: CapturePayload = {
    content,
    url: location.href,
    title: document.title || '',
    favicon: resolveFavicon(),
    capturedAt: Date.now(),
  }
  try {
    await chrome.runtime.sendMessage({ type: 'CLIP_CAPTURED', payload })
  } catch {
    // 扩展更新/重载导致上下文失效时静默丢弃，不影响宿主页面
  }
}

/** 手动通道统一入口：清洗、长度与连续重复过滤后上报 */
export function captureContent(raw: string): void {
  const content = raw.replace(/\r\n/g, '\n').trim()
  if (content.length < MIN_LENGTH) return
  if (content === lastContent) return

  lastContent = content
  void report(content)
}

/**
 * 页面复制按钮监听：站点代码调用 navigator.clipboard.writeText/write 时
 * 不产生原生 copy 事件，由 MAIN 世界桥（spa-bridge）把文本放入
 * documentElement.dataset['clipflowCopy'] 并派发事件转发到这里。
 */
export function registerClipboardApiListener(): void {
  window.addEventListener('clipflow:clipboard-write', () => {
    const el = document.documentElement
    const text = el.dataset['clipflowCopy'] ?? ''
    if (!text) return
    delete el.dataset['clipflowCopy']
    captureContent(text)
  })
}

export function registerManualCapture(): void {
  document.addEventListener(
    'copy',
    (event: ClipboardEvent) => {
      if (event.defaultPrevented) return

      const ae = document.activeElement
      if (ae instanceof HTMLInputElement && ae.type === 'password') return

      captureContent(selectedText(event))
    },
    true,
  )
}
