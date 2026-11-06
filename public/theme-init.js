/* Sets the saved theme before the first paint so there is no flash. Served from the same origin (allowed by the CSP). */
(function () {
  var theme = 'dark'
  try {
    if (localStorage.getItem('toppay-theme') === 'light') theme = 'light'
  } catch {
    /* storage unavailable: stay dark */
  }
  document.documentElement.setAttribute('data-theme', theme)
  var meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme === 'light' ? '#f4f6fb' : '#080d1b')
})()
