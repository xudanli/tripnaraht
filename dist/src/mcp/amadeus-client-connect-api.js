"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AmadeusMcpClientConnectAPI = void 0;
const index_js_1 = require("@modelcontextprotocol/sdk/client/index.js");
const mcp_1 = require("@smithery/api/mcp");
const api_1 = require("@smithery/api");
class AmadeusMcpClientConnectAPI {
    constructor(namespace, connectionIdOverride) {
        this.namespace = namespace;
        this.connectionIdOverride = connectionIdOverride;
        this.client = null;
        this.transport = null;
        this.connectionId = null;
        this.isConnected = false;
    }
    async connect() {
        var _a;
        if (this.isConnected && this.client) {
            return;
        }
        try {
            let transport;
            let connectionId;
            const clientId = process.env.AMADEUS_CLIENT_ID || process.env.AMADEUS_API_KEY;
            const clientSecret = process.env.AMADEUS_CLIENT_SECRET || process.env.AMADEUS_API_SECRET;
            const hasCredentials = !!(clientId && clientSecret);
            if (this.connectionIdOverride && !hasCredentials) {
                const connectionOptions = {
                    connectionId: this.connectionIdOverride,
                };
                if (this.namespace) {
                    connectionOptions.namespace = this.namespace;
                }
                const result = await (0, mcp_1.createConnection)(connectionOptions);
                transport = result.transport;
                connectionId = this.connectionIdOverride;
            }
            else {
                const smithery = new api_1.Smithery();
                let namespace;
                if (this.namespace) {
                    namespace = this.namespace;
                }
                else {
                    const { namespaces } = await smithery.namespaces.list();
                    if (namespaces.length > 0) {
                        namespace = namespaces[0].name;
                    }
                    else {
                        const { name } = await smithery.namespaces.create();
                        namespace = name;
                    }
                }
                const mcpUrl = 'https://server.smithery.ai/@almogqwinz/mcp-amadeus-api';
                const connectionConfig = {
                    mcpUrl,
                };
                if (hasCredentials && clientId && clientSecret) {
                    const hostname = process.env.AMADEUS_HOSTNAME ||
                        (process.env.AMADEUS_BASE_URL === 'test.api.amadeus.com' ? 'test' : 'test');
                    connectionConfig.config = {
                        amadeusClientId: clientId,
                        amadeusClientSecret: clientSecret,
                        amadeusHostname: hostname,
                    };
                    console.log(`[AmadeusClient] Creating connection with config object`);
                    console.log(`[AmadeusClient] Config: amadeusClientId, amadeusClientSecret, amadeusHostname=${hostname}`);
                }
                else {
                    console.log('[AmadeusClient] No credentials found, creating connection without config');
                }
                if (this.connectionIdOverride && hasCredentials) {
                    try {
                        await smithery.experimental.connect.connections.delete(this.connectionIdOverride, { namespace });
                        console.log(`Deleted old connection ${this.connectionIdOverride} to recreate with config`);
                    }
                    catch (error) {
                    }
                }
                const conn = await smithery.experimental.connect.connections.create(namespace, connectionConfig);
                connectionId = conn.connectionId;
                console.log(`[AmadeusClient] Connection created: ${connectionId}, status: ${((_a = conn.status) === null || _a === void 0 ? void 0 : _a.state) || 'unknown'}`);
                if (conn.status) {
                    if (conn.status.state === 'auth_required') {
                        const authUrl = conn.status.authorizationUrl;
                        if (authUrl) {
                            throw new mcp_1.SmitheryAuthorizationError(`MCP server requires authorization. Please visit: ${authUrl}`, authUrl, connectionId);
                        }
                        throw new Error('MCP server requires authorization.');
                    }
                    if (conn.status.state === 'error') {
                        const errorMsg = conn.status.message || 'Unknown error';
                        console.log(`[AmadeusClient] Connection error: ${errorMsg}`);
                        throw new Error(`MCP connection failed: ${errorMsg}`);
                    }
                    if (conn.status.state === 'connected') {
                        console.log(`[AmadeusClient] Connection is connected, config should be applied`);
                    }
                }
                const result = await (0, mcp_1.createConnection)({
                    connectionId,
                    namespace,
                });
                transport = result.transport;
                console.log(`[AmadeusClient] Got transport for connection ${connectionId}`);
            }
            this.transport = transport;
            this.connectionId = connectionId;
            this.client = new index_js_1.Client({
                name: 'tripnara-amadeus-client',
                version: '1.0.0',
            });
            await this.client.connect(transport);
            this.isConnected = true;
            console.log('✅ Connected to Amadeus MCP server via Connect API');
        }
        catch (error) {
            if (error instanceof mcp_1.SmitheryAuthorizationError) {
                console.error('\n🔐 ============================================');
                console.error('Amadeus 认证');
                console.error('============================================');
                console.error('\n请访问以下 URL 完成 Amadeus 认证:');
                console.error(`\n${error.authorizationUrl}\n`);
                console.error('认证完成后，使用以下 connectionId 重新连接:');
                console.error(`connectionId: ${error.connectionId}\n`);
                console.error('============================================\n');
                this.connectionId = error.connectionId;
                throw new Error(`OAuth authorization required. Visit: ${error.authorizationUrl}`);
            }
            console.error('❌ Failed to connect:', error);
            throw error;
        }
    }
    async reconnect(connectionId) {
        try {
            const connectionOptions = {
                connectionId,
            };
            if (this.namespace) {
                connectionOptions.namespace = this.namespace;
            }
            const result = await (0, mcp_1.createConnection)(connectionOptions);
            this.transport = result.transport;
            this.connectionId = connectionId;
            this.client = new index_js_1.Client({
                name: 'tripnara-amadeus-client',
                version: '1.0.0',
            });
            await this.client.connect(this.transport);
            this.isConnected = true;
            console.log('✅ Reconnected to Amadeus MCP server');
        }
        catch (error) {
            console.error('❌ Failed to reconnect:', error);
            throw error;
        }
    }
    async disconnect() {
        if (!this.isConnected || !this.client) {
            return;
        }
        try {
            await this.client.close();
            this.isConnected = false;
            console.log('✅ Disconnected from Amadeus MCP server');
        }
        catch (error) {
            console.error('❌ Failed to disconnect:', error);
        }
    }
    async listTools() {
        await this.ensureConnected();
        return await this.client.listTools();
    }
    async callTool(name, args) {
        await this.ensureConnected();
        return await this.client.callTool({
            name,
            arguments: args,
        });
    }
    getConnectionId() {
        return this.connectionId;
    }
    async ensureConnected() {
        if (!this.isConnected || !this.client) {
            await this.connect();
        }
    }
}
exports.AmadeusMcpClientConnectAPI = AmadeusMcpClientConnectAPI;
//# sourceMappingURL=amadeus-client-connect-api.js.map