// Widgets TradingView (prix en direct) et graphiques fixes des sections d'explications
// (métaux, Ormuz, exportateurs, devises). Tout est redessiné quand le thème change.
(function () {
  var D = window.DATA;
  var css = function (n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); };
  var sombre = function () { return document.documentElement.dataset.sombre === '1'; };

  document.querySelectorAll('[data-maj]').forEach(function (el) { el.textContent = D.miseAJour; });

  // ---------- Widgets TradingView ----------
  function widget(el, file, config) {
    el.replaceChildren();
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
  function mini(el, symbole) {
    el.dataset.tvSym = symbole;
    widget(el, 'embed-widget-mini-symbol-overview.js', {
      symbol: symbole, width: '100%', height: '100%', locale: 'fr', dateRange: '12M',
      colorTheme: sombre() ? 'dark' : 'light', isTransparent: true, autosize: true, largeChartUrl: '', chartOnly: false, noTimeScale: false
    });
  }
  // Utilisé par js/graphique.js quand l'historique n'est pas disponible.
  window.MG_widget = mini;

  function widgets() {
    widget(document.getElementById('tape'), 'embed-widget-ticker-tape.js', {
      symbols: [
        { proName: 'NASDAQ:SPCX', title: 'SpaceX' }, { proName: 'NASDAQ:GOOGL', title: 'Google' },
        { proName: 'TSX:SU', title: 'Suncor' }, { proName: 'TSX:CVE', title: 'Cenovus' },
        { proName: 'NASDAQ:SNDK', title: 'Sandisk' }, { proName: 'NASDAQ:WDC', title: 'Western Digital' },
        { proName: 'AMEX:EWT', title: 'Taïwan (EWT)' }, { proName: 'OANDA:XAUUSD', title: 'Or' },
        { proName: 'OANDA:XAGUSD', title: 'Argent' }, { proName: 'OANDA:XPTUSD', title: 'Platine' },
        { proName: 'OANDA:XPDUSD', title: 'Palladium' }, { proName: 'TVC:UKOIL', title: 'Brent' },
        { proName: 'FX_IDC:USDCAD', title: 'USD/CAD' }
      ],
      showSymbolLogo: true, isTransparent: true, displayMode: 'adaptive', colorTheme: sombre() ? 'dark' : 'light', locale: 'fr'
    });
    document.querySelectorAll('[data-tv]').forEach(function (el) { mini(el, el.dataset.tv); });
    document.querySelectorAll('[data-tv-sym]:not([data-tv])').forEach(function (el) { mini(el, el.dataset.tvSym); });
  }

  // ---------- Graphiques fixes (Chart.js) ----------
  var graphes = [];
  function fixes() {
    graphes.forEach(function (g) { g.destroy(); });
    graphes = [];
    if (!window.Chart) return;
    var fg = css('--fg'), muted = css('--muted'), line = css('--line'), accent = css('--accent');
    var grey = css('--neutre');
    var nf = function (d) { return new Intl.NumberFormat('fr-CA', { minimumFractionDigits: d, maximumFractionDigits: d }); };
    var base = function () {
      return {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: css('--panel'), titleColor: muted, bodyColor: fg, borderColor: line, borderWidth: 1 } }
      };
    };
    var ajoute = function (id, cfg) { var el = document.getElementById(id); if (el) graphes.push(new Chart(el, cfg)); };

    var metaux = [['Or', 4048.37, 5595.47], ['Argent', 51.77, 121.62], ['Platine', 1526.5, 2920], ['Palladium', 1012, 3440]];
    var o = base();
    o.indexAxis = 'y';
    o.plugins.tooltip.callbacks = { label: function (x) { var m = metaux[x.dataIndex]; return nf(0).format(x.raw) + ' % · ' + nf(2).format(m[1]) + ' $ vs record ' + nf(0).format(m[2]) + ' $'; } };
    o.scales = { x: { min: -100, max: 0, ticks: { color: muted, callback: function (v) { return v + ' %'; } }, grid: { color: line } }, y: { grid: { display: false }, ticks: { color: fg } } };
    ajoute('cMetaux', { type: 'bar', data: { labels: metaux.map(function (m) { return m[0]; }),
      datasets: [{ data: metaux.map(function (m) { return (m[1] / m[2] - 1) * 100; }), backgroundColor: accent, borderRadius: 4, barThickness: 16 }] }, options: o });

    var per = D.ormuzPeriodes;
    o = base();
    o.indexAxis = 'y';
    o.plugins.tooltip.filter = function (x) { return x.datasetIndex === 0; };
    o.plugins.tooltip.callbacks = { label: function (x) { var p = per[x.dataIndex]; return nf(0).format(p.observe) + ' navires sur ' + nf(0).format(p.normal) + ' normalement (' + nf(0).format(x.raw) + ' %)'; } };
    o.scales = { x: { min: 0, max: 100, ticks: { color: muted, callback: function (v) { return v + ' %'; } }, grid: { color: line } }, y: { grid: { display: false }, ticks: { color: fg } } };
    ajoute('cOrmuzPer', { type: 'bar', data: { labels: per.map(function (p) { return p.libelle; }), datasets: [
      { data: per.map(function (p) { return p.observe / p.normal * 100; }), backgroundColor: accent, borderRadius: 4, barThickness: 16, grouped: false, order: 1 },
      { data: per.map(function () { return 100; }), backgroundColor: grey, borderRadius: 4, barThickness: 16, grouped: false, order: 2 }] }, options: o });

    var ref = { id: 'ref', afterDatasetsDraw: function (chart) {
      var y = chart.scales.y.getPixelForValue(D.ormuzNormalParJour), a = chart.chartArea, ctx = chart.ctx;
      ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = muted; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(a.left, y); ctx.lineTo(a.right, y); ctx.stroke();
      ctx.setLineDash([]); ctx.fillStyle = muted; ctx.textAlign = 'right'; ctx.font = '12px ' + css('--police');
      ctx.fillText('Normal ≈ ' + D.ormuzNormalParJour + ' / jour', a.right, y - 6); ctx.restore(); } };
    o = base();
    o.plugins.tooltip.callbacks = { label: function (x) { return nf(1).format(x.raw) + ' navires par jour'; } };
    o.scales = { y: { beginAtZero: true, suggestedMax: 95, ticks: { color: muted }, grid: { color: line } }, x: { grid: { display: false }, ticks: { color: muted } } };
    ajoute('cOrmuzMois', { type: 'bar', data: { labels: D.ormuzMensuel.map(function (m) { return m.mois; }), datasets: [{ data: D.ormuzMensuel.map(function (m) { return m.v; }),
      backgroundColor: D.ormuzMensuel.map(function (m, i) { return i === D.ormuzMensuel.length - 1 ? grey : accent; }), borderRadius: 3 }] }, options: o, plugins: [ref] });

    o = base();
    o.plugins.tooltip.callbacks = { label: function (x) { return x.raw + ' navires'; } };
    o.scales = { y: { beginAtZero: true, ticks: { precision: 0, color: muted }, grid: { color: line } }, x: { grid: { display: false }, ticks: { autoSkip: true, maxRotation: 0, color: muted } } };
    ajoute('cOrmuzJour', { type: 'bar', data: { labels: D.ormuzQuotidien.map(function (d) { return d[0]; }),
      datasets: [{ data: D.ormuzQuotidien.map(function (d) { return d[1]; }), backgroundColor: accent, borderRadius: 3 }] }, options: o });

    var ex = D.exportateurs;
    o = base();
    o.indexAxis = 'y';
    o.plugins.tooltip.callbacks = { label: function (x) { return nf(0).format(x.raw) + ' milliers de barils par jour'; } };
    o.scales = { x: { ticks: { color: muted, callback: function (v) { return nf(0).format(v); } }, grid: { color: line } },
      y: { grid: { display: false }, ticks: { color: function (c) { return ex[c.index] && ex[c.index][0] === 'Canada' ? accent : fg; },
        font: function (c) { return { weight: ex[c.index] && ex[c.index][0] === 'Canada' ? '600' : '400' }; } } } };
    ajoute('cExport', { type: 'bar', data: { labels: ex.map(function (e, i) { return (i + 1) + '. ' + e[0]; }),
      datasets: [{ data: ex.map(function (e) { return e[1]; }), backgroundColor: ex.map(function (e) { return e[0] === 'Canada' ? accent : grey; }), borderRadius: 3, barThickness: 14 }] }, options: o });

    var fx = D.devises;
    var rel = function (arr) { return arr.map(function (v) { return (v / arr[0] - 1) * 100; }); };
    var series = [['USD/CAD', fx.usdcad, css('--serie-1')], ['EUR/USD', fx.eurusd, css('--serie-2')], ['EUR/CAD', fx.eurcad, css('--serie-3')]];
    o = base();
    o.interaction = { mode: 'index', intersect: false };
    o.plugins.legend = { display: true, labels: { color: fg, boxWidth: 12, boxHeight: 2 } };
    o.plugins.tooltip.callbacks = { label: function (x) { return x.dataset.label + ' ' + nf(4).format(x.dataset.raw[x.dataIndex]) + ' (' + (x.raw >= 0 ? '+' : '') + nf(1).format(x.raw) + ' %)'; } };
    o.scales = { y: { ticks: { color: muted, callback: function (v) { return (v > 0 ? '+' : '') + v + ' %'; } }, grid: { color: line } }, x: { grid: { display: false }, ticks: { color: muted } } };
    ajoute('cFx', { type: 'line', data: { labels: fx.mois, datasets: series.map(function (s) {
      return { label: s[0], data: rel(s[1]), raw: s[1], borderColor: s[2], backgroundColor: s[2], borderWidth: 2, pointRadius: 2, tension: 0 }; }) }, options: o });
  }

  window.MG_redessinerFixes = function () { widgets(); fixes(); };
  // Premier dessin après l'application du thème (js/main.js est un module, exécuté après ce script).
  window.addEventListener('DOMContentLoaded', function () { widgets(); fixes(); });
})();
