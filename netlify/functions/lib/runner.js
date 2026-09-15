'use strict';

const { createClient } = require('./ghl');
const { reportingWindow } = require('./time');
const { composeBoard } = require('./board');
const { toSms, toHtml } = require('./render');

/** Fetch everything one board needs from GHL and compose it. */
async function buildBoard(account, { now = new Date(), fetchImpl } = {}) {
  const ghl = createClient({ token: account.token, locationId: account.locationId, fetchImpl });
  const win = reportingWindow(now, account.timeZone);

  const range = { startDate: win.baseline.start.toISOString(), endDate: win.yesterday.end.toISOString() };
  const settled = await Promise.allSettled([
    ghl.exportMessages({ channel: 'Call', ...range }),
    ghl.exportMessages({ channel: 'SMS', ...range }),
    ghl.contactsAddedBetween({ gte: win.yesterday.start.toISOString(), lt: win.yesterday.end.toISOString() }),
    ghl.allAppointments({
      startTime: String(win.yesterday.start.getTime()),
      endTime: String(win.today.end.getTime()),
      calendarIds: account.calendarIds,
    }),
    ghl.conversationsWaitingOnYou(),
    ghl.openOpportunities(),
    ghl.pipelines(),
    ghl.unpaidInvoices(),
  ]);

  const names = ['calls', 'sms', 'newContacts', 'appointments', 'waiting', 'opportunities', 'pipelines', 'invoices'];
  const data = {};
  const warnings = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') data[names[i]] = r.value;
    else { data[names[i]] = []; warnings.push(`${names[i]}: ${r.reason && r.reason.message}`); }
  });

  const board = composeBoard({ account, window: win, now, ...data });
  board.warnings = warnings;
  return { board, ghl };
}

/** Build and deliver the board to the account owner. */
async function deliverBoard(account, { now = new Date(), fetchImpl, siteUrl, dryRun = false } = {}) {
  const { board, ghl } = await buildBoard(account, { now, fetchImpl });
  const boardUrl = siteUrl && account.viewKey
    ? `${siteUrl.replace(/\/$/, '')}/api/board?a=${encodeURIComponent(account.id)}&k=${encodeURIComponent(account.viewKey)}`
    : undefined;
  const result = { account: account.id, score: board.score, warnings: board.warnings, sms: [], email: [] };

  if (dryRun) {
    result.smsPreview = toSms(board, { boardUrl });
    return { board, result };
  }

  const recipients = account.recipientContactIds && account.recipientContactIds.length
    ? account.recipientContactIds
    : [account.ownerContactId];
  const subject = `Pit Board · ${board.dateLabel.split(',')[0]}: ${board.lap.callsIn} calls, ${board.lap.missed} missed, ${board.today.count} today`;
  const smsText = toSms(board, { boardUrl });
  const html = toHtml(board, { boardUrl });

  for (const contactId of recipients) {
    if (account.sendSms) {
      try {
        const r = await ghl.sendSms({ contactId, message: smsText });
        result.sms.push(r.messageId || r.msg || 'sent');
      } catch (e) { result.sms.push(`error: ${e.message}`); }
    }
    if (account.sendEmail) {
      try {
        const r = await ghl.sendEmail({ contactId, subject, html, emailFrom: account.emailFrom });
        result.email.push(r.emailMessageId || r.messageId || 'sent');
      } catch (e) { result.email.push(`error: ${e.message}`); }
    }
  }
  return { board, result };
}

module.exports = { buildBoard, deliverBoard };

/** Deliver to every active account (optionally one), never letting one failure stop the rest. */
async function runAll({ accountId, dryRun = false, now = new Date(), fetchImpl, env = process.env } = {}) {
  const { loadAccounts } = require('./accounts');
  let accounts = loadAccounts(env);
  if (accountId) accounts = accounts.filter((a) => a.id === accountId);
  const siteUrl = env.URL || env.PITBOARD_SITE_URL;
  const results = [];
  for (const account of accounts) {
    try {
      const { result } = await deliverBoard(account, { now, fetchImpl, siteUrl, dryRun });
      results.push(result);
      console.log(`Pit Board ${dryRun ? 'built' : 'sent'}: ${account.id} score=${result.score} sms=${result.sms} email=${result.email}`);
    } catch (e) {
      results.push({ account: account.id, error: e.message });
      console.error(`Pit Board failed: ${account.id}`, e);
    }
  }
  return { ran: results.length, dryRun, results };
}

module.exports.runAll = runAll;
