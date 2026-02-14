import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js';
import type { OAuthClientInformation, OAuthClientMetadata, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
export declare class FileOAuthProvider implements OAuthClientProvider {
    private serverUrl;
    private clientName;
    private tokenFile;
    private clientInfoFile;
    private codeVerifierFile;
    private configDir;
    constructor(serverUrl: string, clientName?: string);
    get redirectUrl(): string;
    get clientMetadata(): OAuthClientMetadata;
    clientInformation(): OAuthClientInformation | undefined;
    saveClientInformation(info: OAuthClientInformation): Promise<void>;
    tokens(): OAuthTokens | undefined;
    saveTokens(tokens: OAuthTokens): Promise<void>;
    redirectToAuthorization(url: URL): Promise<void>;
    codeVerifier(): Promise<string>;
    getCodeVerifier(): Promise<string | undefined>;
    saveCodeVerifier(verifier: string): Promise<void>;
}
export declare class RailMcpClient {
    private client;
    private transport;
    private isConnected;
    private serverUrl;
    constructor(serverUrl?: string);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    private ensureConnected;
    listTools(): Promise<any>;
    callTool(name: string, args: any): Promise<any>;
}
export declare function getRailClient(): RailMcpClient;
