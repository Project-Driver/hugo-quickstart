(function () {
  'use strict';
  var form = document.getElementById('td-form');
  if (!form) return;
  var $ = function (id) { return document.getElementById(id); };
  var SEV = { critical: '#ff4d4f', high: '#ff8a3d', medium: '#ffb020', low: '#4da3ff' };
  var scoreColor = function (s) { return s >= 80 ? '#8bd346' : s >= 65 ? '#ffb020' : s >= 50 ? '#ff8a3d' : '#ff4d4f'; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var scanId = null;

  function show(id, on) { $(id).hidden = !on; }

  function render(sum) {
    show('td-progress', false); show('td-free', true);
    $('td-biz').textContent = sum.business;
    $('td-grade').textContent = 'Grade ' + sum.grade;
    $('td-meta').textContent = (sum.finalUrl || sum.url).replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') + ' · ' + sum.pagesCrawled + ' pages crawled' + (sum.lighthouse ? ' · Google PageSpeed included' : '') + (sum.localPack ? ' · Google Maps compared' : '');
    var arc = $('td-ring-arc'); arc.setAttribute('stroke', scoreColor(sum.score));
    requestAnimationFrame(function () { arc.setAttribute('stroke-dashoffset', (395.8 * (1 - sum.score / 100)).toFixed(1)); });
    $('td-score').textContent = sum.score;
    $('td-sev').innerHTML = Object.keys(sum.bySeverity).filter(function (k) { return sum.bySeverity[k]; }).map(function (k) { return '<span><i style="background:' + SEV[k] + '"></i>' + sum.bySeverity[k] + ' ' + k + '</span>'; }).join('');
    $('td-cats').innerHTML = Object.keys(sum.categories).map(function (k) { var c = sum.categories[k]; return '<div class="cat-tile"><b style="color:' + scoreColor(c.score) + '">' + c.score + '</b><span>' + esc(c.label) + '</span><small>' + c.findings + ' finding' + (c.findings === 1 ? '' : 's') + '</small></div>'; }).join('');
    if (sum.teaser) $('td-teaser').innerHTML = '<span>The one to fix first · ' + esc(sum.teaser.severity) + '</span><strong>' + esc(sum.teaser.title) + '</strong><p>' + esc(sum.teaser.cost) + '</p>';
    else $('td-teaser').hidden = true;
    $('td-titles').innerHTML = sum.findingTitles.map(function (f) { return '<li><i style="background:' + SEV[f.severity] + '"></i><span>' + esc(f.title) + ' <em>' + esc(f.category) + '</em></span></li>'; }).join('') + (sum.total > sum.findingTitles.length ? '<li><i style="background:#6b7075"></i><span class="muted">and ' + (sum.total - sum.findingTitles.length) + ' more</span></li>' : '');
    if (sum.localPack && !sum.localPack.inTop3) {
      $('td-progress-sub').textContent = '';
    }
    history.replaceState(null, '', '?id=' + encodeURIComponent(sum.id));
    $('td-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function fail(msg, blocked) {
    show('td-progress', false); show('td-free', false); show('td-failed', true);
    document.querySelector('#td-failed h3').textContent = blocked ? 'We could not read your site' : 'We could not finish the scan';
    $('td-failed-msg').textContent = msg || 'Unknown error.';
  }

  var polls = 0;
  function poll() {
    fetch('/api/teardown-status?id=' + encodeURIComponent(scanId)).then(function (r) { return r.json(); }).then(function (sum) {
      if (sum.status === 'done') return render(sum);
      if (sum.status === 'failed' || sum.status === 'blocked') return fail(sum.error, sum.status === 'blocked');
      polls++;
      if (polls === 8) $('td-progress-title').textContent = 'Running Google\'s speed audit…';
      if (polls === 20) $('td-progress-title').textContent = 'Almost there…';
      if (polls > 150) return fail('The scan is taking too long.');
      setTimeout(poll, 2500);
    }).catch(function () { setTimeout(poll, 4000); });
  }

  function start(data) {
    show('td-result', true); show('td-free', false); show('td-failed', false); show('td-progress', true);
    $('td-progress-title').textContent = 'Crawling your site…';
    $('td-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    fetch('/api/teardown-start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok || !res.body.ok) throw new Error(res.body.error || 'Could not start the scan.');
        scanId = res.body.id; polls = 0; poll();
      })
      .catch(function (e) { fail(e.message); });
  }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var msg = form.querySelector('.form-msg');
    var data = {}; new FormData(form).forEach(function (v, k) { data[k] = v; });
    if (!data.url || !data.business || !data.city || !data.email) { msg.className = 'form-msg err'; msg.textContent = 'Website, business name, city and email, please.'; return; }
    msg.className = 'form-msg'; msg.textContent = '';
    start(data);
  });

  function buy(plan, btn) {
    if (!scanId) return;
    var msg = $('td-buy-msg'); btn.disabled = true; msg.className = 'form-msg'; msg.textContent = 'Opening secure checkout…';
    fetch('/api/teardown-checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: scanId, plan: plan }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (!res.ok || !res.body.url) throw new Error(res.body.error || 'Checkout is unavailable right now.');
        location.href = res.body.url;
      })
      .catch(function (e) { btn.disabled = false; msg.className = 'form-msg err'; msg.textContent = e.message; });
  }
  $('td-buy-report').addEventListener('click', function () { buy('report', this); });
  $('td-buy-call').addEventListener('click', function () { buy('call', this); });

  // Returning to a scan (back from checkout, or a shared link).
  var existing = new URLSearchParams(location.search).get('id');
  if (existing) { scanId = existing; show('td-result', true); show('td-progress', true); poll(); }
})();
