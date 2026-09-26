#!/usr/bin/env node
// MCP connector for n8n. Gives Claude Code tools to list, read, edit,
// activate and run workflows on an n8n instance through its public REST API.
//
// Configuration comes from the environment, never from chat:
//   N8N_API_KEY   an n8n API key (n8n → Settings → n8n API → Create)
//   N8N_BASE_URL  the instance, e.g. https://projectdriver.app.n8n.cloud
//
// Registered in the repo's .mcp.json, so every Claude Code session that opens
// this repo gets the tools once the two variables exist.

import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {z} from 'zod';

const BASE = (process.env.N8N_BASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.N8N_API_KEY || '';

// Every call goes through here. Errors come back as readable text, not stack traces.
export async function n8n(method, path, body, {raw = false} = {}) {
  if (!BASE || !KEY) throw new Error('N8N_BASE_URL and N8N_API_KEY must be set in the environment');
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: {'X-N8N-API-KEY': KEY, accept: 'application/json', ...(body ? {'content-type': 'application/json'} : {})},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`n8n ${method} ${path} → ${res.status}: ${text.slice(0, 500)}`);
  if (raw) return text;
  return text ? JSON.parse(text) : null;
}

// Fields that n8n rejects on update; strip them before a PUT.
const READ_ONLY = ['id', 'createdAt', 'updatedAt', 'active', 'versionId', 'tags', 'pinData', 'meta', 'shared', 'homeProject', 'isArchived', 'triggerCount', 'activeVersionId', 'activeVersion'];
export const forUpdate = (wf) => {
  const out = {};
  for (const [k, v] of Object.entries(wf)) if (!READ_ONLY.includes(k)) out[k] = v;
  out.settings = out.settings ?? {};
  return out;
};

const text = (v) => ({content: [{type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2)}]});
const fail = (e) => ({isError: true, content: [{type: 'text', text: e.message}]});

// A compact view of a workflow: enough to see the shape without the whole JSON.
const summarize = (wf) => ({
  id: wf.id,
  name: wf.name,
  active: wf.active,
  updatedAt: wf.updatedAt,
  nodes: (wf.nodes || []).map((n) => `${n.name} (${n.type.replace(/^n8n-nodes-base\./, '')})`),
});

