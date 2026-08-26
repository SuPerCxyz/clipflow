/** URL 条件类型：所有页面 / 通配符 / 正则 */
export type UrlConditionType = 'all' | 'wildcard' | 'regex'

export interface AutoCaptureUrlCondition {
  type: UrlConditionType
  value: string
}

export interface AutoCapturePattern {
  /** 正则源码（保存用户原始输入） */
  regex: string
  /** 用户原始 flags；执行时内部自动确保 g（见 regex.ts） */
  flags: string
  /** 0 = 完整匹配 $0；n = 第 n 个捕获组 */
  captureGroup: number
}

export interface AutoCaptureTriggers {
  pageLoad: boolean
  spaNavigation: boolean
  domChange: boolean
}

export type DedupScope = 'page' | 'global'

export interface AutoCaptureDeduplication {
  enabled: boolean
  scope: DedupScope
}

/**
 * 采集范围（扩展预留）：本阶段仅实现 page（整页可见文本）。
 * 未来扩展 selector 时在此联合类型上增加分支，规则引擎只需替换取文层。
 */
export type CaptureScope = { type: 'page' }
// 未来: | { type: 'selector'; selector: string }

export interface AutoCaptureRule {
  id: string
  name: string
  enabled: boolean
  urlCondition: AutoCaptureUrlCondition
  pattern: AutoCapturePattern
  triggers: AutoCaptureTriggers
  deduplication: AutoCaptureDeduplication
  scope?: CaptureScope
  /** 轻量统计：随写入原子更新，避免渲染时扫描全部 clips */
  stats?: { matchCount: number; lastMatchedAt: number | null }
  createdAt: number
  updatedAt: number
}

/** executeRule 单条提取结果 */
export interface RuleMatch {
  /** 按 captureGroup 提取并 trim 后的最终内容 */
  content: string
  fullMatch: string
  /** 在页面文本中的偏移 */
  index: number
}

export interface RegexValidation {
  valid: boolean
  error?: string
}

/** Content → Background 的候选匹配（尚未去重） */
export interface RawAutoMatch {
  ruleId: string
  content: string
  index: number
}

export interface AutoCaptureScanPayload {
  url: string
  title: string
  favicon: string
  capturedAt: number
  matches: RawAutoMatch[]
}

// ---------- 规则测试器协议 ----------

export interface TestRuleSuccess {
  ok: true
  url: string
  charCount: number
  durationMs: number
  totalMatches: number
  /** 截断至前 50 条 */
  matches: RuleMatch[]
}

export interface TestRuleFailure {
  ok: false
  reason: 'invalid-regex' | 'url-mismatch' | 'no-text' | 'error'
  url?: string
  error?: string
}

export type TestRuleResult = TestRuleSuccess | TestRuleFailure
