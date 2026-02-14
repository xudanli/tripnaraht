"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleCalendarMcpClient = exports.FileOAuthProvider = void 0;
const index_js_1 = require("@modelcontextprotocol/sdk/client/index.js");
const streamableHttp_js_1 = require("@modelcontextprotocol/sdk/client/streamableHttp.js");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
class FileOAuthProvider {
    constructor(serverUrl, clientName = 'TripNara Google Calendar Client') {
        this.serverUrl = serverUrl;
        this.clientName = clientName;
        const homeDir = os.homedir();
        this.configDir = path.join(homeDir, '.tripnara-mcp');
        if (!fs.existsSync(this.configDir)) {
            fs.mkdirSync(this.configDir, { recursive: true });
        }
        const serverName = serverUrl.split('/').pop() || 'googlecalendar';
        this.tokenFile = path.join(this.configDir, `${serverName}-tokens.json`);
        this.clientInfoFile = path.join(this.configDir, `${serverName}-client-info.json`);
        this.codeVerifierFile = path.join(this.configDir, `${serverName}-code-verifier.txt`);
    }
    get redirectUrl() {
        return process.env.GOOGLE_CALENDAR_OAUTH_CALLBACK_URL || 'http://localhost:3000/oauth/callback';
    }
    get clientMetadata() {
        return {
            client_name: this.clientName,
            client_uri: process.env.CLIENT_URI || 'http://localhost:3000',
            redirect_uris: [this.redirectUrl],
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            scope: 'read write',
            token_endpoint_auth_method: 'none',
        };
    }
    clientInformation() {
        try {
            if (fs.existsSync(this.clientInfoFile)) {
                const content = fs.readFileSync(this.clientInfoFile, 'utf-8');
                return JSON.parse(content);
            }
        }
        catch (error) {
            console.error(`Failed to read client info: ${error}`);
        }
        return undefined;
    }
    async saveClientInformation(info) {
        try {
            fs.writeFileSync(this.clientInfoFile, JSON.stringify(info, null, 2));
        }
        catch (error) {
            console.error(`Failed to save client info: ${error}`);
        }
    }
    tokens() {
        try {
            if (fs.existsSync(this.tokenFile)) {
                const content = fs.readFileSync(this.tokenFile, 'utf-8');
                return JSON.parse(content);
            }
        }
        catch (error) {
            console.error(`Failed to read tokens: ${error}`);
        }
        return undefined;
    }
    async saveTokens(tokens) {
        try {
            fs.writeFileSync(this.tokenFile, JSON.stringify(tokens, null, 2));
        }
        catch (error) {
            console.error(`Failed to save tokens: ${error}`);
        }
    }
    async redirectToAuthorization(url) {
        console.log('\n🔐 ============================================');
        console.log('Google Calendar 认证');
        console.log('============================================');
        console.log('\n请访问以下 URL 完成 Google Calendar 认证:');
        console.log(`\n${url.toString()}\n`);
        console.log('认证完成后，请在回调 URL 中获取授权码。');
        console.log('============================================\n');
        try {
            const openModule = await Promise.resolve().then(() => __importStar(require('open'))).catch(() => null);
            if (openModule === null || openModule === void 0 ? void 0 : openModule.default) {
                await openModule.default(url.toString());
            }
            console.log('✅ 已在浏览器中打开认证页面\n');
        }
        catch (error) {
        }
    }
    async saveCodeVerifier(verifier) {
        try {
            fs.writeFileSync(this.codeVerifierFile, verifier);
        }
        catch (error) {
            console.error(`Failed to save code verifier: ${error}`);
        }
    }
    async codeVerifier() {
        try {
            if (fs.existsSync(this.codeVerifierFile)) {
                return fs.readFileSync(this.codeVerifierFile, 'utf-8');
            }
        }
        catch (error) {
            console.error(`Failed to read code verifier: ${error}`);
        }
        throw new Error('No code verifier stored');
    }
}
exports.FileOAuthProvider = FileOAuthProvider;
class GoogleCalendarMcpClient {
    constructor(serverUrl = 'https://server.smithery.ai/googlecalendar') {
        this.isConnected = false;
        this.authProvider = new FileOAuthProvider(serverUrl, 'TripNara Google Calendar Client');
        this.transport = new streamableHttp_js_1.StreamableHTTPClientTransport(new URL(serverUrl), {
            authProvider: this.authProvider,
        });
        this.client = new index_js_1.Client({
            name: 'tripnara-google-calendar-client',
            version: '1.0.0',
        });
    }
    async connect() {
        var _a;
        if (this.isConnected) {
            return;
        }
        try {
            if (this.transport.started) {
                this.isConnected = true;
                console.log('✅ Transport already started, reusing connection');
                return;
            }
            await this.client.connect(this.transport);
            this.isConnected = true;
            console.log('✅ Connected to Google Calendar MCP server');
        }
        catch (error) {
            if ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('already started')) {
                this.isConnected = true;
                console.log('✅ Transport already started, connection reused');
                return;
            }
            console.error('❌ Failed to connect:', error);
            throw error;
        }
    }
    async disconnect() {
        if (!this.isConnected) {
            return;
        }
        try {
            await this.client.close();
            this.isConnected = false;
            console.log('✅ Disconnected from Google Calendar MCP server');
        }
        catch (error) {
            console.error('❌ Failed to disconnect:', error);
        }
    }
    async listTools() {
        await this.ensureConnected();
        return await this.client.listTools();
    }
    async listEvents(params = {}) {
        await this.ensureConnected();
        const result = await this.client.callTool({
            name: 'events_list',
            arguments: params,
        });
        return result;
    }
    async createEvent(params) {
        await this.ensureConnected();
        const result = await this.client.callTool({
            name: 'create_event',
            arguments: params,
        });
        return result;
    }
    async deleteEvent(params) {
        await this.ensureConnected();
        const result = await this.client.callTool({
            name: 'delete_event',
            arguments: params,
        });
        return result;
    }
    async updateEvent(params) {
        await this.ensureConnected();
        const result = await this.client.callTool({
            name: 'update_event',
            arguments: params,
        });
        return result;
    }
    async findEvent(params) {
        await this.ensureConnected();
        const result = await this.client.callTool({
            name: 'find_event',
            arguments: params,
        });
        return result;
    }
    async getCurrentDateTime() {
        await this.ensureConnected();
        const result = await this.client.callTool({
            name: 'get_current_date_time',
            arguments: {},
        });
        return result;
    }
    async findFreeSlots(params) {
        await this.ensureConnected();
        const result = await this.client.callTool({
            name: 'find_free_slots',
            arguments: params,
        });
        return result;
    }
    async listCalendars() {
        await this.ensureConnected();
        const result = await this.client.callTool({
            name: 'list_calendars',
            arguments: {},
        });
        return result;
    }
    async quickAdd(params) {
        await this.ensureConnected();
        const result = await this.client.callTool({
            name: 'quick_add',
            arguments: params,
        });
        return result;
    }
    async ensureConnected() {
        if (!this.isConnected) {
            await this.connect();
        }
    }
}
exports.GoogleCalendarMcpClient = GoogleCalendarMcpClient;
//# sourceMappingURL=google-calendar-client.js.map