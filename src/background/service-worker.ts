import type {
  AutoCaptureScanPayload,
  CapturePayload,
  ExtMessage,
} from '../types'
import {
  addClipsFromMatches,
  createClip,
  getPrefs,
  listCollections,
  listEnabledRules,
  saveCollection,
} from '../database/indexeddb'

/** 首次安装 / 启动时启用“点击工具栏图标即打开侧边栏” */
function enablePanelBehavior(): void {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
}

async function bootstrapDefaultCollection(): Promise<void> {
  const cols = await listCollections()
  if (!cols.length) {
    await saveCollection({
      title: '默认工作台',
      clips: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tags: [],
      ai: null,
    })
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  enablePanelBehavior()
  if (details.reason === 'install') void bootstrapDefaultCollection()
})

chrome.runtime.onStartup.addListener(() => {
  enablePanelBehavior()
})

// 快捷键：打开侧边栏（需聚焦窗口）
chrome.commands.onCommand.addListener((command) => {
  if (command !== 'open-panel') return
  void (async () => {
    const win = await chrome.windows.getLastFocused()
    if (win?.id != null) await chrome.sidePanel.open({ windowId: win.id })
  })()
})

function broadcast(msg: ExtMessage): void {
  // 侧边栏未开启时无接收方，Promise 会 reject，静默即可
  chrome.runtime.sendMessage(msg).catch(() => {})
}

/**
 * 把面板发出的配置类消息转发给所有标签页的 Content Script。
 * 关键：chrome.runtime.sendMessage 只在扩展上下文间传递，
 * 到达 Content Script 必须走 tabs.sendMessage。
 */
async function relayToAllTabs(msg: ExtMessage): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({})
    await Promise.all(
      tabs.map(async (tab) => {
        if (tab.id == null) return
        // 注意：无 tabs/host 权限时 tab.url 不可读，不能据此过滤；
        // 未注入 Content Script 的页面 sendMessage 会 reject，静默跳过即可。
        try {
          await chrome.tabs.sendMessage(tab.id, msg)
        } catch {
          /* ignore */
        }
      }),
    )
  } catch (err) {
    console.error('[ClipFlow] relay failed:', err)
  }
}

async function handleCapture(payload: CapturePayload): Promise<boolean> {
  try {
    const item = await createClip(payload)
    if (!item) return false
    broadcast({ type: 'CLIPS_CHANGED', reason: 'added', ids: [item.id] })
    return true
  } catch (err) {
    console.error('[ClipFlow] capture failed:', err)
    return false
  }
}

/** 自动采集：后台统一去重 + 批量落库（多 Tab 并发上报在此串行收敛） */
async function handleAutoCapture(payload: AutoCaptureScanPayload): Promise<boolean> {
  try {
    const { created } = await addClipsFromMatches(payload)
    if (created.length) {
      broadcast({
        type: 'CLIPS_CHANGED',
        reason: created.length > 5 ? 'bulk' : 'added',
        ids: created.map((c) => c.id),
      })
    }
    return true
  } catch (err) {
    console.error('[ClipFlow] auto capture failed:', err)
    return false
  }
}

chrome.runtime.onMessage.addListener(
  (msg: ExtMessage, _sender, sendResponse) => {
    if (msg?.type === 'CLIP_CAPTURED') {
      void handleCapture(msg.payload).then(sendResponse)
      return true // 异步应答
    }
    if (msg?.type === 'AUTO_CAPTURE_MATCHES') {
      void handleAutoCapture(msg.payload).then(sendResponse)
      return true
    }
    if (msg?.type === 'GET_AUTO_RULES') {
      void listEnabledRules().then((rules) => sendResponse({ rules }))
      return true
    }
    if (msg?.type === 'GET_PREFS') {
      void getPrefs().then((prefs) => sendResponse({ prefs }))
      return true
    }
    if (msg?.type === 'RULES_UPDATED' || msg?.type === 'PREFS_UPDATED') {
      // 面板 → SW → 全部标签页 Content Script
      void relayToAllTabs(msg)
      return false
    }
    if (msg?.type === 'PING') {
      sendResponse({ ok: true })
    }
    return false
  },
)

export {}
