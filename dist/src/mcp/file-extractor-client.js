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
exports.FileExtractorMcpClient = exports.FileExtractorOAuthProvider = void 0;
exports.getFileExtractorClient = getFileExtractorClient;
const index_js_1 = require("@modelcontextprotocol/sdk/client/index.js");
const streamableHttp_js_1 = require("@modelcontextprotocol/sdk/client/streamableHttp.js");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
class FileExtractorOAuthProvider {
    constructor(serverUrl, clientName = 'TripNara File Extractor Client') {
        this.serverUrl = serverUrl;
        this.clientName = clientName;
        const homeDir = os.homedir();
        this.configDir = path.join(homeDir, '.tripnara-mcp');
        if (!fs.existsSync(this.configDir)) {
            fs.mkdirSync(this.configDir, { recursive: true });
        }
        const serverName = serverUrl.split('/').pop() || 'file-extractor-mcp';
        this.tokenFile = path.join(this.configDir, `${serverName}-tokens.json`);
        this.clientInfoFile = path.join(this.configDir, `${serverName}-client-info.json`);
        this.codeVerifierFile = path.join(this.configDir, `${serverName}-code-verifier.txt`);
    }
    get redirectUrl() {
        return process.env.FILE_EXTRACTOR_OAUTH_CALLBACK_URL || 'http://localhost:3000/oauth/callback';
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
        console.error('\n🔐 需要 OAuth 认证');
        console.error('请访问以下 URL 完成认证:');
        console.error(url.toString());
        console.error('\n等待认证完成...');
    }
    async codeVerifier() {
        try {
            if (fs.existsSync(this.codeVerifierFile)) {
                return fs.readFileSync(this.codeVerifierFile, 'utf-8').trim();
            }
        }
        catch (error) {
            console.error(`Failed to read code verifier: ${error}`);
        }
        return '';
    }
    async getCodeVerifier() {
        const verifier = await this.codeVerifier();
        return verifier || undefined;
    }
    async saveCodeVerifier(verifier) {
        try {
            fs.writeFileSync(this.codeVerifierFile, verifier);
        }
        catch (error) {
            console.error(`Failed to save code verifier: ${error}`);
        }
    }
}
exports.FileExtractorOAuthProvider = FileExtractorOAuthProvider;
class FileExtractorMcpClient {
    constructor(serverUrl = 'https://server.smithery.ai/@dravidsajinraj-iex/file-extractor-mcp') {
        this.client = null;
        this.transport = null;
        this.isConnected = false;
        this.serverUrl = serverUrl;
    }
    async connect() {
        if (this.isConnected && this.client) {
            return;
        }
        try {
            const authProvider = new FileExtractorOAuthProvider(this.serverUrl);
            this.transport = new streamableHttp_js_1.StreamableHTTPClientTransport(new URL(this.serverUrl), {
                authProvider,
            });
            this.client = new index_js_1.Client({
                name: 'tripnara-file-extractor-client',
                version: '1.0.0',
            });
            await this.client.connect(this.transport);
            this.isConnected = true;
            console.error('✅ File Extractor MCP client connected');
        }
        catch (error) {
            console.error('❌ Failed to connect to File Extractor MCP server:', error);
            throw error;
        }
    }
    async disconnect() {
        if (this.client) {
            try {
                await this.client.close();
            }
            catch (error) {
                console.error('Error disconnecting File Extractor client:', error);
            }
            this.client = null;
            this.transport = null;
            this.isConnected = false;
        }
    }
    async ensureConnected() {
        if (!this.isConnected || !this.client) {
            await this.connect();
        }
        if (!this.client) {
            throw new Error('File Extractor client not initialized');
        }
        return this.client;
    }
    async listTools() {
        const client = await this.ensureConnected();
        return await client.listTools();
    }
    async callTool(name, args) {
        const client = await this.ensureConnected();
        return await client.callTool({
            name,
            arguments: args,
        });
    }
    async extractMetadata(url) {
        return await this.callTool('extract_metadata', { url });
    }
    async extractFileContent(url, options) {
        return await this.callTool('extract_file_content', {
            url,
            ...options,
        });
    }
}
exports.FileExtractorMcpClient = FileExtractorMcpClient;
let fileExtractorClientInstance = null;
function getFileExtractorClient() {
    if (!fileExtractorClientInstance) {
        fileExtractorClientInstance = new FileExtractorMcpClient();
    }
    return fileExtractorClientInstance;
}
//# sourceMappingURL=file-extractor-client.js.map