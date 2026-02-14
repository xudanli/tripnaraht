import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { GoogleIdTokenPayload, GoogleTokenResponse } from '../interfaces/google-token-payload.interface';
export declare class GoogleOAuthService {
    private configService?;
    private readonly logger;
    private readonly oauth2Client;
    private readonly clientId;
    private readonly clientSecret;
    private readonly redirectUri;
    constructor(configService?: ConfigService);
    exchangeCodeForTokens(code: string, redirectUri?: string): Promise<GoogleTokenResponse>;
    verifyIdToken(idToken: string): Promise<GoogleIdTokenPayload>;
    getOAuth2Client(): OAuth2Client;
    getAuthUrl(): string;
}
