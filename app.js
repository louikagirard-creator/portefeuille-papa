(function () {
  var D = window.DATA;
  var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  var css = getComputedStyle(document.documentElement);
  var c = function (n) { return css.getPropertyValue(n).trim(); };

  document.querySelectorAll('[data-maj]').forEach(function (el) { el.textContent = D.miseAJour; });

  // ---------- Widgets TradingView (prix en direct) ----------
  function widget(el, file, config) {
    var box = document.createElement('div');
    box.className = 'tradingview-widget-container';
    box.style.height = '100%';
    var inner = document.createElement('div');
    inner.className = 'tradingview-widget-container__widget';
    inner.style.height = '100%';
    box.appendChild(inner);
    var s = document.createElement('script');
    s.src = 'https://s3.tradingview.com/external-embedding/' + file;
    s.async = true;
    s.textContent = JSON.stringify(config);
    box.appendChild(s);
    el.appendChild(box);
  }
  var theme = dark ? 'dark' : 'light';

  widget(document.getElementById('tape'), 'embed-widget-ticker-tape.js', {
    symbols: [
      { proName: 'NASDAQ:SPCX', title: 'SpaceX' },
      { proName: 'NASDAQ:GOOGL', title: 'Google' },
      { proName: 'TSX:SU', title: 'Suncor' },
      { proName: 'TSX:CVE', title: 'Cenovus' },
      { proName: 'NASDAQ:SNDK', title: 'Sandisk' },
      { proName: 'NASDAQ:WDC', title: 'Western Digital' },
      { proName: 'TWSE:TAIEX', title: 'Taïwan' },
      { proName: 'OANDA:XAUUSD', title: 'Or' },
      { proName: 'OANDA:XAGUSD', title: 'Argent' },
      { proName: 'OANDA:XPTUSD', title: 'Platine' },
      { proName: 'OANDA:XPDUSD', title: 'Palladium' },
      { proName: 'TVC:UKOIL', title: 'Brent' },
      { proName: 'FX_IDC:USDCAD', title: 'USD/CAD' }
    ],
    showSymbolLogo: true, isTransparent: true, displayMode: 'adaptive', colorTheme: theme, locale: 'fr'
  });

  document.querySelectorAll('[data-tv]').forEach(function (el) {
    widget(el, 'embed-widget-mini-symbol-overview.js', {
      symbol: el.dataset.tv, width: '100%', height: '100%', locale: 'fr', dateRange: '12M',
      colorTheme: theme, isTransparent: true, autosize: true, largeChartUrl: '', chartOnly: false, noTimeScale: false
    });
  });

  // ---------- Graphiques fixes (Chart.js) ----------
  if (!window.Chart) return;
  var fg = c('--fg'), muted = c('--muted'), line = c('--line'), accent = c('--accent');
  var grey = dark ? '#3a4541' : '#cfd8d4';
  Chart.defaults.font.family = c('--sans') || 'system-ui';
  Chart.defaults.font.size = 12;
  Chart.defaults.color = muted;
  Chart.defaults.borderColor = line;
  Chart.defaults.maintainAspectRatio = false;
  Chart.defaults.plugins.tooltip.backgroundColor = dark ? '#222b28' : '#ffffff';
  Chart.defaults.plugins.tooltip.titleColor = muted;
  Chart.defaults.plugins.tooltip.bodyColor = fg;
  Chart.defaults.plugins.tooltip.borderColor = line;
  Chart.defaults.plugins.tooltip.borderWidth = 1;
  var nf = function (d) { return new Intl.NumberFormat('fr-CA', { minimumFractionDigits: d, maximumFractionDigits: d }); };

  // Métaux : écart avec le record (prix du 6 nov. vs record)
  var metaux = [['Or', 4048.37, 5595.47], ['Argent', 51.77, 121.62], ['Platine', 1526.5, 2920], ['Palladium', 1012, 3440]];
  new Chart(document.getElementById('cMetaux'), {
    type: 'bar',
    data: { labels: metaux.map(function (m) { return m[0]; }),
      datasets: [{ data: metaux.map(function (m) { return (m[1] / m[2] - 1) * 100; }), backgroundColor: accent, borderRadius: 4, barThickness: 16 }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false },
      tooltip: { callbacks: { label: function (x) { var m = metaux[x.dataIndex]; return nf(0).format(x.raw) + ' % · ' + nf(2).format(m[1]) + ' $ vs record ' + nf(0).format(m[2]) + ' $'; } } } },
      scales: { x: { min: -100, max: 0, ticks: { callback: function (v) { return v + ' %'; } }, grid: { color: line } }, y: { grid: { display: false }, ticks: { color: fg } } } }
  });

  // Ormuz : périodes
  var per = D.ormuzPeriodes;
  new Chart(document.getElementById('cOrmuzPer'), {
    type: 'bar',
    data: { labels: per.map(function (p) { return p.libelle; }),
      datasets: [
        { label: 'Observé (% du normal)', data: per.map(function (p) { return p.observe / p.normal * 100; }), backgroundColor: accent, borderRadius: 4, barThickness: 16, grouped: false, order: 1 },
        { label: 'Normal', data: per.map(function () { return 100; }), backgroundColor: grey, borderRadius: 4, barThickness: 16, grouped: false, order: 2 }
      ] },
    options: { indexAxis: 'y', plugins: { legend: { display: false },
      tooltip: { filter: function (x) { return x.datasetIndex === 0; },
        callbacks: { label: function (x) { var p = per[x.dataIndex]; return nf(0).format(p.observe) + ' navires sur ' + nf(0).format(p.normal) + ' normalement (' + nf(0).format(x.raw) + ' %)'; } } } },
      scales: { x: { min: 0, max: 100, ticks: { callback: function (v) { return v + ' %'; } } }, y: { grid: { display: false }, ticks: { color: fg } } } }
  });

  // Ormuz : par mois
  var refLine = {
    id: 'ref',
    afterDatasetsDraw: function (chart) {
      var y = chart.scales.y.getPixelForValue(D.ormuzNormalParJour), a = chart.chartArea, ctx = chart.ctx;
      ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = muted; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(a.left, y); ctx.lineTo(a.right, y); ctx.stroke();
      ctx.setLineDash([]); ctx.fillStyle = muted; ctx.textAlign = 'right';
      ctx.fillText('Normal ≈ ' + D.ormuzNormalParJour + ' / jour', a.right, y - 6); ctx.restore();
    }
  };
  new Chart(document.getElementById('cOrmuzMois'), {
    type: 'bar',
    data: { labels: D.ormuzMensuel.map(function (m) { return m.mois; }),
      datasets: [{ data: D.ormuzMensuel.map(function (m) { return m.v; }),
        backgroundColor: D.ormuzMensuel.map(function (m, i) { return i === D.ormuzMensuel.length - 1 ? grey : accent; }), borderRadius: 3 }] },
    options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (x) { return nf(1).format(x.raw) + ' navires par jour'; } } } },
      scales: { y: { beginAtZero: true, suggestedMax: 95 }, x: { grid: { display: false } } } },
    plugins: [refLine]
  });

  // Ormuz : par jour
  new Chart(document.getElementById('cOrmuzJour'), {
    type: 'bar',
    data: { labels: D.ormuzQuotidien.map(function (d) { return d[0]; }),
      datasets: [{ data: D.ormuzQuotidien.map(function (d) { return d[1]; }), backgroundColor: accent, borderRadius: 3 }] },
    options: { plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (x) { return x.raw + ' navires'; } } } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false }, ticks: { autoSkip: true, maxRotation: 0 } } } }
  });

  // Exportateurs
  var ex = D.exportateurs;
  new Chart(document.getElementById('cExport'), {
    type: 'bar',
    data: { labels: ex.map(function (e, i) { return (i + 1) + '. ' + e[0]; }),
      datasets: [{ data: ex.map(function (e) { return e[1]; }),
        backgroundColor: ex.map(function (e) { return e[0] === 'Canada' ? accent : grey; }), borderRadius: 3, barThickness: 14 }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false },
      tooltip: { callbacks: { label: function (x) { return nf(0).format(x.raw) + ' milliers de barils par jour'; } } } },
      scales: { x: { ticks: { callback: function (v) { return nf(0).format(v); } } },
        y: { grid: { display: false }, ticks: { color: function (ctx) { return ex[ctx.index] && ex[ctx.index][0] === 'Canada' ? accent : fg; },
          font: function (ctx) { return { weight: ex[ctx.index] && ex[ctx.index][0] === 'Canada' ? '600' : '400' }; } } } } }
  });

  // Devises : variation depuis janvier
  var fx = D.devises;
  var rel = function (arr) { return arr.map(function (v) { return (v / arr[0] - 1) * 100; }); };
  var series = [['USD/CAD', fx.usdcad, accent], ['EUR/USD', fx.eurusd, dark ? '#c9a24a' : '#9a6a00'], ['EUR/CAD', fx.eurcad, dark ? '#8fa8ff' : '#3b55b5']];
  new Chart(document.getElementById('cFx'), {
    type: 'line',
    data: { labels: fx.mois, datasets: series.map(function (s) {
      return { label: s[0], data: rel(s[1]), raw: s[1], borderColor: s[2], backgroundColor: s[2], borderWidth: 2, pointRadius: 2, tension: 0 }; }) },
    options: { interaction: { mode: 'index', intersect: false },
      plugins: { legend: { labels: { color: fg, boxWidth: 12, boxHeight: 2 } },
        tooltip: { callbacks: { label: function (x) { return x.dataset.label + ' ' + nf(4).format(x.dataset.raw[x.dataIndex]) + ' (' + (x.raw >= 0 ? '+' : '') + nf(1).format(x.raw) + ' %)'; } } } },
      scales: { y: { ticks: { callback: function (v) { return (v > 0 ? '+' : '') + v + ' %'; } } }, x: { grid: { display: false } } } }
  });
})();
