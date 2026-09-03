<div align="center">
  <img src="public/icons/icon128.png" width="80" alt="ClipFlow logo" />
</div>

# ClipFlow

<div align="center">

> 跨网页复制内容收集器 · Chrome Extension (Manifest V3)

</div>

ClipFlow 自动记录你在任意网页复制或命中的文本：

- **手动采集**：浏览网页 A/B/C 时按 Ctrl+C，片段自动汇入插件；
- **自动采集**：创建「URL 条件 + 整页可见文本 + 正则」规则，页面加载、SPA 切换、动态渲染出的命中内容无需任何按键即自动入库。

打开侧边栏即可搜索历史、查看来源、编辑整理，最后一键合并为 Markdown 复制导出。

**本地优先**：所有数据仅保存在浏览器 IndexedDB 中，无任何网络上传。

## 功能特性

| 能力 | 说明 |
| --- | --- |
| 自动捕获 | 监听原生 `copy` 事件 + `getSelection()`，不轮询、不读取系统剪贴板 |
| 来源记录 | 页面 URL / 标题 / favicon / 时间戳 / 内容类型启发式识别 |
| 去重 | 空内容与 < 2 字符忽略；连续重复复制自动跳过（页面级 + 后台最新条双重校验） |
| IndexedDB | `clips`（createdAt / source.url / contentType 索引）+ `collections` 两个 store |
| 全文搜索 | 多 token AND 匹配，覆盖正文 / 标题 / URL，命中高亮，倒序游标流式扫描 |
| 工作台 | 文档模式：多工作台、拖拽排序、编辑、移除、清空 |
| 合并复制 | 按当前排序生成 Markdown（标题 / 来源 / 正文 / 分隔线），一键写入剪贴板 |
| 导入导出 | JSON 备份导入（冲突 ID 自动重编号）/ JSON 与 Markdown 导出 |
| 自动采集 | URL（全部/Wildcard/正则）+ 页面文字正则规则；覆盖可见正文、复制控件值和常见复制载荷属性；触发条件可选加载/SPA/动态变化；SHA-256 指纹去重（页面/全局两种范围）；规则测试器针对当前标签页即时试跑 |
| 快捷键 | `Alt+Shift+F` 打开侧边栏；`Alt+Shift+C` 聚焦面板 |

## 技术栈

- **Chrome Extension Manifest V3**（Service Worker + Content Script + Side Panel）
- Vue 3 · TypeScript · Vite · Naive UI · Pinia
- IndexedDB（[idb](https://github.com/jakearchibald/idb) 封装）
- dayjs · markdown-it

## 开发

```bash
npm install
npm run build        # 产物输出到 dist/
npm run dev          # watch 模式（扩展脚本 + 面板应用并行）
npm run typecheck    # vue-tsc 类型检查
```

## 自动化验证（E2E）

无需手工操作即可在无头 Chromium 中完成全链路验收，共 34 项断言：

- 手动采集：跨页复制、连续去重、搜索高亮、编辑、工作台拖拽排序、合并 Markdown 到剪贴板、删除、导入导出；
- 自动采集（§场景）：页面加载捕获 + 刷新不重复、动态文本捕获、无关 DOM 变化不重复、SPA pushState 切换捕获、多标签页并发保存、禁用规则立即生效、非法正则不崩溃。

```bash
cd scripts/e2e
npm init -y && npm i playwright-core && npx playwright-core install chromium
node e2e.mjs   # 需先在项目根目录执行 npm run build
```

另有单元测试覆盖 URL matcher / 正则引擎 / 归一化 / 指纹 / 调度器：

```bash
npm test        # vitest，30 项断言
```

## 安装到 Chrome

1. 运行 `npm run build`
2. 打开 `chrome://extensions`
3. 右上角开启「开发者模式」
4. 点击「加载已解压的扩展程序」，选择本项目的 `dist/` 目录
5. 点击工具栏 ClipFlow 图标（或按 `Alt+Shift+F`）打开侧边栏

> 要求 Chrome 116+（Side Panel API）。Content Script 仅注入 http/https 页面。

## 使用流程

1. 正常浏览网页，选中文字 `Ctrl/Cmd+C` —— 内容自动入库
2. 点击工具栏图标打开侧边栏，搜索或滚动浏览历史
3. 在感兴趣的条目上点 ➕ 加入工作台（可新建多个文档）
4. 工作台内拖动排序、编辑、删除，切换「预览」查看渲染后的 Markdown
5. 点「复制全部」，粘贴到任何地方即为结构化文档

## 项目结构

```text
src/
├── background/service-worker.ts   # SW：消息路由、去重落库、广播、快捷键
├── content/copy-listener.ts       # 注入脚本：copy 事件捕获（自包含单文件构建）
├── database/indexeddb.ts          # idb 封装：CRUD / 游标分页 / 流式搜索 / 导入导出
├── stores/                        # Pinia：clips / workspace / ui
├── sidepanel/                     # Side Panel 应用（Vue 3 + Naive UI）
│   ├── App.vue
│   ├── components/
│   └── pages/
├── types/index.ts                 # ClipItem / Collection / 消息协议
└── utils/                         # id / detect / format / search / markdown / clipboard
scripts/gen-icons.mjs              # 零依赖 PNG 图标生成器
public/manifest.json               # MV3 清单
vite.config.ts                     # Side Panel 构建
vite.extension.config.ts           # background.js + content.js 构建
```

## 数据结构（含 AI 扩展预留）

```ts
interface ClipItem {
  id: string
  content: string
  source: { url: string; title: string; favicon: string }
  createdAt: number
  metadata: { length: number; contentType: 'text'|'code'|'json'|'url'|'markdown' }
  tags?: string[]
  collectionId?: string | null
  ai?: { summary?: string; prompt?: string; embedding?: number[] } | null // 预留位
}

interface Collection {
  id: string
  title: string
  clips: string[]            // 有序 clipId
  createdAt: number
  updatedAt: number
  tags: string[]
  ai?: { summary?: string; prompt?: string } | null // 预留位
}
```

后续版本可在此基础上实现 AI 总结、Prompt 生成、本地 LLM 接入与 MCP 读取，无需迁移数据。

## 隐私说明

- 只捕获用户主动触发的复制：`copy` 事件、页面复制按钮调用的剪贴板写入、以及选区稳定后的文本（可在设置中关闭），从不轮询或读取系统剪贴板
- 不收集遥测，不发起任何网络请求
- 数据完全存储于本地浏览器，卸载扩展即彻底删除

> 本节即可作为隐私政策引用：`https://github.com/<你的用户名>/webcopy#隐私说明`

## License

[MIT](./LICENSE)
