/**
 * MAIN World 桥（content-main.js）。
 *
 * Content Script 默认运行在隔离世界，无法包装页面可见的对象，
 * 因此由本桥（注入页面主世界）负责两类转发：
 *
 * 1. SPA 路由：包装 history.pushState / replaceState，变化时派发自定义事件；
 * 2. 页面复制按钮：拦截 navigator.clipboard.writeText / write——
 *    站点代码用它们写剪贴板时不会产生原生 copy 事件，
 *    桥把文本放入 documentElement.dataset 后派发事件
 *    （dataset 属于共享 DOM，可跨世界读取；dispatchEvent 为同步，无竞态）。
 *
 * 所有包装均保留原行为且异常自吞，绝不影响宿主页面。
 */
;(function () {
  var SPA_EVENT = 'clipflow:spa-navigate'
  var COPY_EVENT = 'clipflow:clipboard-write'

  // ---------- 1. SPA ----------
  var fireSpa = function () {
    try {
      window.dispatchEvent(new CustomEvent(SPA_EVENT))
    } catch {}
  }

  var names = ['pushState', 'replaceState'] as const
  for (var i = 0; i < names.length; i++) {
    ;(function (name: (typeof names)[number]) {
      var original = history[name].bind(history)
      Object.defineProperty(history, name, {
        configurable: true,
        writable: true,
        value: function (...args: Parameters<History['pushState']>) {
          var result = original.apply(history, args)
          fireSpa()
          return result
        },
      })
    })(names[i])
  }

  // ---------- 2. Clipboard API ----------
  var blobToText = function (blob: Blob): Promise<string> {
    return new Promise(function (resolve) {
      var fr = new FileReader()
      fr.onload = function () {
        resolve(String(fr.result))
      }
      fr.onerror = function () {
        resolve('')
      }
      fr.readAsText(blob)
    })
  }

  var notifyCopy = function (text: unknown): void {
    try {
      if (typeof text !== 'string' || !text.trim()) return
      document.documentElement.dataset['clipflowCopy'] = text
      window.dispatchEvent(new CustomEvent(COPY_EVENT))
    } catch {}
  }

  try {
    var clip = navigator.clipboard as
      | (Clipboard & { writeText?: unknown; write?: unknown })
      | undefined
    if (clip && typeof clip.writeText === 'function') {
      var origWriteText = clip.writeText!.bind(clip) as (
        t: string,
      ) => Promise<void>
      Object.defineProperty(clip, 'writeText', {
        configurable: true,
        value: function (text: string): Promise<void> {
          notifyCopy(text)
          return origWriteText(text)
        },
      })
    }
    if (clip && typeof clip.write === 'function') {
      var origWrite = clip.write!.bind(clip) as (
        items: ClipboardItem[],
      ) => Promise<void>
      Object.defineProperty(clip, 'write', {
        configurable: true,
        value: function (items: ClipboardItem[]): Promise<void> {
          try {
            var arr = Array.prototype.slice.call(items || [])
            Promise.all(
              arr.map(function (it: ClipboardItem) {
                try {
                  return it
                    .getType('text/plain')
                    .then(blobToText)
                    .catch(function () {
                      return ''
                    })
                } catch {
                  return Promise.resolve('')
                }
              }),
            )
              .then(function (texts: string[]) {
                var joined = texts.filter(Boolean).join('\n')
                if (joined.trim()) notifyCopy(joined)
              })
              .catch(function () {})
          } catch {}
          return origWrite(items)
        },
      })
    }
  } catch {}
})()
