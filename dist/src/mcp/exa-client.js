"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExaMcpClient = void 0;
const index_js_1 = require("@modelcontextprotocol/sdk/client/index.js");
const streamableHttp_js_1 = require("@modelcontextprotocol/sdk/client/streamableHttp.js");
class ExaMcpClient {
    constructor(serverUrl = 'https://mcp.exa.ai/mcp') {
        this.serverUrl = serverUrl;
        this.client = null;
        this.transport = null;
        this.isConnected = false;
    }
    async connect() {
        if (this.isConnected && this.client) {
            return;
        }
        try {
            const apiKey = process.env.EXA_API_KEY;
            let serverUrl = this.serverUrl;
            if (apiKey) {
                const url = new URL(serverUrl);
                url.searchParams.set('exaApiKey', apiKey);
                serverUrl = url.toString();
            }
            this.transport = new streamableHttp_js_1.StreamableHTTPClientTransport(new URL(serverUrl));
            this.client = new index_js_1.Client({
                name: 'tripnara-exa-client',
                version: '1.0.0',
            });
            await this.client.connect(this.transport);
            this.isConnected = true;
            console.log('✅ Connected to Exa MCP server');
        }
        catch (error) {
            console.error('❌ Failed to connect to Exa MCP:', error);
            throw error;
        }
    }
    async disconnect() {
        if (this.client) {
            try {
                await this.client.close();
            }
            catch (error) {
                console.error('Error closing client:', error);
            }
            this.client = null;
        }
        this.transport = null;
        this.isConnected = false;
    }
    async callTool(name, args) {
        if (!this.client || !this.isConnected) {
            await this.connect();
        }
        if (!this.client) {
            throw new Error('Client not initialized');
        }
        const result = await this.client.callTool({
            name,
            arguments: args,
        });
        return result;
    }
    async listTools() {
        if (!this.client || !this.isConnected) {
            await this.connect();
        }
        if (!this.client) {
            throw new Error('Client not initialized');
        }
        const tools = await this.client.listTools();
        return tools.tools;
    }
    getIsConnected() {
        return this.isConnected;
    }
}
exports.ExaMcpClient = ExaMcpClient;
//# sourceMappingURL=exa-client.js.map