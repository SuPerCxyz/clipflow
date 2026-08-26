/** 性能与行为保护常量（当前不做 UI 配置） */

/** Mutation → 扫描 的防抖间隔 */
export const AUTO_DEBOUNCE_MS = 800

/** 选中即记录：selectionchange 防抖 */
export const SELECTION_DEBOUNCE_MS = 700

/** 选中即记录：最短字符数（过滤双击取词等噪声） */
export const SELECTION_MIN_LENGTH = 6

/** 页面文本扫描上限（字符）。超出截断，防极端页面卡顿 */
export const MAX_PAGE_TEXT_LENGTH = 3_000_000

/** 单条规则单次扫描最大匹配数 */
export const MAX_MATCHES_PER_RULE = 500

/** 单次扫描所有规则合计最大匹配数 */
export const MAX_MATCHES_PER_SCAN = 1000

/** 测试器最多展示的结果条数 */
export const TEST_PREVIEW_LIMIT = 50

/** 允许的正则 flags */
export const ALLOWED_REGEX_FLAGS: ReadonlySet<string> = new Set([
  'g',
  'i',
  'm',
  's',
  'u',
  'y',
])
