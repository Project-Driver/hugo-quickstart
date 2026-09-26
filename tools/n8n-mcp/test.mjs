// Runs the connector against a fake n8n on loopback and exercises every tool
// through a real MCP client over stdio. No network, no key.
import http from 'node:http';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import assert from 'node:assert/strict';

const wf = {id: '7', name: 'Bottima Weekly', active: false, createdAt: 'x', updatedAt: 'y', versionId: 'v', tags: [],
  nodes: [{name: 'Node 14', type: 'n8n-nodes-base.openAi', parameters: {prompt: 'old prompt', temperature: 0.4}}], connections: {}, settings: {}};
const requests = [];
const fake = http.createServer((req, res) => {
  let body = ''; req.on('data', (c) => body += c); req.on('end', () => {
    requests.push({method: req.method, url: req.url, key: req.headers['x-n8n-api-key'], body: body && JSON.parse(body)});
    const send = (code, obj) => { res.writeHead(code, {'content-type': 'application/json'}); res.end(JSON.stringify(obj)); };
    if (req.headers['x-n8n-api-key'] !== 'k' && !req.url.startsWith('/webhook')) return send(401, {message: 'unauthorized'});
    if (req.url.startsWith('/api/v1/workflows?')) return send(200, {data: [wf]});
    if (req.url === '/api/v1/workflows/7' && req.method === 'GET') return send(200, wf);
    if (req.url === '/api/v1/workflows/7' && req.method === 'PUT') { Object.assign(wf, JSON.parse(body), {updatedAt: 'z'}); return send(200, wf); }
    if (req.url === '/api/v1/workflows/7/activate') { wf.active = true; return send(200, wf); }
    if (req.url.startsWith('/api/v1/executions?')) return send(200, {data: [{id: '99', workflowId: '7', status: 'error', mode: 'trigger', startedAt: 'a', stoppedAt: 'b'}]});
    if (req.url.startsWith('/api/v1/executions/99')) return send(200, {id: '99', workflowId: '7', status: 'error', data: {resultData: {lastNodeExecuted: 'Node 21', error: {message: 'folder id missing first character'}, runData: {'Node 21': [{executionStatus: 'error', executionTime: 12, error: {message: 'folder id missing first character'}, data: {main: [[{json: {a: 1}}]]}}]}}}});
    if (req.url.startsWith('/webhook/')) return send(200, {ok: true, got: JSON.parse(body || 'null'), url: req.url});
    send(404, {message: 'no route ' + req.url});
  });
});
await new Promise((r) => fake.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${fake.address().port}`;

const client = new Client({name: 'test', version: '0'});
await client.connect(new StdioClientTransport({command: 'node', args: ['server.mjs'], env: {...process.env, N8N_BASE_URL: base, N8N_API_KEY: 'k'}}));
const call = async (name, args) => JSON.parse((await client.callTool({name, arguments: args})).content[0].text);

const tools = (await client.listTools()).tools.map((t) => t.name).sort();
assert.deepEqual(tools, ['get_execution', 'get_node', 'get_workflow', 'list_executions', 'list_workflows', 'run_webhook', 'set_active', 'update_node', 'update_workflow']);

assert.equal((await call('list_workflows', {name: 'bottima'}))[0].id, '7');
assert.equal((await call('get_workflow', {id: '7'})).nodes[0], 'Node 14 (openAi)');
assert.equal((await call('get_node', {id: '7', node: 'Node 14'})).parameters.prompt, 'old prompt');

const upd = await call('update_node', {id: '7', node: 'Node 14', parameters: {prompt: 'new prompt'}});
assert.equal(upd.parameters.prompt, 'new prompt');
assert.equal(upd.parameters.temperature, 0.4, 'untouched parameters survive');
const put = requests.find((r) => r.method === 'PUT');
for (const k of ['id', 'active', 'createdAt', 'versionId', 'tags']) assert.ok(!(k in put.body), `${k} stripped before PUT`);

assert.equal((await call('set_active', {id: '7', active: true})).active, true);
assert.equal((await call('list_executions', {status: 'error'}))[0].id, '99');
const ex = await call('get_execution', {id: '99'});
assert.equal(ex.lastNode, 'Node 21');
assert.equal(ex.nodes['Node 21'].error, 'folder id missing first character');
const hook = await call('run_webhook', {path: 'bottima-weekly-content-approval', query: {action: 'approve'}, body: {x: 1}});
assert.equal(hook.status, 200);
assert.deepEqual(hook.body.got, {x: 1});

const bad = await client.callTool({name: 'get_node', arguments: {id: '7', node: 'Nope'}});
assert.ok(bad.isError && bad.content[0].text.includes('Nodes: Node 14'));

await client.close(); fake.close();
console.log('n8n-mcp: 9 tools, all checks passed');
