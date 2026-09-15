'use strict';

// A fictional plumbing company's day, in America/New_York.
// "now" is Tue 2026-09-15 07:00 ET = 11:00Z. Yesterday = Mon 09-14 (04:00Z .. 04:00Z next day).

const NOW = new Date('2026-09-15T11:00:00.000Z');

const account = {
  id: 'demo-plumbing',
  name: 'Demo Plumbing',
  locationId: 'LOC123',
  timeZone: 'America/New_York',
  appBaseUrl: 'https://app.gohighlevel.com',
};

const call = (id, iso, status, contactId, extra = {}) => ({
  id, direction: 'inbound', status, dateAdded: iso, contactId, conversationId: `conv-${contactId}`,
  meta: { call: { status, duration: status === 'completed' ? 60 : 0 } }, from: '+19545550100', messageType: 'TYPE_CALL', ...extra,
});
const sms = (id, iso, direction, contactId) => ({ id, direction, dateAdded: iso, contactId, conversationId: `conv-${contactId}`, messageType: 'TYPE_SMS', body: 'hi' });

const calls = [
  // baseline week: 7 inbound calls, 2 missed
  call('b1', '2026-09-08T14:00:00Z', 'completed', 'c-b1'),
  call('b2', '2026-09-09T14:00:00Z', 'no-answer', 'c-b2'),
  call('b3', '2026-09-10T14:00:00Z', 'completed', 'c-b3'),
  call('b4', '2026-09-11T14:00:00Z', 'completed', 'c-b4'),
  call('b5', '2026-09-12T14:00:00Z', 'voicemail', 'c-b5'),
  call('b6', '2026-09-13T14:00:00Z', 'completed', 'c-b6'),
  call('b7', '2026-09-13T20:00:00Z', 'completed', 'c-b7'),
  // yesterday (Mon 09-14 ET): 5 inbound, 2 missed, 1 outbound
  call('y1', '2026-09-14T12:05:00Z', 'completed', 'c1'),
  call('y2', '2026-09-14T13:10:00Z', 'no-answer', 'c2'),          // recovered by text at 13:12
  call('y3', '2026-09-14T15:30:00Z', 'completed', 'c3'),
  call('y4', '2026-09-14T22:48:00Z', 'no-answer', 'c4'),          // NOT recovered
  call('y5', '2026-09-15T02:00:00Z', 'completed', 'c5'),          // 10 PM ET Monday: still yesterday
  { ...call('y6', '2026-09-14T16:00:00Z', 'completed', 'c1'), direction: 'outbound' },
  // today (after 04:00Z on 09-15): must be excluded
  call('t1', '2026-09-15T10:30:00Z', 'no-answer', 'c9'),
];

const smsRecords = [
  sms('s1', '2026-09-14T13:12:00Z', 'outbound', 'c2'),  // text-back for y2 (2 min later)
  sms('s2', '2026-09-14T14:00:00Z', 'inbound', 'c3'),   // customer texts
  sms('s3', '2026-09-14T14:06:00Z', 'outbound', 'c3'),  // reply after 6 min
  sms('s4', '2026-09-14T18:00:00Z', 'inbound', 'c7'),   // customer texts
  sms('s5', '2026-09-14T18:30:00Z', 'outbound', 'c7'),  // reply after 30 min
  sms('s6', '2026-09-14T23:00:00Z', 'outbound', 'c4'),  // 12 min after y4: too late to count as text-back
];

const newContacts = [
  { id: 'n1', firstName: 'Ann', source: 'Google Business Profile' },
  { id: 'n2', firstName: 'Ben', source: 'website form' },
  { id: 'n3', firstName: 'Cy', source: 'Google Ads' },
];

const appointments = [
  { id: 'ap1', startTime: '2026-09-14T15:00:00Z', dateAdded: '2026-09-14T12:30:00Z', contactId: 'c1', title: 'Water heater', appointmentStatus: 'confirmed' },
  { id: 'ap2', startTime: '2026-09-16T15:00:00Z', dateAdded: '2026-09-14T20:00:00Z', contactId: 'c3', title: 'Leak repair', appointmentStatus: 'confirmed' },
  { id: 'ap3', startTime: '2026-09-15T13:00:00Z', dateAdded: '2026-09-10T12:00:00Z', contactId: 'c8', title: 'Drain clean', address: '1 Main St', appointmentStatus: 'confirmed' },
  { id: 'ap4', startTime: '2026-09-15T17:00:00Z', dateAdded: '2026-09-11T12:00:00Z', contactId: 'c6', title: 'Cancelled job', appointmentStatus: 'cancelled' },
  { id: 'ap5', startTime: '2026-09-15T20:00:00Z', dateAdded: '2026-09-14T21:00:00Z', contactId: 'c2', title: 'Repipe estimate', appointmentStatus: 'confirmed' },
];

const waiting = [
  { id: 'conv-w1', contactName: 'Waiting Wanda', lastMessageDirection: 'inbound', lastMessageDate: '2026-09-14T08:00:00Z', lastMessageBody: 'Any update on the quote?' },   // 27h: counts
  { id: 'conv-w2', contactName: 'Fresh Fred', lastMessageDirection: 'inbound', lastMessageDate: '2026-09-15T10:30:00Z', lastMessageBody: 'hey' },                     // 30m: too fresh
  { id: 'conv-w3', contactName: 'Old Oscar', lastMessageDirection: 'inbound', lastMessageDate: '2026-08-01T10:30:00Z', lastMessageBody: 'thanks' },                   // too old
];

const pipelines = [{ id: 'p1', name: 'Jobs', stages: [{ id: 'st-new', name: 'New Lead' }, { id: 'st-est', name: 'Estimate Sent' }, { id: 'st-won', name: 'Won' }] }];

const opportunities = [
  { id: 'o1', name: 'Big Repipe', pipelineStageId: 'st-est', monetaryValue: 8200, lastStageChangeAt: '2026-09-09T12:00:00Z', contactId: 'c10' }, // 6 days: counts
  { id: 'o2', name: 'Fresh Quote', pipelineStageId: 'st-est', monetaryValue: 500, lastStageChangeAt: '2026-09-14T12:00:00Z', contactId: 'c11' },  // 1 day: not yet
  { id: 'o3', name: 'New Thing', pipelineStageId: 'st-new', monetaryValue: 900, lastStageChangeAt: '2026-09-01T12:00:00Z', contactId: 'c12' },    // wrong stage
];

const invoices = [
  { _id: 'i1', invoiceNumber: '1001', amountDue: 450, total: 450, dueDate: '2026-09-10T03:59:59Z', contactDetails: { id: 'c13', name: 'Late Larry' } },
  { _id: 'i2', invoiceNumber: '1002', amountDue: 0, total: 300, dueDate: '2026-09-10T03:59:59Z', contactDetails: { id: 'c14', name: 'Paid Pat' } },
  { _id: 'i3', invoiceNumber: '1003', amountDue: 120, total: 120, dueDate: '2026-09-30T03:59:59Z', contactDetails: { id: 'c15', name: 'Future Fay' } },
];

module.exports = { NOW, account, calls, sms: smsRecords, newContacts, appointments, waiting, pipelines, opportunities, invoices };
