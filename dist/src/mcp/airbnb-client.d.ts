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
    saveCodeVerifier(verifier: string): Promise<void>;
    codeVerifier(): Promise<string>;
}
export declare class AirbnbMcpClient {
    private client;
    private transport;
    private authProvider;
    private isConnected;
    constructor(serverUrl?: string);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    listTools(): Promise<any>;
    callTool(name: string, arguments_?: Record<string, any>): Promise<any>;
    private ensureConnected;
}
