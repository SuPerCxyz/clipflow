import { AUTO_DEBOUNCE_MS } from '../../auto-capture/constants'

export type ScanReason = 'page-load' | 'spa-navigation' | 'dom-change'

export interface Scheduler {
  /** 所有触发源统一入口：原因合并去抖；扫描运行中则挂起，完成后补跑一次 */
  schedule: (reason: ScanReason, delayMs?: number) => void
  dispose: () => void
}

/**
 * 统一调度器（防抖 + 防扫描风暴 + 原因合并）：
 * - 连续事件只保留最后一次执行时机；
 * - 原因进入「待处理集合并集」——不同触发源同时发生时互不覆盖
 *   （如 pushState 后紧跟 DOM 变化：两种原因都应参与规则过滤）；
 * - scanRunning 时新请求并入集合，当前扫描结束后最多补跑一次；
 * - 绝不并发执行两个扫描任务。
 */
export function createScheduler(
  run: (reasons: ScanReason[]) => void | Promise<void>,
): Scheduler {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pendingReasons = new Set<ScanReason>()
  let running = false

  function execute(reasons: ScanReason[]): void {
    running = true
    Promise.resolve()
      .then(() => run(reasons))
      .catch(() => {
        /* run 内部已隔离异常 */
      })
      .finally(() => {
        running = false
        if (pendingReasons.size) {
          const next = [...pendingReasons]
          pendingReasons = new Set()
          execute(next)
        }
      })
  }

  return {
    schedule(reason, delayMs = AUTO_DEBOUNCE_MS) {
      pendingReasons.add(reason)
      if (timer) clearTimeout(timer)
      if (running) return // 执行中的扫描结束后由 finally 补跑
      timer = setTimeout(() => {
        timer = null
        if (running || !pendingReasons.size) return
        const batch = [...pendingReasons]
        pendingReasons = new Set()
        execute(batch)
      }, delayMs)
    },
    dispose() {
      if (timer) clearTimeout(timer)
      timer = null
      pendingReasons = new Set()
    },
  }
}
