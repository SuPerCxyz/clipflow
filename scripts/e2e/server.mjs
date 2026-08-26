// 本地测试服务器：提供 3 个不同页面，模拟“跨网页复制”场景
import http from 'node:http'

const html = (title, body) => `<!doctype html><html><head><title>${title}</title></head>
<body>${body}</body></html>`

const routes = {
  '/a': ['Page Alpha', '<p id="src">Alpha paragraph about OpenStack RabbitMQ queue analysis and mirror queues.</p>'],
  '/b': ['Page Beta', '<p id="src">Beta notes on Ceph placement group states including active clean degraded.</p>'],
  '/c': ['Page Gamma', '<p id="src">Gamma checklist for Kubernetes pod eviction thresholds and node pressure.</p>'],
  // 自动采集场景页
  '/log': ['Error Logs', [
    '<pre id="src">INFO server started',
    'ERROR RabbitMQ connection timeout',
    'INFO retrying',
    'ERROR database disconnected</pre>',
  ].join('\n')],
  '/dyn': ['Dynamic Page', [
    '<div id="content"></div>',
    '<button id="noise" onclick="document.body.appendChild(document.createTextNode(\'unrelated noise \'))">noise</button>',
    '<script>var p=new URLSearchParams(location.search).get("t")||"x";',
    'setTimeout(function(){document.getElementById("content").textContent="pending..."},400);',
    'setTimeout(function(){document.getElementById("content").textContent="ERROR dynamic "+p;},1300);<\/script>',
  ].join('\n')],
  '/spa': ['SPA App', [
    '<div id="view">ERROR spa view one</div>',
    '<button id="nav" onclick="history.pushState({},\'\',\'/spa/2\');',
    'document.getElementById(\'view\').textContent=\'ERROR spa view two ready\';">go</button>',
  ].join('\n')],
  '/multi': ['Multi Tab', '<p id="src">ERROR multi tab shared content</p>'],
  // 页面自带“复制”按钮（Clipboard API 写入，不触发 copy 事件）
  '/copybtn': ['Copy Button Page', [
    '<button id="api-copy" onclick="navigator.clipboard.writeText(\'ClipFlow api copy payload 8899\')">复制</button>',
    '<p id="src">fallback paragraph</p>',
  ].join('\n')],
}

export function startTestServer(port = 8765) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const path = (req.url ?? '/').split('?')[0]
      let hit = routes[path]
      // /multi?a 与 /multi?b：同路径不同 query，用于多 Tab 场景
      if (!hit && path === '/multi') hit = routes['/multi']
      if (!hit) {
        res.writeHead(404)
        res.end('nope')
        return
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(html(hit[0], hit[1]))
    })
    server.listen(port, '127.0.0.1', () => resolve(`http://127.0.0.1:${port}`))
  })
}

/** 在页面里选中正文并触发原生 copy（合成事件同样携带选区，插件读取的是 getSelection） */
export async function copyPageBody(page) {
  await page.evaluate(() => {
    const p = document.querySelector('p')
    const range = document.createRange()
    range.selectNodeContents(p)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)
    document.dispatchEvent(new ClipboardEvent('copy'))
  })
}
