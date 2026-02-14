"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostgreSQLMcpClient = void 0;
const index_js_1 = require("@modelcontextprotocol/sdk/client/index.js");
const streamableHttp_js_1 = require("@modelcontextprotocol/sdk/client/streamableHttp.js");
class PostgreSQLMcpClient {
    constructor(serverUrl) {
        this.client = null;
        this.transport = null;
        this.isConnected = false;
        this.serverUrl = serverUrl || 'https://server.smithery.ai/1Levick3/postgresql-mcp-server';
    }
    async connect() {
        var _a;
        if (this.isConnected && this.client) {
            return;
        }
        try {
            this.transport = new streamableHttp_js_1.StreamableHTTPClientTransport(new URL(this.serverUrl), {});
            this.client = new index_js_1.Client({
                name: 'tripnara-postgresql-client',
                version: '1.0.0',
            }, {
                capabilities: {},
            });
            await this.client.connect(this.transport);
            this.isConnected = true;
            console.log('✅ PostgreSQL MCP Client connected');
        }
        catch (error) {
            if (error.message && error.message.includes('already started')) {
                if ((_a = this.transport) === null || _a === void 0 ? void 0 : _a.started) {
                    this.isConnected = true;
                    console.log('✅ PostgreSQL MCP Client already connected');
                    return;
                }
            }
            throw error;
        }
    }
    async disconnect() {
        if (this.client) {
            try {
                await this.client.close();
            }
            catch (error) {
            }
            this.client = null;
        }
        this.transport = null;
        this.isConnected = false;
    }
    async query(params) {
        if (!this.client || !this.isConnected) {
            await this.connect();
        }
        try {
            const result = await this.client.callTool({
                name: 'query',
                arguments: {
                    query: params.query,
                    params: params.params || [],
                },
            });
            if (result.content && Array.isArray(result.content) && result.content.length > 0) {
                const content = result.content[0];
                if (content && typeof content === 'object' && 'type' in content && content.type === 'text' && 'text' in content) {
                    try {
                        const data = JSON.parse(content.text);
                        return {
                            rows: data.rows || data || [],
                            rowCount: data.rowCount || (Array.isArray(data) ? data.length : 0),
                            columns: data.columns,
                        };
                    }
                    catch (parseError) {
                        return {
                            rows: [{ result: content.text }],
                            rowCount: 1,
                            columns: ['result'],
                        };
                    }
                }
            }
            throw new Error('Invalid response format from PostgreSQL MCP server');
        }
        catch (error) {
            throw new Error(`PostgreSQL query failed: ${error.message}`);
        }
    }
    async execute(params) {
        if (!this.client || !this.isConnected) {
            await this.connect();
        }
        try {
            const result = await this.client.callTool({
                name: 'execute',
                arguments: {
                    query: params.query,
                    params: params.params || [],
                },
            });
            if (result.content && Array.isArray(result.content) && result.content.length > 0) {
                const content = result.content[0];
                if (content && typeof content === 'object' && 'type' in content && content.type === 'text' && 'text' in content) {
                    try {
                        const data = JSON.parse(content.text);
                        return {
                            rowCount: data.rowCount || data.affectedRows || 0,
                            lastInsertId: data.lastInsertId || data.insertId,
                        };
                    }
                    catch (parseError) {
                        return {
                            rowCount: 0,
                            lastInsertId: undefined,
                        };
                    }
                }
            }
            throw new Error('Invalid response format from PostgreSQL MCP server');
        }
        catch (error) {
            throw new Error(`PostgreSQL execute failed: ${error.message}`);
        }
    }
    async listTools() {
        if (!this.client || !this.isConnected) {
            await this.connect();
        }
        try {
            const tools = await this.client.listTools();
            return tools.tools || [];
        }
        catch (error) {
            throw new Error(`Failed to list tools: ${error.message}`);
        }
    }
    isClientConnected() {
        return this.isConnected && this.client !== null;
    }
}
exports.PostgreSQLMcpClient = PostgreSQLMcpClient;
//# sourceMappingURL=postgresql-mcp-client.js.map