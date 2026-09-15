'use strict';

/**
 * Renderers for a Pit Board object: SMS text, HTML email, and plain text.
 */

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function trend(value, baseline) {
  if (baseline == null || baseline === 0) return '';
  const diff = value - baseline;
  if (Math.abs(diff) < 0.5) return ' (avg)';
  return diff > 0 ? ` (+${Math.round(diff)} vs avg)` : ` (${Math.round(diff)} vs avg)`;
}

/**
 * SMS: fits in 3 segments (under ~450 chars) with links left out, because the
 * email carries the links and the owner reads the text at a red light.
 */
function toSms(board, { boardUrl } = {}) {
  const l = board.lap;
  const lines = [];
  lines.push(`PIT BOARD · ${board.account.name} · ${board.dateLabel.split(',')[0]}`);
  lines.push(`Calls ${l.callsIn}${trend(l.callsIn, board.baseline.callsPerDay)} · Missed ${l.missed} (${l.recovered} texted back)`);
  lines.push(`New leads ${l.newLeads} · Booked ${l.booked}`);
  if (l.medianReplyMinutes != null) lines.push(`Reply time ${l.medianReplyMinutes}m · Score ${board.score}/100`);
  else lines.push(`Score ${board.score}/100`);
  if (board.isMonday && board.week) lines.push(`Last 7 days: ${board.week.callsIn} calls, ${board.week.missed} missed, ${board.week.recovered} texted back`);
  lines.push(`Today: ${board.today.count} ${board.today.count === 1 ? 'job' : 'jobs'}${board.today.appointments[0] ? `, first at ${board.today.appointments[0].time}` : ''}`);
  if (board.moneyOnTheTableTotal) {
    const first = board.moneyOnTheTable[0];
    lines.push(`On the table: ${board.moneyOnTheTableTotal} · ${first.label}: ${first.name}`);
  }
  lines.push(`Do this: ${board.doThis}`);
  if (boardUrl) lines.push(boardUrl);
  return lines.join('\n');
}

function toText(board) {
  const l = board.lap;
  const out = [];
  out.push(`PIT BOARD - ${board.account.name}`);
  out.push(`Yesterday, ${board.dateLabel}`);
  out.push('');
  out.push(`Calls in:        ${l.callsIn}${trend(l.callsIn, board.baseline.callsPerDay)}`);
  out.push(`Missed:          ${l.missed} (${l.recovered} texted back within 10 min)`);
  out.push(`New leads:       ${l.newLeads}`);
  out.push(`Booked:          ${l.booked}`);
  out.push(`Texts in/out:    ${l.textsIn}/${l.textsOut}`);
  out.push(`Reply time:      ${l.medianReplyMinutes == null ? 'n/a' : `${l.medianReplyMinutes} min`}`);
  out.push(`Response score:  ${board.score}/100`);
  if (board.week) out.push(`Last 7 days:     ${board.week.callsIn} calls, ${board.week.missed} missed, ${board.week.recovered} texted back, ${board.week.textsIn} texts in`);
  out.push('');
  out.push(`Today, ${board.todayLabel}: ${board.today.count} on the calendar`);
  for (const a of board.today.appointments) out.push(`  ${a.time}  ${a.name}${a.title ? ` - ${a.title}` : ''}${a.address ? ` - ${a.address}` : ''}`);
  out.push('');
  out.push(`Money on the table (${board.moneyOnTheTableTotal})`);
  for (const t of board.moneyOnTheTable) out.push(`  [${t.label}] ${t.name} - ${t.detail} (${t.age})${t.link ? `\n     ${t.link}` : ''}`);
  if (!board.moneyOnTheTable.length) out.push('  Nothing. Clean board.');
  out.push('');
  out.push(`Do this today: ${board.doThis}`);
  return out.join('\n');
}

const KIND_COLOR = {
  'missed-call': '#ff4d4f',
  waiting: '#ffb020',
  estimate: '#4da3ff',
  invoice: '#8bd346',
};

