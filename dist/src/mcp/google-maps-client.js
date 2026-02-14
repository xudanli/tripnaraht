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
exports.GoogleMapsMcpClient = void 0;
exports.getGoogleMapsClient = getGoogleMapsClient;
const index_js_1 = require("@modelcontextprotocol/sdk/client/index.js");
const streamableHttp_js_1 = require("@modelcontextprotocol/sdk/client/streamableHttp.js");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
class FileOAuthProvider {
    constructor(serverUrl) {
        this.serverUrl = serverUrl;
        const homeDir = os.homedir();
        this.configDir = path.join(homeDir, '.tripnara-mcp');
        if (!fs.existsSync(this.configDir)) {
            fs.mkdirSync(this.configDir, { recursive: true });
        }
        const serverName = serverUrl.split('/').pop() || 'google_maps';
        this.tokenFile = path.join(this.configDir, `${serverName}-tokens.json`);
        this.clientInfoFile = path.join(this.configDir, `${serverName}-client-info.json`);
        this.codeVerifierFile = path.join(this.configDir, `${serverName}-code-verifier.txt`);
    }
    get redirectUrl() {
        return 'http://localhost:3000/oauth/callback';
    }
    get clientMetadata() {
        return {
            client_name: 'TripNara Google Maps Bridge',
            client_uri: 'http://localhost:3000',
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
            console.error('✅ Client information saved');
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
            console.error('✅ OAuth tokens saved');
        }
        catch (error) {
            console.error(`Failed to save tokens: ${error}`);
        }
    }
    async redirectToAuthorization(url) {
        console.error('\n🔐 请访问以下 URL 完成 Google Maps 认证:');
        console.error(url.toString());
        console.error('\n认证完成后，服务器将自动连接。\n');
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
class GoogleMapsMcpClient {
    constructor(serverUrl = 'https://server.smithery.ai/google_maps') {
        this.isConnected = false;
        this.authProvider = new FileOAuthProvider(serverUrl);
        this.transport = new streamableHttp_js_1.StreamableHTTPClientTransport(new URL(serverUrl), {
            authProvider: this.authProvider,
        });
        this.client = new index_js_1.Client({
            name: 'tripnara-google-maps-client',
            version: '1.0.0',
        });
    }
    async connect() {
        var _a, _b, _c, _d;
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
            console.log('✅ Connected to Google Maps MCP server');
        }
        catch (error) {
            if ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('already started')) {
                this.isConnected = true;
                console.log('✅ Transport already started, connection reused');
                return;
            }
            if (((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('Session not found')) ||
                ((_c = error.message) === null || _c === void 0 ? void 0 : _c.includes('expired')) ||
                ((_d = error.message) === null || _d === void 0 ? void 0 : _d.includes('Unauthorized'))) {
                console.error('\n⚠️  认证会话已过期或未找到');
                console.error('请运行以下命令重新认证:');
                console.error('  npm run mcp:auth:google-maps\n');
                throw new Error('Session expired. Please re-authenticate using: npm run mcp:auth:google-maps');
            }
            console.error('❌ Failed to connect:', error);
            throw error;
        }
    }
    clearAuth() {
        try {
            const homeDir = os.homedir();
            const configDir = path.join(homeDir, '.tripnara-mcp');
            const serverName = 'google_maps';
            const tokenFile = path.join(configDir, `${serverName}-tokens.json`);
            const clientInfoFile = path.join(configDir, `${serverName}-client-info.json`);
            const codeVerifierFile = path.join(configDir, `${serverName}-code-verifier.txt`);
            if (fs.existsSync(tokenFile)) {
                fs.unlinkSync(tokenFile);
                console.log('✅ 已删除认证 tokens');
            }
            if (fs.existsSync(clientInfoFile)) {
                fs.unlinkSync(clientInfoFile);
                console.log('✅ 已删除客户端信息');
            }
            if (fs.existsSync(codeVerifierFile)) {
                fs.unlinkSync(codeVerifierFile);
                console.log('✅ 已删除代码验证器');
            }
            this.isConnected = false;
        }
        catch (error) {
            console.error('清理认证信息时出错:', error);
        }
    }
    async disconnect() {
        if (!this.isConnected) {
            return;
        }
        try {
            await this.client.close();
            this.isConnected = false;
            console.log('✅ Disconnected from Google Maps MCP server');
        }
        catch (error) {
            console.error('Error disconnecting:', error);
        }
    }
    async ensureConnected() {
        if (!this.isConnected) {
            await this.connect();
        }
    }
    async listTools() {
        await this.ensureConnected();
        return await this.client.listTools();
    }
    async computeRouteMatrix(params) {
        await this.ensureConnected();
        const result = await this.client.callTool({
            name: 'GOOGLE_MAPS_COMPUTE_ROUTE_MATRIX',
            arguments: params,
        });
        return result;
    }
    async getRoute(params) {
        await this.ensureConnected();
        const result = await this.client.callTool({
            name: 'GOOGLE_MAPS_GET_ROUTE',
            arguments: params,
        });
        return result;
    }
    async geocode(params) {
        await this.ensureConnected();
        const result = await this.client.callTool({
            name: 'GOOGLE_MAPS_GEOCODING_API',
            arguments: params,
        });
        return result;
    }
    async getDirection(params) {
        await this.ensureConnected();
        const result = await this.client.callTool({
            name: 'GOOGLE_MAPS_GET_DIRECTION',
            arguments: params,
        });
        return result;
    }
    async distanceMatrix(params) {
        await this.ensureConnected();
        const result = await this.client.callTool({
            name: 'GOOGLE_MAPS_DISTANCE_MATRIX_API',
            arguments: params,
        });
        return result;
    }
}
exports.GoogleMapsMcpClient = GoogleMapsMcpClient;
let googleMapsClientInstance = null;
function getGoogleMapsClient() {
    if (!googleMapsClientInstance) {
        googleMapsClientInstance = new GoogleMapsMcpClient();
    }
    return googleMapsClientInstance;
}
//# sourceMappingURL=google-maps-client.js.map