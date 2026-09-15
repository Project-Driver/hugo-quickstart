'use strict';

/**
 * Minimal GoHighLevel (LeadConnector) v2 API client.
 *
 * Each Pit Board account is a GHL sub-account (location) with its own
 * Private Integration token. Every call here is scoped to one location.
 */

const BASE_URL = process.env.GHL_API_BASE || 'https://services.leadconnectorhq.com';

// GHL versions its API per domain. These are the current stable versions.
const VERSION = {
  contacts: '2021-07-28',
  conversations: '2021-04-15',
  calendars: '2021-04-15',
  opportunities: '2021-07-28',
  invoices: '2021-07-28',
};

class GhlError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'GhlError';
    this.status = status;
    this.body = body;
  }
}

function createClient({ token, locationId, fetchImpl = globalThis.fetch }) {
  if (!token) throw new Error('GHL token is required');
  if (!locationId) throw new Error('GHL locationId is required');

  async function request(method, path, { query, body, version } = {}) {
    const url = new URL(path, BASE_URL);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
      }
    }
    const res = await fetchImpl(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Version: version,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
    if (!res.ok) {
      throw new GhlError(`GHL ${method} ${url.pathname} failed with ${res.status}`, res.status, json);
    }
    return json;
  }

  /** All call records in a window (inbound + outbound). */
  async function exportMessages({ channel, startDate, endDate, limit = 1000 }) {
    const out = [];
    let cursor;
    do {
      const data = await request('GET', '/conversations/messages/export', {
        version: VERSION.conversations,
        query: { locationId, channel, startDate, endDate, limit, cursor, sortBy: 'createdAt', sortOrder: 'asc' },
      });
      out.push(...(data.messages || []));
      cursor = data.nextCursor;
      if (!data.messages || data.messages.length === 0) break;
    } while (cursor && out.length < 10000);
    return out;
  }

  async function listCalendars() {
    const data = await request('GET', '/calendars/', {
      version: VERSION.calendars,
      query: { locationId },
    });
    return (data.calendars || []).filter((c) => c.isActive !== false);
  }

  async function calendarEvents({ calendarId, startTime, endTime }) {
    const data = await request('GET', '/calendars/events', {
      version: VERSION.calendars,
      query: { locationId, calendarId, startTime, endTime },
    });
    return data.events || [];
  }

  /** Appointments across every active calendar in the window. */
  async function allAppointments({ startTime, endTime, calendarIds }) {
    const ids = calendarIds && calendarIds.length
      ? calendarIds
      : (await listCalendars()).map((c) => c.id);
    const batches = await Promise.all(ids.map((calendarId) => calendarEvents({ calendarId, startTime, endTime })));
    const seen = new Set();
    const events = [];
    for (const ev of batches.flat()) {
      if (seen.has(ev.id)) continue;
      seen.add(ev.id);
      events.push(ev);
    }
    return events;
  }

  /** Conversations where the customer spoke last (nobody replied). */
  async function conversationsWaitingOnYou({ limit = 100 } = {}) {
    const data = await request('GET', '/conversations/search', {
      version: VERSION.conversations,
      query: { locationId, lastMessageDirection: 'inbound', sortBy: 'last_message_date', sort: 'desc', limit },
    });
    return data.conversations || [];
  }

  async function contactsAddedBetween({ gte, lt, pageLimit = 100 }) {
    const out = [];
    let searchAfter;
    do {
      const body = {
        locationId,
        pageLimit,
        sort: [{ field: 'dateAdded', direction: 'desc' }],
        filters: [{ field: 'dateAdded', operator: 'range', value: { gte, lt } }],
      };
      if (searchAfter) body.searchAfter = searchAfter;
      const data = await request('POST', '/contacts/search', { version: VERSION.contacts, body });
      const contacts = data.contacts || [];
      out.push(...contacts);
      searchAfter = contacts.length === pageLimit ? contacts[contacts.length - 1].searchAfter : undefined;
    } while (searchAfter && out.length < 2000);
    return out;
  }

  async function getContact(contactId) {
    const data = await request('GET', `/contacts/${contactId}`, { version: VERSION.contacts });
    return data.contact || data;
  }

  async function openOpportunities({ limit = 100 } = {}) {
    const data = await request('GET', '/opportunities/search', {
      version: VERSION.opportunities,
      query: { location_id: locationId, status: 'open', limit },
    });
    return data.opportunities || [];
  }

  async function pipelines() {
    const data = await request('GET', '/opportunities/pipelines', {
      version: VERSION.opportunities,
      query: { locationId },
    });
    return data.pipelines || [];
  }

  async function unpaidInvoices({ limit = 100 } = {}) {
    const out = [];
    for (const status of ['sent', 'overdue', 'partially_paid']) {
      const data = await request('GET', '/invoices/', {
        version: VERSION.invoices,
        query: { altId: locationId, altType: 'location', status, limit, offset: 0 },
      });
      out.push(...(data.invoices || []));
    }
    return out;
  }

  async function sendMessage(body) {
    return request('POST', '/conversations/messages', { version: VERSION.conversations, body });
  }

  async function sendSms({ contactId, message }) {
    return sendMessage({ type: 'SMS', contactId, message });
  }

  async function sendEmail({ contactId, subject, html, emailFrom }) {
    return sendMessage({ type: 'Email', contactId, subject, html, emailFrom });
  }

  async function upsertContact(contact) {
    return request('POST', '/contacts/upsert', {
      version: VERSION.contacts,
      body: { locationId, ...contact },
    });
  }

  return {
    locationId,
    request,
    exportMessages,
    listCalendars,
    calendarEvents,
    allAppointments,
    conversationsWaitingOnYou,
    contactsAddedBetween,
    getContact,
    openOpportunities,
    pipelines,
    unpaidInvoices,
    sendSms,
    sendEmail,
    upsertContact,
  };
}

module.exports = { createClient, GhlError, VERSION, BASE_URL };
