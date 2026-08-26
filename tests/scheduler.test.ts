import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createScheduler } from '../src/content/auto-capture/scheduler'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

/** 等待 run 内部 Promise 链收敛 */
async function settle(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve()
}

describe('scheduler（防抖 + 原因合并 + 防扫描风暴）', () => {
  it('连续多次 schedule 只在静默期后执行一次，原因取并集', async () => {
    const run = vi.fn()
    const s = createScheduler(run)

    s.schedule('dom-change')
    vi.advanceTimersByTime(300)
    s.schedule('dom-change')
    vi.advanceTimersByTime(300)
    s.schedule('spa-navigation')
    vi.advanceTimersByTime(799)
    expect(run).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await settle()
    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenLastCalledWith(['dom-change', 'spa-navigation'])
  })

  it('扫描运行中收到新请求 → 挂起，完成后补跑一次而非并发', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const run = vi.fn((reasons: string[]) =>
      reasons.includes('page-load') ? gate : undefined,
    )
    const s = createScheduler(run as never)

    s.schedule('page-load', 0)
    await vi.advanceTimersByTimeAsync(0)
    expect(run).toHaveBeenCalledTimes(1)

    // 运行中再来两个不同原因
    s.schedule('dom-change', 0)
    s.schedule('spa-navigation', 0)
    await vi.advanceTimersByTimeAsync(2000)
    // 第一次仍在运行，不并发
    expect(run).toHaveBeenCalledTimes(1)

    release()
    await settle()
    // 补跑一次，原因合并
    expect(run).toHaveBeenCalledTimes(2)
    expect(run).toHaveBeenLastCalledWith(['dom-change', 'spa-navigation'])
  })

  it('dispose 取消未触发的任务并清空待处理集合', () => {
    const run = vi.fn()
    const s = createScheduler(run)
    s.schedule('dom-change')
    s.dispose()
    vi.runAllTimers()
    expect(run).not.toHaveBeenCalled()
  })
})
