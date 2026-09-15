'use strict';

/**
 * Scan storage. On Netlify this is Netlify Blobs (store "teardowns").
 * Anywhere else (tests, local preview) it is an in-memory map.
 */

const memory = new Map();

function memoryStore() {
  return {
    async get(id) { return memory.has(id) ? JSON.parse(memory.get(id)) : null; },
    async set(id, value) { memory.set(id, JSON.stringify(value)); },
    async list() { return [...memory.keys()]; },
    _clear() { memory.clear(); },
  };
}

function blobStore() {
  const { getStore } = require('@netlify/blobs');
  const store = getStore({ name: 'teardowns', consistency: 'strong' });
  return {
    async get(id) { return store.get(id, { type: 'json' }); },
    async set(id, value) { await store.setJSON(id, value); },
    async list() { const r = await store.list(); return r.blobs.map((b) => b.key); },
  };
}

let cached;
function getScanStore(env = process.env) {
  if (cached) return cached;
  const onNetlify = !!(env.NETLIFY || env.NETLIFY_BLOBS_CONTEXT || env.NETLIFY_DEV);
  cached = onNetlify ? blobStore() : memoryStore();
  return cached;
}

/** For tests: force the memory store. */
function useMemoryStore() { cached = memoryStore(); return cached; }

module.exports = { getScanStore, useMemoryStore };
