/**
 * Content Script 构建入口：装配采集通道。
 * - Manual Capture：Ctrl/Cmd+C 原生 copy 事件
 * - Clipboard API：页面复制按钮（writeText/write 拦截，经 MAIN 世界桥转发）
 * - Selection Capture：选区稳定后自动记录（可在设置中关闭）
 * - Auto Capture ：URL 条件 + 整页可见文本 + 正则规则
 */
import { registerManualCapture, registerClipboardApiListener } from './copy-listener'
import { registerSelectionCapture } from './selection-listener'
import { initAutoCapture } from './auto-capture/engine'

registerManualCapture()
registerClipboardApiListener()
registerSelectionCapture()
initAutoCapture()

export {}