function stat(label, value, sub) {
  return `
  <td style="padding:0 6px 12px 0;vertical-align:top;width:25%">
    <div style="background:#15171b;border:1px solid #2a2d33;border-radius:10px;padding:14px 12px">
      <div style="font:700 34px/1 'SF Mono',Menlo,Consolas,monospace;color:#fff;letter-spacing:-1px">${esc(value)}</div>
      <div style="font:600 11px/1.3 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#ffd400;text-transform:uppercase;letter-spacing:.08em;margin-top:8px">${esc(label)}</div>
      ${sub ? `<div style="font:12px/1.4 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#9aa0a6;margin-top:4px">${esc(sub)}</div>` : ''}
    </div>
  </td>`;
}

function toHtml(board, { boardUrl, manageUrl, brand = 'Project Driver' } = {}) {
  const l = board.lap;
  const sources = Object.entries(l.leadsBySource).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ');
  const scoreColor = board.score >= 80 ? '#8bd346' : board.score >= 50 ? '#ffb020' : '#ff4d4f';

  const todayRows = board.today.appointments.length
    ? board.today.appointments.map((a) => `
      <tr>
        <td style="padding:8px 10px 8px 0;font:700 14px 'SF Mono',Menlo,Consolas,monospace;color:#ffd400;white-space:nowrap;vertical-align:top">${esc(a.time)}</td>
        <td style="padding:8px 0;font:14px/1.4 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#fff;vertical-align:top">
          ${a.link ? `<a href="${esc(a.link)}" style="color:#fff;text-decoration:none;font-weight:600">${esc(a.name)}</a>` : `<strong>${esc(a.name)}</strong>`}
          ${a.title && a.title !== a.name ? `<span style="color:#9aa0a6"> · ${esc(a.title)}</span>` : ''}
          ${a.address ? `<div style="color:#9aa0a6;font-size:12px">${esc(a.address)}</div>` : ''}
        </td>
      </tr>`).join('')
    : `<tr><td style="padding:8px 0;font:14px -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#9aa0a6">Nothing on the calendar yet. Good day to chase the list below.</td></tr>`;

  const tableRows = board.moneyOnTheTable.length
    ? board.moneyOnTheTable.map((t) => `
      <tr>
        <td style="padding:10px 0;border-top:1px solid #2a2d33;vertical-align:top;width:10px">
          <div style="width:8px;height:8px;border-radius:50%;background:${KIND_COLOR[t.kind] || '#9aa0a6'};margin-top:6px"></div>
        </td>
        <td style="padding:10px 10px;border-top:1px solid #2a2d33;vertical-align:top">
          <div style="font:600 11px/1.3 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:${KIND_COLOR[t.kind] || '#9aa0a6'};text-transform:uppercase;letter-spacing:.06em">${esc(t.label)} · ${esc(t.age)}</div>
          <div style="font:600 15px/1.4 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#fff;margin-top:2px">${esc(t.name)}</div>
          ${t.detail ? `<div style="font:13px/1.4 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#9aa0a6">${esc(t.detail)}</div>` : ''}
        </td>
        <td style="padding:10px 0;border-top:1px solid #2a2d33;vertical-align:middle;text-align:right;white-space:nowrap">
          ${t.link ? `<a href="${esc(t.link)}" style="display:inline-block;background:#ffd400;color:#0b0c0e;font:700 12px -apple-system,Segoe UI,Helvetica,Arial,sans-serif;padding:8px 12px;border-radius:6px;text-decoration:none">Open</a>` : ''}
        </td>
      </tr>`).join('')
    : `<tr><td colspan="3" style="padding:12px 0;font:14px -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#8bd346">Nothing on the table. Clean board.</td></tr>`;

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pit Board · ${esc(board.account.name)}</title></head>
<body style="margin:0;padding:0;background:#0b0c0e">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b0c0e"><tr><td align="center" style="padding:20px 12px">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%">
  <tr><td style="padding:0 0 14px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
      <td style="font:800 18px/1 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#fff;letter-spacing:.04em">PIT<span style="color:#ffd400">BOARD</span></td>
      <td align="right" style="font:12px -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#9aa0a6">${esc(board.account.name)}</td>
    </tr></table>
  </td></tr>

  <tr><td style="padding:0 0 10px;font:600 13px/1.4 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#9aa0a6;text-transform:uppercase;letter-spacing:.08em">Yesterday · ${esc(board.dateLabel)}</td></tr>

  <tr><td>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
      ${stat('Calls in', l.callsIn, `avg ${board.baseline.callsPerDay}/day`)}
      ${stat('Missed', l.missed, `${l.recovered} texted back`)}
      ${stat('New leads', l.newLeads, sources || 'no new leads')}
      ${stat('Booked', l.booked, l.medianReplyMinutes == null ? 'no texts to reply to' : `reply in ${l.medianReplyMinutes} min`)}
    </tr></table>
  </td></tr>

  <tr><td style="padding:2px 0 18px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#15171b;border:1px solid #2a2d33;border-radius:10px"><tr>
      <td style="padding:12px 14px;font:600 13px -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#fff">Response score</td>
      <td style="padding:12px 14px" align="right">
        <span style="font:800 22px 'SF Mono',Menlo,Consolas,monospace;color:${scoreColor}">${board.score}</span><span style="font:12px -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#9aa0a6">/100</span>
      </td>
    </tr></table>
  </td></tr>

  ${board.isMonday && board.week ? `<tr><td style="padding:0 0 18px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#15171b;border:1px solid #2a2d33;border-radius:10px"><tr>
      <td style="padding:12px 14px;font:600 11px -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#ffd400;text-transform:uppercase;letter-spacing:.08em">Monday recap · last 7 days</td>
      <td style="padding:12px 14px;font:14px -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#fff" align="right">${board.week.callsIn} calls · ${board.week.missed} missed · ${board.week.recovered} texted back · ${board.week.textsIn} texts in</td>
    </tr></table>
  </td></tr>` : ''}
  <tr><td style="padding:0 0 18px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#ffd400;border-radius:10px"><tr>
      <td style="padding:14px 16px">
        <div style="font:700 11px/1.3 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0b0c0e;text-transform:uppercase;letter-spacing:.08em">Do this today</div>
        <div style="font:600 16px/1.4 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#0b0c0e;margin-top:4px">${esc(board.doThis)}</div>
      </td>
    </tr></table>
  </td></tr>

  <tr><td style="padding:0 0 6px;font:600 13px/1.4 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#9aa0a6;text-transform:uppercase;letter-spacing:.08em">Money on the table · ${board.moneyOnTheTableTotal}${board.unpaidTotal ? ` · $${board.unpaidTotal.toLocaleString('en-US')} unpaid` : ''}</td></tr>
  <tr><td style="padding:0 0 18px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#15171b;border:1px solid #2a2d33;border-radius:10px;padding:4px 14px">${tableRows}</table>
  </td></tr>

  <tr><td style="padding:0 0 6px;font:600 13px/1.4 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#9aa0a6;text-transform:uppercase;letter-spacing:.08em">Today · ${esc(board.todayLabel)} · ${board.today.count} on the calendar</td></tr>
  <tr><td style="padding:0 0 18px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#15171b;border:1px solid #2a2d33;border-radius:10px;padding:6px 14px">${todayRows}</table>
  </td></tr>

  <tr><td style="padding:8px 0 0;font:12px/1.6 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#6b7075;text-align:center">
    Pit Board by ${esc(brand)} · sent every morning from your own system.
    ${boardUrl ? `<a href="${esc(boardUrl)}" style="color:#9aa0a6">View on the web</a>` : ''}
    ${manageUrl ? ` · <a href="${esc(manageUrl)}" style="color:#9aa0a6">Manage</a>` : ''}
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

module.exports = { toSms, toText, toHtml, esc };
