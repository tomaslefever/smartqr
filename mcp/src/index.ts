#!/usr/bin/env node
// Local MCP server for one business, run by Claude Code or Claude Desktop on the owner's computer
// (stdio). Signs in with the business's email and password. For the WhatsApp agent, see http.ts.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { jevCategoryFromEnv, jevFromEnv } from './jev.js';
import { configFromEnv, SmartQR } from './smartqr.js';
import { INSTRUCTIONS, registerTools } from './tools.js';

const smartqr = new SmartQR({ kind: 'owner', config: configFromEnv() });
const server = new McpServer({ name: 'smartqr', version: '0.2.0' }, { instructions: INSTRUCTIONS });
registerTools(server, {
    business: async () => smartqr,
    allowLocalFiles: true,
    // Jev (TypeSafe AI) as a second opinion, when TYPESAFE_API_KEY is set
    jev: jevFromEnv(),
    jevCategory: jevCategoryFromEnv(),
});
await server.connect(new StdioServerTransport());
