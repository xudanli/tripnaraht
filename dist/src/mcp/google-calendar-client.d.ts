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
export declare class GoogleCalendarMcpClient {
    private client;
    private transport;
    private authProvider;
    private isConnected;
    constructor(serverUrl?: string);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    listTools(): Promise<any>;
    listEvents(params?: {
        calendarId?: string;
        timeMin?: string;
        timeMax?: string;
        maxResults?: number;
    }): Promise<any>;
    createEvent(params: {
        calendarId?: string;
        summary: string;
        start: {
            dateTime: string;
            timeZone?: string;
        } | {
            date: string;
        };
        end: {
            dateTime: string;
            timeZone?: string;
        } | {
            date: string;
        };
        description?: string;
        location?: string;
        attendees?: Array<{
            email: string;
        }>;
    }): Promise<any>;
    deleteEvent(params: {
        calendarId: string;
        eventId: string;
    }): Promise<any>;
    updateEvent(params: {
        calendarId: string;
        eventId: string;
        summary?: string;
        start?: {
            dateTime: string;
            timeZone?: string;
        } | {
            date: string;
        };
        end?: {
            dateTime: string;
            timeZone?: string;
        } | {
            date: string;
        };
        description?: string;
        location?: string;
    }): Promise<any>;
    findEvent(params: {
        calendarId?: string;
        query?: string;
        timeMin?: string;
        timeMax?: string;
    }): Promise<any>;
    getCurrentDateTime(): Promise<any>;
    findFreeSlots(params: {
        calendarId?: string;
        timeMin: string;
        timeMax: string;
        durationMinutes?: number;
    }): Promise<any>;
    listCalendars(): Promise<any>;
    quickAdd(params: {
        calendarId?: string;
        text: string;
    }): Promise<any>;
    private ensureConnected;
}
