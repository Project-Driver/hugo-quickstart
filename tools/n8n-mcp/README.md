# n8n connector

Lets Claude Code work inside the n8n instance: list workflows, read a node's prompt, change it, activate a workflow, read why a run failed, trigger a webhook.

## Setup, once

1. In n8n: **Settings → n8n API → Create an API key.** Copy it.
2. In the Claude app, open the cloud environment menu in the session's title bar → **Edit**:
   - Environment variables: `N8N_API_KEY` = the key, `N8N_BASE_URL` = `https://projectdriver.app.n8n.cloud`
   - Network access: allow `projectdriver.app.n8n.cloud`
3. Start a new session. The tools appear as `mcp__n8n__*`.

Never paste the key into chat. Locally, `cd tools/n8n-mcp && npm install`, export the two variables, and the same `.mcp.json` works.

## Tools

| Tool | Does |
|---|---|
| `list_workflows` | id, name, active, last update; filter by name or active |
| `get_workflow` | summary, or the full JSON with `full: true` |
| `get_node` | one node's type, parameters and prompt |
| `update_node` | change a node's parameters in place (shallow merge) and save |
| `update_workflow` | replace nodes and connections wholesale |
| `set_active` | turn a workflow's triggers on or off |
| `list_executions` | recent runs, filter by workflow or status |
| `get_execution` | which node failed, its error, each node's output |
| `run_webhook` | POST to a workflow's webhook path |

`npm test` runs every tool against a fake n8n on loopback.
