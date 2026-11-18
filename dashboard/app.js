/* Token Launch Radar — the page. Vanilla script, no imports, no network: every figure comes from
   window.RADAR, the data.js the entry's program writes beside this page from the sealed snapshot.
   State lives in the location hash (#view=board&cat=Dexs, #view=detail&slug=..., #view=live), so any
   view can be linked, screenshotted and re-opened exactly as it was left. */

(function () {
  'use strict';
  var app = document.getElementById('app');
  var D = window.RADAR;
  if (!D || !D.rows) {
    app.innerHTML = '<div class="empty">No radar data: run the entry program first; it writes data.js beside this page.</div>';
    return;
  }

  /* Formatting ------------------------------------------------------------ */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    if (n == null) return '—';
    if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n;
  }
  function pct(n) {
    if (n == null) return '<span class="flat">n/a</span>';
    var cls = n > 0.05 ? 'up' : n < -0.05 ? 'down' : 'flat';
    return '<span class="' + cls + '">' + (n > 0 ? '+' : '') + n.toFixed(1) + '%</span>';
  }
  function ageLabel(days) {
    if (days == null) return 'unknown';
    if (days < 30) return days + 'd';
    if (days < 365) return Math.round(days / 30.4) + ' mo';
    return (days / 365.25).toFixed(1) + ' yrs';
  }
  function mult(n) { return '×' + Number(n).toFixed(3).replace(/0+$/, '').replace(/\.$/, '.0'); }

  /* State ----------------------------------------------------------------- */

  function parseHash() {
    var s = { view: 'board', slug: '', q: '', cat: '', chain: '', sort: 'rank', dir: '', wl: '', min: '' };
    var h = location.hash.replace(/^#/, '');
    h.split('&').forEach(function (pair) {
      var kv = pair.split('=');
      if (kv.length === 2) s[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1]);
    });
    return s;
  }
  function hashOf(s) {
    var parts = [];
    Object.keys(s).forEach(function (k) {
      if (s[k] !== '' && !(k === 'view' && s[k] === 'board') && !(k === 'sort' && s[k] === 'rank' && s.dir === '')) {
        parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(s[k]));
      }
    });
    return '#' + parts.join('&');
  }
  function go(s) { location.hash = hashOf(s); }

  var categories = [];
  var chainSet = {};
  D.rows.forEach(function (r) {
    if (r.category && categories.indexOf(r.category) < 0) categories.push(r.category);
    r.chains.forEach(function (c) { chainSet[c] = true; });
  });
  categories.sort();
  var chains = Object.keys(chainSet).sort();

  /* Shared chrome ----------------------------------------------------------- */

  function masthead() {
    return '<div class="masthead"><div class="scope" aria-hidden="true"></div><div>' +
      '<h1>Token Launch <span class="thin">Radar</span></h1>' +
      '<p class="tagline">Every protocol in the snapshot that records <b>no token yet</b>, ranked by what its token ' +
      'would be worth if it traded like its peers. Protocols that already trade are never ranked — they set the ' +
      'multiples, and sit in their own view at the market\u2019s own values.</p></div></div>' +
      '<div class="chips">' +
      '<span class="chip"><b>' + D.rows.length + '</b> pre-token protocols ranked</span>' +
      '<span class="chip hot">watchlist <b>' + D.watchlist_size + '/' + D.watchlist_size + '</b> covered</span>' +
      '<span class="chip"><b>' + D.early_size + '</b> found below the ' + money(D.floor_usd) + ' floor</span>' +
      '<span class="chip"><b>' + D.peer_count + '</b> trading peers set the multiples</span>' +
      '<span class="chip">global peer multiple <b>' + mult(D.global_multiple) + '</b></span>' +
      '<span class="chip">snapshot <b>' + esc(D.as_of) + '</b> · model <b>' + esc(D.model_version) + '</b></span>' +
      '</div>' +
      '<div class="method"><span class="formula">implied value = TVL \u00d7 category peer multiple \u00d7 momentum \u00d7 maturity \u00d7 reach</span>' +
      '<p>The peer multiple is the median market-cap / TVL of the protocols in the same category that already trade ' +
      '(the global median where a category has fewer than three). Momentum reads the 7-day TVL change, maturity reads how ' +
      'long the protocol has run with no token, reach counts its chains. Wrapped, staked and bridged products of tokens ' +
      'that already trade are left off the board, as the watchlist leaves them off: WBTC is Bitcoin, not a launch to come. ' +
      'No name is special-cased; open any row to audit its arithmetic and read its farm plan. An implied value is this ' +
      'board\u2019s claim, not a prediction that a token comes.</p></div>';
  }

  function footer() {
    return '<footer><p>Data: ' + esc(D.source) + '. The snapshot is sealed: every run of this radar reads the same bytes.</p>' +
      '<p>Say a protocol \u201crecords no token\u201d, never that it has none: a record can lag a launch. Farm plans are ' +
      'starting points, not advice — check a protocol\u2019s own pages before putting capital in, and never pay anyone to release a reward.</p></footer>';
  }

  /* Board view -------------------------------------------------------------- */

  function filteredRows(s) {
    var rows = D.rows.filter(function (r) {
      if (s.wl === '1' && !r.watchlist) return false;
      if (s.cat && r.category !== s.cat) return false;
      if (s.chain && r.chains.indexOf(s.chain) < 0) return false;
      if (s.min && r.tvl_usd < Number(s.min)) return false;
      if (s.q) {
        var q = s.q.toLowerCase();
        if (r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      }
      return true;
    });
    var by = {
      rank: function (a, b) { return a.rank - b.rank; },
      tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
      change: function (a, b) { return (b.change_7d == null ? -1e9 : b.change_7d) - (a.change_7d == null ? -1e9 : a.change_7d); },
      age: function (a, b) { return (b.age_days == null ? -1 : b.age_days) - (a.age_days == null ? -1 : a.age_days); },
      name: function (a, b) { return a.name < b.name ? -1 : 1; }
    };
    var cmp = by[s.sort] || by.rank;
    if (s.dir !== '' && s.dir !== naturalDir(s.sort)) cmp = function (a, b) { return -cmp(a, b); };
    rows.sort(cmp);
    return rows;
  }

  /* Each sort key's natural direction: the way its column reads best first. A header click takes the
     natural direction, a second click on the same header reverses it. */
  function naturalDir(key) { return key === 'rank' || key === 'name' ? 'asc' : 'desc'; }
  function sortArrow(s, key) {
    if ((s.sort || 'rank') !== key) return '';
    var dir = s.dir !== '' ? s.dir : naturalDir(key);
    return ' <span class="arr">' + (dir === 'asc' ? '\u2191' : '\u2193') + '</span>';
  }

  function boardView(s) {
    var rows = filteredRows(s);
    var maxImplied = rows.reduce(function (m, r) { return Math.max(m, r.implied_value_usd); }, 0);
    var catOpts = '<option value="">All categories</option>' + categories.map(function (c) {
      return '<option value="' + esc(c) + '"' + (s.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    var chainOpts = '<option value="">All chains</option>' + chains.map(function (c) {
      return '<option value="' + esc(c) + '"' + (s.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    var minOpts = [['', 'Any TVL'], ['50000000', '≥ $50M'], ['250000000', '≥ $250M'], ['1000000000', '≥ $1B']].map(function (o) {
      return '<option value="' + o[0] + '"' + (s.min === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
    }).join('');
    var sortOpts = [['rank', 'Implied value'], ['tvl', 'TVL'], ['change', '7d change'], ['age', 'Age'], ['name', 'Name']].map(function (o) {
      return '<option value="' + o[0] + '"' + (s.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
    }).join('');

    var html = masthead() +
      '<div class="controls">' +
      '<input type="search" id="q" placeholder="Search name or slug\u2026" value="' + esc(s.q) + '">' +
      '<select id="cat">' + catOpts + '</select>' +
      '<select id="chain">' + chainOpts + '</select>' +
      '<select id="min">' + minOpts + '</select>' +
      '<label>Sort <select id="sort">' + sortOpts + '</select></label>' +
      '<label><input type="checkbox" id="wl"' + (s.wl === '1' ? ' checked' : '') + '> Watchlist only</label>' +
      '<span class="spacer"></span>' +
      '<span class="seg"><button id="v-board" class="on">Pre-token board</button><button id="v-live">Already trading</button></span>' +
      '</div>' +
      '<p class="count">Showing <b>' + rows.length + '</b> of ' + D.rows.length + ' ranked protocols. Click a column head to sort by it, a row for its model breakdown and farm plan.</p>';

    if (rows.length === 0) {
      html += '<div class="empty">No protocol matches those filters. Loosen one and sweep again.</div>';
    } else {
      html += '<table><thead><tr><th class="num sortable" data-sort="rank" title="Sort by implied value">#' + sortArrow(s, 'rank') + '</th>' +
        '<th class="sortable" data-sort="name" title="Sort by name">Protocol' + sortArrow(s, 'name') + '</th><th>Category</th><th>Chains</th>' +
        '<th class="num sortable" data-sort="tvl" title="Sort by TVL">TVL' + sortArrow(s, 'tvl') + '</th>' +
        '<th class="num sortable" data-sort="change" title="Sort by 7-day TVL change">7d' + sortArrow(s, 'change') + '</th>' +
        '<th class="num sortable" data-sort="age" title="Sort by age with no token">Age' + sortArrow(s, 'age') + '</th><th class="num">Peer \u00d7</th>' +
        '<th class="num sortable" data-sort="rank" title="Sort by implied value">Implied value' + sortArrow(s, 'rank') + '</th><th>Signal</th></tr></thead><tbody>';
      rows.forEach(function (r) {
        var tags = (r.watchlist ? '<span class="tag wl">Watchlist</span>' : '') +
          (!r.watchlist && r.tvl_usd < D.floor_usd ? '<span class="tag early">Early</span>' : '');
        var w = maxImplied > 0 ? Math.max(2, Math.round((r.implied_value_usd / maxImplied) * 100)) : 0;
        html += '<tr data-slug="' + esc(r.slug) + '"><td class="num rank">' + r.rank + '</td>' +
          '<td><span class="pname">' + esc(r.name) + '</span>' + tags + '<br><span class="pslug">' + esc(r.slug) + '</span></td>' +
          '<td class="cat">' + esc(r.category || 'Uncategorised') + '</td>' +
          '<td class="chains">' + esc(r.chains.slice(0, 3).join(', ')) + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
          '<td class="num">' + money(r.tvl_usd) + '</td>' +
          '<td class="num">' + pct(r.change_7d) + '</td>' +
          '<td class="num">' + ageLabel(r.age_days) + '</td>' +
          '<td class="num">' + mult(r.model.multiple) + '</td>' +
          '<td class="num implied">' + money(r.implied_value_usd) + '</td>' +
          '<td class="sig"><div class="sigbar"><i style="width:' + w + '%"></i></div></td></tr>';
      });
      html += '</tbody></table>';
    }
    return html + footer();
  }

  /* Detail view ------------------------------------------------------------- */

  function detailView(s) {
    var r = null;
    D.rows.forEach(function (x) { if (x.slug === s.slug) r = x; });
    if (!r) return masthead() + '<div class="empty">No ranked protocol with that slug. <a href="#view=board">Back to the board</a></div>' + footer();
    var m = r.model;
    var base = r.tvl_usd * m.multiple;
    var afterMomentum = base * m.momentum_multiplier;
    var afterMaturity = afterMomentum * m.maturity_multiplier;
    var catRow = null;
    D.categories.forEach(function (c) { if (c.category === r.category) catRow = c; });
    var html = '<a class="back" href="#view=board">\u2190 Back to the board</a>' +
      '<div class="detail-head"><div><h2>' + esc(r.name) + '</h2>' +
      '<span class="pslug">' + esc(r.slug) + '</span>' +
      (r.watchlist ? '<span class="tag wl">Watchlist</span>' : '<span class="tag early">Early — below the floor</span>') +
      '</div><div class="big-implied"><div class="k">Implied value · rank #' + r.rank + ' of ' + D.rows.length + '</div>' +
      '<div class="v">' + money(r.implied_value_usd) + '</div></div></div>' +
      '<div class="grid">' +
      '<div class="stat"><div class="k">TVL</div><div class="v">' + money(r.tvl_usd) + '</div><div class="s">as of ' + esc(D.as_of) + '</div></div>' +
      '<div class="stat"><div class="k">7d TVL change</div><div class="v">' + (r.change_7d == null ? 'n/a' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(1) + '%') + '</div><div class="s">momentum input</div></div>' +
      '<div class="stat"><div class="k">Running since</div><div class="v">' + esc(r.listed_at || 'unknown') + '</div><div class="s">' + ageLabel(r.age_days) + ' with no token recorded</div></div>' +
      '<div class="stat"><div class="k">Category</div><div class="v">' + esc(r.category || '—') + '</div><div class="s">' + (catRow ? catRow.peers + ' trading peers' : 'no category peers') + '</div></div>' +
      '<div class="stat"><div class="k">Chains</div><div class="v">' + r.chains.length + '</div><div class="s">' + esc(r.chains.join(', ') || 'none named') + '</div></div>' +
      '<div class="stat"><div class="k">Token status</div><div class="v">Pre-token</div><div class="s">no token in its record</div></div>' +
      '</div>' +
      '<div class="panel"><h3>How the implied value is built</h3><table>' +
      '<tr><td>TVL</td><td class="num">' + money(r.tvl_usd) + '</td></tr>' +
      '<tr><td>\u00d7 peer multiple (' + esc(m.multiple_source) + ')</td><td class="num">' + mult(m.multiple) + '</td></tr>' +
      '<tr><td>= base value, priced like its trading peers</td><td class="num">' + money(Math.round(base)) + '</td></tr>' +
      '<tr><td>\u00d7 momentum (7d change ' + (r.change_7d == null ? 'unreported, counted as 0' : r.change_7d.toFixed(1) + '%') + ')</td><td class="num">' + mult(m.momentum_multiplier) + '</td></tr>' +
      '<tr><td>\u00d7 maturity (' + ageLabel(r.age_days) + ' running with no token)</td><td class="num">' + mult(m.maturity_multiplier) + '</td></tr>' +
      '<tr><td>\u00d7 reach (' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + ')</td><td class="num">' + mult(m.reach_multiplier) + '</td></tr>' +
      '<tr class="total"><td>Implied value</td><td class="num">' + money(r.implied_value_usd) + '</td></tr></table>' +
      '<p class="note">Cross-check inside the steps: base \u00d7 momentum alone is ' + money(Math.round(afterMomentum)) + ', and \u00d7 maturity is ' +
      money(Math.round(afterMaturity)) + '. Sensitivity: with a neutral week (momentum \u00d71.0) the value would be ' +
      money(Math.round(r.implied_value_usd / m.momentum_multiplier)) +
      (m.multiple_source.indexOf('category') === 0
        ? ', and priced at the global median multiple (' + mult(D.global_multiple) + ') instead of its category\u2019s it would be ' +
          money(Math.round(r.implied_value_usd * D.global_multiple / m.multiple)) + '.'
        : '. Its category has too few trading peers to set its own multiple, so the global median above is the price.') +
      ' The same formula scores every row on the board; nothing about ' + esc(r.name) + ' itself is an input beyond its record above.</p></div>' +
      '<div class="panel"><h3>Farm plan — what to do before any token</h3>' +
      (r.farm_summary ? '<div class="planstrip">' +
        '<span>Capital at work <b>' + money(r.farm_summary.capital_usd) + '</b></span>' +
        '<span>Gas over the whole plan <b>' + (r.farm_summary.gas_usd < 1 ? 'under $1' : '\u2248$' + Math.round(r.farm_summary.gas_usd)) + '</b></span>' +
        '<span>Time all-in <b>' + (r.farm_summary.minutes >= 60 ? '\u2248' + Math.floor(r.farm_summary.minutes / 60) + 'h' + (r.farm_summary.minutes % 60 ? ' ' + (r.farm_summary.minutes % 60) + 'm' : '') : r.farm_summary.minutes + ' min') + '</b></span>' +
        '<span>Hold <b>' + r.farm_summary.hold_days + ' days</b> over ' + r.farm_summary.weeks + ' weeks</span>' +
        '</div>' : '') +
      '<ol class="plan">' +
      r.farm_steps.map(function (stepText) { return '<li>' + esc(stepText) + '</li>'; }).join('') +
      '</ol><p class="note"><b>Risk note:</b> a farm plan is a starting point, not advice. Smart-contract and bridge risk are real; ' +
      'keep position sizes survivable, and treat any \u201cclaim fee\u201d as a scam.</p></div>';
    return html + footer();
  }

  /* Already-trading view ------------------------------------------------------ */

  function liveView() {
    var html = masthead() +
      '<div class="controls"><span class="spacer"></span>' +
      '<span class="seg"><button id="v-board">Pre-token board</button><button id="v-live" class="on">Already trading</button></span></div>' +
      '<p class="count">These protocols already trade, so the board never ranks them: it shows the market\u2019s own value. ' +
      'Their market-cap / TVL ratios are the peer multiples the pre-token board is priced from — the ' + D.peer_count +
      ' peers behind them, the largest ' + D.live.length + ' shown here.</p>' +
      '<table><thead><tr><th>Protocol</th><th>Symbol</th><th>Category</th><th class="num">TVL</th>' +
      '<th class="num">Market cap</th><th class="num">MCap / TVL</th><th class="num">7d</th></tr></thead><tbody>';
    D.live.forEach(function (r) {
      html += '<tr><td><span class="pname">' + esc(r.name) + '</span><br><span class="pslug">' + esc(r.slug) + '</span></td>' +
        '<td class="cat">' + esc(r.symbol || '—') + '</td><td class="cat">' + esc(r.category || 'Uncategorised') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + money(r.mcap_usd) + '</td>' +
        '<td class="num">' + (r.mcap_tvl == null ? '—' : mult(r.mcap_tvl)) + '</td><td class="num">' + pct(r.change_7d) + '</td></tr>';
    });
    return html + '</tbody></table>' + footer();
  }

  /* Wiring -------------------------------------------------------------------- */

  function render() {
    var s = parseHash();
    app.setAttribute('aria-busy', 'false');
    if (s.view === 'detail') app.innerHTML = detailView(s);
    else if (s.view === 'live') app.innerHTML = liveView(s);
    else app.innerHTML = boardView(s);
    wire(s);
    window.scrollTo(0, 0);
  }

  function wire(s) {
    var vb = document.getElementById('v-board');
    var vl = document.getElementById('v-live');
    if (vb) vb.addEventListener('click', function () { go({ view: 'board', slug: '', q: '', cat: '', chain: '', sort: 'rank', wl: '', min: '' }); });
    if (vl) vl.addEventListener('click', function () { go({ view: 'live', slug: '', q: '', cat: '', chain: '', sort: 'rank', wl: '', min: '' }); });
    if (s.view !== 'board') return;
    function upd(patch) {
      var next = parseHash();
      Object.keys(patch).forEach(function (k) { next[k] = patch[k]; });
      next.view = 'board';
      go(next);
    }
    var q = document.getElementById('q');
    if (q) q.addEventListener('change', function () { upd({ q: q.value }); });
    var cat = document.getElementById('cat');
    if (cat) cat.addEventListener('change', function () { upd({ cat: cat.value }); });
    var chain = document.getElementById('chain');
    if (chain) chain.addEventListener('change', function () { upd({ chain: chain.value }); });
    var min = document.getElementById('min');
    if (min) min.addEventListener('change', function () { upd({ min: min.value }); });
    var sort = document.getElementById('sort');
    if (sort) sort.addEventListener('change', function () { upd({ sort: sort.value, dir: '' }); });
    Array.prototype.forEach.call(document.querySelectorAll('th[data-sort]'), function (th) {
      th.addEventListener('click', function () {
        var key = th.getAttribute('data-sort');
        var cur = parseHash();
        var eff = cur.dir !== '' ? cur.dir : naturalDir(cur.sort || 'rank');
        if ((cur.sort || 'rank') === key) upd({ sort: key, dir: eff === 'asc' ? 'desc' : 'asc' });
        else upd({ sort: key, dir: '' });
      });
    });
    var wl = document.getElementById('wl');
    if (wl) wl.addEventListener('change', function () { upd({ wl: wl.checked ? '1' : '' }); });
    Array.prototype.forEach.call(document.querySelectorAll('tbody tr[data-slug]'), function (tr) {
      tr.addEventListener('click', function () {
        go({ view: 'detail', slug: tr.getAttribute('data-slug'), q: '', cat: '', chain: '', sort: 'rank', wl: '', min: '' });
      });
    });
  }

  window.addEventListener('hashchange', render);
  render();
})();
