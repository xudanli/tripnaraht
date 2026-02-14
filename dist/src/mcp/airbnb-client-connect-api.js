"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AirbnbMcpClientConnectAPI = void 0;
const index_js_1 = require("@modelcontextprotocol/sdk/client/index.js");
const mcp_1 = require("@smithery/api/mcp");
class AirbnbMcpClientConnectAPI {
    constructor(namespace, connectionIdOverride) {
        this.namespace = namespace;
        this.connectionIdOverride = connectionIdOverride;
        this.client = null;
        this.transport = null;
        this.connectionId = null;
        this.isConnected = false;
    }
    async connect() {
        if (this.isConnected && this.client) {
            return;
        }
        try {
            let transport;
            let connectionId;
            if (this.connectionIdOverride) {
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
                const connectionOptions = {
                    mcpUrl: 'https://server.smithery.ai/geobio/mcp-server-airbnb',
                };
                if (this.namespace) {
                    connectionOptions.namespace = this.namespace;
                }
                const result = await (0, mcp_1.createConnection)(connectionOptions);
                transport = result.transport;
                connectionId = result.connectionId;
            }
            this.transport = transport;
            this.connectionId = connectionId;
            this.client = new index_js_1.Client({
                name: 'tripnara-airbnb-client',
                version: '1.0.0',
            });
            await this.client.connect(transport);
            this.isConnected = true;
            console.log('✅ Connected to Airbnb MCP server via Connect API');
        }
        catch (error) {
            if (error instanceof mcp_1.SmitheryAuthorizationError) {
                console.error('\n🔐 ============================================');
                console.error('Airbnb 认证');
                console.error('============================================');
                console.error('\n请访问以下 URL 完成 Airbnb 认证:');
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
            const { transport } = await (0, mcp_1.createConnection)(connectionOptions);
            this.transport = transport;
            this.connectionId = connectionId;
            this.client = new index_js_1.Client({
                name: 'tripnara-airbnb-client',
                version: '1.0.0',
            });
            await this.client.connect(transport);
            this.isConnected = true;
            console.log('✅ Reconnected to Airbnb MCP server');
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
            console.log('✅ Disconnected from Airbnb MCP server');
        }
        catch (error) {
            console.error('❌ Failed to disconnect:', error);
        }
    }
    async listTools() {
        await this.ensureConnected();
        return await this.client.listTools();
    }
    async callTool(name, arguments_ = {}) {
        await this.ensureConnected();
        return await this.client.callTool({
            name,
            arguments: arguments_,
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
exports.AirbnbMcpClientConnectAPI = AirbnbMcpClientConnectAPI;
//# sourceMappingURL=airbnb-client-connect-api.js.map