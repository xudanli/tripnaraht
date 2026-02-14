"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserbaseMcpClient = void 0;
const index_js_1 = require("@modelcontextprotocol/sdk/client/index.js");
const mcp_1 = require("@smithery/api/mcp");
class BrowserbaseMcpClient {
    constructor(serverUrl, namespace, connectionIdOverride) {
        this.namespace = namespace;
        this.connectionIdOverride = connectionIdOverride;
        this.client = null;
        this.transport = null;
        this.connectionId = null;
        this.isConnected = false;
        this.serverUrl = serverUrl || 'https://server.smithery.ai/@browserbasehq/mcp-browserbase';
    }
    async connect() {
        var _a;
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
                    mcpUrl: this.serverUrl,
                };
                if (this.namespace) {
                    connectionOptions.namespace = this.namespace;
                }
                const browserbaseApiKey = process.env.BROWSERBASE_API_KEY;
                const browserbaseProjectId = process.env.BROWSERBASE_PROJECT_ID;
                if (browserbaseApiKey && browserbaseProjectId) {
                    connectionOptions.config = {
                        browserbaseApiKey,
                        browserbaseProjectId,
                    };
                }
                const result = await (0, mcp_1.createConnection)(connectionOptions);
                transport = result.transport;
                connectionId = result.connectionId;
            }
            this.transport = transport;
            this.connectionId = connectionId;
            this.client = new index_js_1.Client({
                name: 'tripnara-browserbase-client',
                version: '1.0.0',
            });
            await this.client.connect(transport);
            this.isConnected = true;
            console.log('✅ Browserbase MCP Client connected via Smithery Connect API');
            if (connectionId) {
                console.log(`   Connection ID: ${connectionId}`);
            }
        }
        catch (error) {
            if (error instanceof mcp_1.SmitheryAuthorizationError) {
                console.error('\n🔐 ============================================');
                console.error('Browserbase 认证');
                console.error('============================================');
                console.error('\n请访问以下 URL 完成 Browserbase 认证:');
                console.error(`\n${error.authorizationUrl}\n`);
                console.error('认证完成后，使用以下 connectionId 重新连接:');
                console.error(`connectionId: ${error.connectionId}\n`);
                console.error('============================================\n');
                this.connectionId = error.connectionId;
                throw new Error(`OAuth authorization required. Visit: ${error.authorizationUrl}`);
            }
            if (error.message && error.message.includes('already started')) {
                if ((_a = this.transport) === null || _a === void 0 ? void 0 : _a.started) {
                    this.isConnected = true;
                    console.log('✅ Browserbase MCP Client already connected');
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
        if (this.transport && typeof this.transport.close === 'function') {
            try {
                await this.transport.close();
            }
            catch (error) {
            }
        }
        this.transport = null;
        this.isConnected = false;
    }
    getConnectionId() {
        return this.connectionId;
    }
    isClientConnected() {
        return this.isConnected && this.client !== null;
    }
    async listTools() {
        if (!this.client) {
            throw new Error('Client not connected');
        }
        try {
            const result = await this.client.listTools();
            return result.tools || [];
        }
        catch (error) {
            console.error('Failed to list tools:', error);
            throw error;
        }
    }
    async createSession(params) {
        if (!this.client) {
            throw new Error('Client not connected');
        }
        try {
            const result = await this.client.callTool({
                name: 'browserbase_session_create',
                arguments: params,
            });
            if (result.content && Array.isArray(result.content) && result.content.length > 0) {
                const content = result.content[0];
                if (typeof content === 'object' && 'type' in content && 'text' in content) {
                    const text = content.text;
                    try {
                        const parsed = JSON.parse(text);
                        return parsed;
                    }
                    catch {
                        return { sessionId: text };
                    }
                }
            }
            throw new Error('Invalid response format');
        }
        catch (error) {
            console.error('Failed to create session:', error);
            throw error;
        }
    }
    async navigate(params) {
        if (!this.client) {
            throw new Error('Client not connected');
        }
        try {
            const result = await this.client.callTool({
                name: 'browserbase_stagehand_navigate',
                arguments: params,
            });
            if (result.content && Array.isArray(result.content) && result.content.length > 0) {
                const content = result.content[0];
                if (typeof content === 'object' && 'type' in content && 'text' in content) {
                    const text = content.text;
                    try {
                        return JSON.parse(text);
                    }
                    catch {
                        return { success: true, message: text };
                    }
                }
            }
            return { success: true };
        }
        catch (error) {
            console.error('Failed to navigate:', error);
            throw error;
        }
    }
    async screenshot(params) {
        if (!this.client) {
            throw new Error('Client not connected');
        }
        try {
            const result = await this.client.callTool({
                name: 'browserbase_screenshot',
                arguments: params,
            });
            if (result.content && Array.isArray(result.content) && result.content.length > 0) {
                const content = result.content[0];
                if (typeof content === 'object' && 'type' in content && 'text' in content) {
                    const text = content.text;
                    try {
                        const parsed = JSON.parse(text);
                        return parsed;
                    }
                    catch {
                        return { image: text };
                    }
                }
            }
            throw new Error('Invalid response format');
        }
        catch (error) {
            console.error('Failed to take screenshot:', error);
            throw error;
        }
    }
    async click(params) {
        if (!this.client) {
            throw new Error('Client not connected');
        }
        try {
            const result = await this.client.callTool({
                name: 'browserbase_stagehand_act',
                arguments: {
                    action: `Click on element with selector: ${params.selector}`,
                },
            });
            if (result.content && Array.isArray(result.content) && result.content.length > 0) {
                const content = result.content[0];
                if (typeof content === 'object' && 'type' in content && 'text' in content) {
                    const text = content.text;
                    try {
                        return JSON.parse(text);
                    }
                    catch {
                        return { success: true, message: text };
                    }
                }
            }
            return { success: true };
        }
        catch (error) {
            console.error('Failed to click:', error);
            throw error;
        }
    }
    async evaluate(params) {
        if (!this.client) {
            throw new Error('Client not connected');
        }
        try {
            const result = await this.client.callTool({
                name: 'browserbase_stagehand_extract',
                arguments: {
                    instruction: params.script || 'Extract information from the page',
                },
            });
            if (result.content && Array.isArray(result.content) && result.content.length > 0) {
                const content = result.content[0];
                if (typeof content === 'object' && 'type' in content && 'text' in content) {
                    const text = content.text;
                    try {
                        return JSON.parse(text);
                    }
                    catch {
                        return { result: text };
                    }
                }
            }
            return { result: null };
        }
        catch (error) {
            console.error('Failed to evaluate:', error);
            throw error;
        }
    }
}
exports.BrowserbaseMcpClient = BrowserbaseMcpClient;
//# sourceMappingURL=browserbase-mcp-client.js.map