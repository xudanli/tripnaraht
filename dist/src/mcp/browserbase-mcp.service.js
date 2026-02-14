"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var BrowserbaseMcpService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserbaseMcpService = void 0;
const common_1 = require("@nestjs/common");
const browserbase_mcp_client_1 = require("./browserbase-mcp-client");
let BrowserbaseMcpService = BrowserbaseMcpService_1 = class BrowserbaseMcpService {
    constructor() {
        this.logger = new common_1.Logger(BrowserbaseMcpService_1.name);
        this.client = null;
        try {
            const serverUrl = process.env.BROWSERBASE_MCP_SERVER_URL ||
                'https://server.smithery.ai/@browserbasehq/mcp-browserbase';
            const namespace = process.env.BROWSERBASE_MCP_NAMESPACE;
            const connectionId = process.env.BROWSERBASE_MCP_CONNECTION_ID;
            this.client = new browserbase_mcp_client_1.BrowserbaseMcpClient(serverUrl, namespace, connectionId);
            this.logger.log('✅ Browserbase MCP Service initialized');
            if (connectionId) {
                this.logger.log(`   Using connection ID: ${connectionId}`);
            }
        }
        catch (error) {
            this.logger.warn(`⚠️  Failed to initialize Browserbase MCP client: ${error.message}`);
            this.client = null;
        }
    }
    async onModuleInit() {
    }
    async onModuleDestroy() {
        if (this.client) {
            try {
                await this.client.disconnect();
            }
            catch (error) {
                this.logger.warn(`Failed to disconnect Browserbase MCP client: ${error.message}`);
            }
        }
    }
    async ensureConnected() {
        if (!this.client) {
            throw new Error('Browserbase MCP client is not available');
        }
        if (this.client.isClientConnected()) {
            try {
                await this.client.disconnect();
            }
            catch (error) {
                this.logger.debug('Failed to disconnect before reconnect:', error.message);
            }
        }
        if (!this.client.isClientConnected()) {
            try {
                await this.client.connect();
            }
            catch (error) {
                if (error.message && error.message.includes('already started')) {
                    this.logger.debug('Browserbase MCP transport already started, reusing connection');
                    return;
                }
                if (error.message && error.message.includes('OAuth authorization required')) {
                    const connectionId = this.client.getConnectionId();
                    if (connectionId) {
                        this.logger.warn(`⚠️  OAuth authorization required. Connection ID: ${connectionId}`);
                        this.logger.warn(`   请访问授权 URL 完成授权，然后将 connectionId 保存到环境变量 BROWSERBASE_MCP_CONNECTION_ID`);
                    }
                }
                throw error;
            }
        }
    }
    async createSession(params) {
        await this.ensureConnected();
        if (!this.client) {
            throw new Error('Browserbase MCP client is not available');
        }
        try {
            return await this.client.createSession(params);
        }
        catch (error) {
            this.logger.error(`Browserbase create session failed: ${error.message}`);
            throw error;
        }
    }
    async navigate(params) {
        await this.ensureConnected();
        if (!this.client) {
            throw new Error('Browserbase MCP client is not available');
        }
        try {
            return await this.client.navigate(params);
        }
        catch (error) {
            this.logger.error(`Browserbase navigate failed: ${error.message}`);
            throw error;
        }
    }
    async screenshot(params) {
        await this.ensureConnected();
        if (!this.client) {
            throw new Error('Browserbase MCP client is not available');
        }
        try {
            return await this.client.screenshot(params);
        }
        catch (error) {
            this.logger.error(`Browserbase screenshot failed: ${error.message}`);
            throw error;
        }
    }
    async click(params) {
        await this.ensureConnected();
        if (!this.client) {
            throw new Error('Browserbase MCP client is not available');
        }
        try {
            return await this.client.click(params);
        }
        catch (error) {
            this.logger.error(`Browserbase click failed: ${error.message}`);
            throw error;
        }
    }
    async evaluate(params) {
        await this.ensureConnected();
        if (!this.client) {
            throw new Error('Browserbase MCP client is not available');
        }
        try {
            return await this.client.evaluate(params);
        }
        catch (error) {
            this.logger.error(`Browserbase evaluate failed: ${error.message}`);
            throw error;
        }
    }
    async listTools() {
        await this.ensureConnected();
        if (!this.client) {
            throw new Error('Browserbase MCP client is not available');
        }
        try {
            return await this.client.listTools();
        }
        catch (error) {
            this.logger.error(`Failed to list tools: ${error.message}`);
            throw error;
        }
    }
    isAvailable() {
        return this.client !== null;
    }
    async getAuthorizationUrl() {
        try {
            const serverUrl = process.env.BROWSERBASE_MCP_SERVER_URL ||
                'https://server.smithery.ai/@browserbasehq/mcp-browserbase';
            const tempClient = new browserbase_mcp_client_1.BrowserbaseMcpClient(serverUrl);
            try {
                await tempClient.connect();
                const connectionId = tempClient.getConnectionId();
                if (connectionId) {
                    return {
                        authorizationUrl: '',
                        connectionId: connectionId,
                    };
                }
                throw new Error('Already authorized but no connectionId found');
            }
            catch (error) {
                if (error.message && error.message.includes('OAuth authorization required')) {
                    const authUrl = error.message.split('Visit: ')[1] || '';
                    const connectionId = tempClient.getConnectionId();
                    if (!connectionId) {
                        throw new Error('Failed to get connectionId');
                    }
                    return {
                        authorizationUrl: authUrl,
                        connectionId: connectionId,
                    };
                }
                throw error;
            }
        }
        catch (error) {
            this.logger.error('Get authorization URL failed:', error);
            throw error;
        }
    }
    async verifyAuthorization(connectionId) {
        try {
            const serverUrl = process.env.BROWSERBASE_MCP_SERVER_URL ||
                'https://server.smithery.ai/@browserbasehq/mcp-browserbase';
            const testClient = new browserbase_mcp_client_1.BrowserbaseMcpClient(serverUrl, undefined, connectionId);
            try {
                await testClient.connect();
                return {
                    isAuthorized: true,
                    message: 'Authorization verified successfully',
                };
            }
            catch (error) {
                if (error.message && error.message.includes('OAuth authorization required')) {
                    return {
                        isAuthorized: false,
                        message: 'Authorization not completed yet',
                    };
                }
                throw error;
            }
        }
        catch (error) {
            this.logger.error('Verify authorization failed:', error);
            return {
                isAuthorized: false,
                message: error.message || 'Failed to verify authorization',
            };
        }
    }
};
exports.BrowserbaseMcpService = BrowserbaseMcpService;
exports.BrowserbaseMcpService = BrowserbaseMcpService = BrowserbaseMcpService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], BrowserbaseMcpService);
//# sourceMappingURL=browserbase-mcp.service.js.map