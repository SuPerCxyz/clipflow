/** 剪藏内容类型（启发式识别） */
export type ContentType = 'text' | 'code' | 'json' | 'url' | 'markdown'

/** 复制来源信息 */
export interface ClipSource {
  url: string
  title: string
  favicon: string
}

/** 条目元数据 */
export interface ClipMetadata {
  length: number
  contentType: ContentType
  wordCount?: number
  language?: string
  /** captureType=auto 时：匹配在页面文本中的偏移 */
  matchIndex?: number
}

/** Content Script 捕获的原始数据 */
export interface CapturePayload {
  content: string
  url: string
  title: string
  favicon: string
  capturedAt: number
}

/** 采集通道：手动复制（Ctrl+C）/ 自动采集（规则引擎） */
export type CaptureType = 'clipboard' | 'auto'

/**
 * 核心数据结构：一条采集记录。
 * ai / tags / collectionId 字段为 AI 能力预留位，当前版本不写入业务逻辑。
 */
export interface ClipItem {
  id: string
  content: string
  /** 来源通道，Side Panel 据此区分手动/自动标识 */
  captureType: CaptureType
  source: ClipSource
  createdAt: number
  updatedAt?: number
  starred?: boolean
  tags?: string[]
  /** 所属工作台文档（预留） */
  collectionId?: string | null
  /** captureType=auto 时：产生该记录的规则 */
  ruleId?: string
  ruleName?: string
  metadata: ClipMetadata
  /** AI 能力预留：摘要 / Prompt / 向量，当前版本恒为 null */
  ai?: {
    summary?: string
    prompt?: string
    embedding?: number[]
  } | null
}

/** 文档模式：工作台集合 */
export interface Collection {
  id: string
  title: string
  /** 有序 clipId 列表 */
  clips: string[]
  createdAt: number
  updatedAt: number
  tags: string[]
  ai?: { summary?: string; prompt?: string } | null
}

// ---------- 扩展内部消息协议 ----------

// Auto Capture 领域类型统一由 src/auto-capture/types 定义，此处按需再导出
export type {
  AutoCaptureRule,
  AutoCaptureScanPayload,
  RawAutoMatch,
  TestRuleResult,
} from '../auto-capture/types'

export interface ClipCapturedMessage {
  type: 'CLIP_CAPTURED'
  payload: CapturePayload
}

export interface ClipsChangedMessage {
  type: 'CLIPS_CHANGED'
  reason: 'added' | 'updated' | 'removed' | 'bulk'
  ids?: string[]
}

export interface PingMessage {
  type: 'PING'
}

// ---------- Auto Capture 消息 ----------

/** Content Script 启动时拉取启用规则 */
export interface GetAutoRulesMessage {
  type: 'GET_AUTO_RULES'
}

/** 规则变更广播（Side Panel → 全部 Content Script），payload 为启用规则全集 */
export interface RulesUpdatedMessage {
  type: 'RULES_UPDATED'
  rules: import('../auto-capture/types').AutoCaptureRule[]
}

/** Content → Background：一次扫描的候选匹配，由后台统一去重落库 */
export interface AutoCaptureMatchesMessage {
  type: 'AUTO_CAPTURE_MATCHES'
  payload: import('../auto-capture/types').AutoCaptureScanPayload
}

/** Side Panel → 当前 Tab Content Script：测试未保存的草稿规则 */
export interface TestAutoRuleMessage {
  type: 'TEST_AUTO_RULE'
  rule: import('../auto-capture/types').AutoCaptureRule
}

// ---------- 用户偏好 ----------

export interface Prefs {
  /** 选中文字后自动记录（默认开启） */
  selectionAutoCapture: boolean
}

export const DEFAULT_PREFS: Prefs = { selectionAutoCapture: true }

export interface GetPrefsMessage {
  type: 'GET_PREFS'
}

export interface PrefsUpdatedMessage {
  type: 'PREFS_UPDATED'
  prefs: Prefs
}

export type ExtMessage =
  | ClipCapturedMessage
  | ClipsChangedMessage
  | PingMessage
  | GetAutoRulesMessage
  | RulesUpdatedMessage
  | AutoCaptureMatchesMessage
  | TestAutoRuleMessage
  | GetPrefsMessage
  | PrefsUpdatedMessage

// ---------- 导入导出 ----------

export interface ExportBundle {
  app: 'ClipFlow'
  version: 1
  exportedAt: number
  clips: ClipItem[]
  collections: Collection[]
}