export function buildServer() {
  const server = new McpServer({name: 'n8n', version: '1.0.0'});

  server.registerTool('list_workflows', {
    description: 'List workflows on the n8n instance: id, name, active, last update, and node count. Filter by active state or a name substring.',
    inputSchema: {
      active: z.boolean().optional().describe('Only active (true) or inactive (false) workflows'),
      name: z.string().optional().describe('Case-insensitive substring to match in the workflow name'),
      limit: z.number().int().min(1).max(250).optional().describe('Max results, default 100'),
    },
  }, async ({active, name, limit}) => {
    try {
      const q = new URLSearchParams({limit: String(limit ?? 100)});
      if (active !== undefined) q.set('active', String(active));
      const {data} = await n8n('GET', `/workflows?${q}`);
      const rows = data
        .filter((w) => !name || w.name.toLowerCase().includes(name.toLowerCase()))
        .map((w) => ({id: w.id, name: w.name, active: w.active, updatedAt: w.updatedAt, nodes: w.nodes?.length}));
      return text(rows);
    } catch (e) { return fail(e); }
  });

  server.registerTool('get_workflow', {
    description: 'Read one workflow. By default a summary (name, active, node list). Pass full=true for the complete JSON including every node\'s parameters and the connections, which is what you need before editing.',
    inputSchema: {
      id: z.string().describe('Workflow id'),
      full: z.boolean().optional().describe('Return the full workflow JSON'),
    },
  }, async ({id, full}) => {
    try {
      const wf = await n8n('GET', `/workflows/${id}`);
      return text(full ? wf : summarize(wf));
    } catch (e) { return fail(e); }
  });

  server.registerTool('get_node', {
    description: 'Read one node from a workflow by name: its type, parameters (prompts, expressions, settings) and credentials reference. Use this to inspect a prompt or a config without pulling the whole workflow.',
    inputSchema: {id: z.string().describe('Workflow id'), node: z.string().describe('Node name, exact')},
  }, async ({id, node}) => {
    try {
      const wf = await n8n('GET', `/workflows/${id}`);
      const n = wf.nodes.find((x) => x.name === node);
      if (!n) return fail(new Error(`no node named "${node}". Nodes: ${wf.nodes.map((x) => x.name).join(', ')}`));
      return text(n);
    } catch (e) { return fail(e); }
  });

  server.registerTool('update_node', {
    description: 'Change one node\'s parameters in place and save the workflow. `parameters` is merged over the node\'s existing parameters (shallow), so pass only the keys you are changing, e.g. a new prompt text. Read the node first with get_node so you know the exact key.',
    inputSchema: {
      id: z.string().describe('Workflow id'),
      node: z.string().describe('Node name, exact'),
      parameters: z.record(z.any()).describe('Parameter keys to set on the node'),
    },
  }, async ({id, node, parameters}) => {
    try {
      const wf = await n8n('GET', `/workflows/${id}`);
      const n = wf.nodes.find((x) => x.name === node);
      if (!n) return fail(new Error(`no node named "${node}"`));
      n.parameters = {...(n.parameters || {}), ...parameters};
      const saved = await n8n('PUT', `/workflows/${id}`, forUpdate(wf));
      return text({saved: saved.id, node, updatedAt: saved.updatedAt, parameters: n.parameters});
    } catch (e) { return fail(e); }
  });

  server.registerTool('update_workflow', {
    description: 'Replace a workflow\'s nodes and connections with the JSON you pass (a full workflow object as returned by get_workflow full=true, edited). Use for structural changes: adding or removing nodes, rewiring. Read-only fields are stripped automatically.',
    inputSchema: {
      id: z.string().describe('Workflow id'),
      workflow: z.record(z.any()).describe('Full workflow object: name, nodes, connections, settings'),
    },
  }, async ({id, workflow}) => {
    try {
      const saved = await n8n('PUT', `/workflows/${id}`, forUpdate(workflow));
      return text({saved: saved.id, name: saved.name, nodes: saved.nodes?.length, updatedAt: saved.updatedAt});
    } catch (e) { return fail(e); }
  });

  server.registerTool('set_active', {
    description: 'Activate or deactivate a workflow (its schedule and webhook triggers).',
    inputSchema: {id: z.string(), active: z.boolean()},
  }, async ({id, active}) => {
    try {
      const wf = await n8n('POST', `/workflows/${id}/${active ? 'activate' : 'deactivate'}`);
      return text({id: wf.id, name: wf.name, active: wf.active});
    } catch (e) { return fail(e); }
  });

  server.registerTool('list_executions', {
    description: 'Recent executions, newest first: id, workflow, status (success, error, running, waiting), start and stop times. Filter by workflow or status. This is where to look when a run failed.',
    inputSchema: {
      workflowId: z.string().optional(),
      status: z.enum(['success', 'error', 'running', 'waiting', 'canceled']).optional(),
      limit: z.number().int().min(1).max(250).optional().describe('Default 20'),
    },
  }, async ({workflowId, status, limit}) => {
    try {
      const q = new URLSearchParams({limit: String(limit ?? 20)});
      if (workflowId) q.set('workflowId', workflowId);
      if (status) q.set('status', status);
      const {data} = await n8n('GET', `/executions?${q}`);
      return text(data.map((e) => ({id: e.id, workflowId: e.workflowId, status: e.status, mode: e.mode, startedAt: e.startedAt, stoppedAt: e.stoppedAt})));
    } catch (e) { return fail(e); }
  });

  server.registerTool('get_execution', {
    description: 'One execution in detail: which node failed and its error message, plus each node\'s output data (trimmed). Use after list_executions to root-cause a failure.',
    inputSchema: {
      id: z.string().describe('Execution id'),
      maxChars: z.number().int().optional().describe('Trim each node\'s output to this many characters, default 1500'),
    },
  }, async ({id, maxChars}) => {
    try {
      const e = await n8n('GET', `/executions/${id}?includeData=true`);
      const run = e.data?.resultData || {};
      const nodes = {};
      for (const [name, runs] of Object.entries(run.runData || {})) {
        const last = runs[runs.length - 1];
        const out = JSON.stringify(last?.data?.main?.[0]?.slice(0, 3) ?? null);
        nodes[name] = {status: last?.executionStatus, error: last?.error?.message, ms: last?.executionTime, output: out.slice(0, maxChars ?? 1500)};
      }
      return text({id: e.id, workflowId: e.workflowId, status: e.status, startedAt: e.startedAt, stoppedAt: e.stoppedAt, lastNode: run.lastNodeExecuted, error: run.error?.message, nodes});
    } catch (e) { return fail(e); }
  });

  server.registerTool('run_webhook', {
    description: 'Trigger a workflow that starts with a Webhook node, by POSTing a JSON body to its path (e.g. "bottima-weekly-content-approval"). Use the test path ("webhook-test/...") to hit a workflow open in the editor. Returns the response body.',
    inputSchema: {
      path: z.string().describe('Webhook path after /webhook/, or a full path starting with webhook-test/'),
      body: z.record(z.any()).optional(),
      query: z.record(z.string()).optional().describe('Query string parameters'),
      method: z.enum(['GET', 'POST']).optional(),
    },
  }, async ({path, body, query, method}) => {
    try {
      const prefix = path.startsWith('webhook-test/') || path.startsWith('webhook/') ? '' : 'webhook/';
      const url = new URL(`${BASE}/${prefix}${path}`);
      for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);
      const res = await fetch(url, {method: method ?? (body ? 'POST' : 'GET'), headers: body ? {'content-type': 'application/json'} : {}, body: body ? JSON.stringify(body) : undefined});
      const out = await res.text();
      let parsed;
      try { parsed = JSON.parse(out); } catch { parsed = out.slice(0, 4000); }
      return text({status: res.status, body: parsed});
    } catch (e) { return fail(e); }
  });

  return server;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const server = buildServer();
  await server.connect(new StdioServerTransport());
}
