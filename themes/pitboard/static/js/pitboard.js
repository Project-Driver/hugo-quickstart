(function () {
  'use strict';

  // Preselect a plan from ?plan=... on the start page.
  var params = new URLSearchParams(location.search);
  var plan = params.get('plan');
  if (plan) {
    var radio = document.querySelector('input[name="plan"][value="' + plan + '"]');
    if (radio) radio.checked = true;
  }

  // Load the SMS rendering of the sample board on the sample page.
  var smsBox = document.getElementById('sms-sample');
  if (smsBox) {
    fetch('/api/board?format=sms').then(function (r) { return r.ok ? r.text() : Promise.reject(r); })
      .then(function (t) { smsBox.textContent = t; })
      .catch(function () {
        smsBox.textContent = 'PIT BOARD · Coastal Air & Heat · Monday\nCalls 14 (+3 vs avg) · Missed 4 (3 texted back)\nNew leads 6 · Booked 5\nReply time 4m · Score 84/100\nToday: 4 jobs, first at 8:00a\nOn the table: 5 · Missed call, no text back: (954) 555-0142\nDo this: Text back the missed call nobody answered. Every hour lowers the odds they still need you.';
      });
  }

  // Signup forms post JSON to /api/signup and follow the returned next step.
  document.querySelectorAll('form.signup').forEach(function (form) {
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var msg = form.querySelector('.form-msg');
      var btn = form.querySelector('button[type="submit"]');
      var data = {};
      new FormData(form).forEach(function (v, k) { data[k] = v; });
      if (!data.name || !data.business || (!data.email && !data.phone)) {
        msg.className = 'form-msg err';
        msg.textContent = 'Name, business, and an email or mobile number, please.';
        return;
      }
      btn.disabled = true;
      msg.className = 'form-msg';
      msg.textContent = 'One second…';
      fetch(form.action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
        .then(function (res) {
          if (!res.ok || !res.body.ok) throw new Error(res.body.error || 'Something went wrong.');
          msg.className = 'form-msg ok';
          msg.textContent = 'Got it. Taking you to the next step…';
          location.href = res.body.next || '/thanks/';
        })
        .catch(function (e) {
          btn.disabled = false;
          msg.className = 'form-msg err';
          msg.textContent = e.message || 'Something went wrong. Call 754-315-4467 and we will set it up by hand.';
        });
    });
  });
})();
