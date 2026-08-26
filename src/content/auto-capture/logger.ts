/** 统一日志：debug 仅开发构建输出，warn/error 始终可见（低频） */
const DEBUG = import.meta.env.DEV

export const logger = {
  debug: (...args: unknown[]): void => {
    if (DEBUG) console.debug('[ClipFlow AutoCapture]', ...args)
  },
  warn: (...args: unknown[]): void => {
    console.warn('[ClipFlow AutoCapture]', ...args)
  },
  error: (...args: unknown[]): void => {
    console.error('[ClipFlow AutoCapture]', ...args)
  },
}
