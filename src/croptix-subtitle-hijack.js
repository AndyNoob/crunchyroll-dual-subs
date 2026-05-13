(function inject() {
  const s = document.createElement('script')
  s.textContent = '(' + function () {
    ;(function () {
      const instances = []
      let currentOffset = 0

      function applyOffset(instance) {
        if (instance) instance.timeOffset = currentOffset
      }

      window.__setCroptixTimeOffset = function (value) {
        currentOffset = Number(value) || 0
        instances.forEach(applyOffset)
      }

      function wrapConstructor(Orig) {
        if (Orig.__croptixWrapped) return Orig
        function Wrapped(options) {
          options = options || {}
          options.timeOffset = currentOffset
          const inst = new Orig(options)
          instances.push(inst)
          applyOffset(inst)
          return inst
        }
        Wrapped.prototype = Orig.prototype
        Wrapped.__croptixWrapped = true
        return Wrapped
      }

      // If already defined, try direct assignment (works if writable)
      if (typeof window.SubtitlesOctopus === 'function') {
        window.SubtitlesOctopus = wrapConstructor(window.SubtitlesOctopus)
        return
      }

      // Otherwise poll until it appears (avoids redefine on non-configurable)
      const t = setInterval(() => {
        if (typeof window.SubtitlesOctopus === 'function') {
          window.SubtitlesOctopus = wrapConstructor(window.SubtitlesOctopus)
          clearInterval(t)
        }
      }, 1)
    })()
  } + ')();'
  ;(document.documentElement || document.head).appendChild(s)
  s.remove()
})()
