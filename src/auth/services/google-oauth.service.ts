// src/auth/services/google-oauth.service.ts
import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { GoogleIdTokenPayload, GoogleTokenResponse } from '../interfaces/google-token-payload.interface';

@Injectable()
export class GoogleOAuthService {
  private readonly logger = new Logger(GoogleOAuthService.name);
  private readonly oauth2Client: OAuth2Client;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  constructor(private configService: ConfigService) {
    this.clientId = this.configService.get<string>('GOOGLE_CLIENT_ID') || '';
    this.clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET') || '';
    this.redirectUri = this.configService.get<string>('GOOGLE_REDIRECT_URI') || '';

    if (!this.clientId) {
      this.logger.warn('GOOGLE_CLIENT_ID is not set. Google OAuth will not work.');
    }

    this.oauth2Client = new OAuth2Client(
      this.clientId,
      this.clientSecret,
      this.redirectUri,
    );
  }

  /**
   * Exchange authorization code for tokens (Code Model - Primary approach)
   * This is the recommended approach for web server applications
   */
  async exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      
      if (!tokens.id_token) {
        throw new BadRequestException('Google did not return an ID token');
      }

      return {
        access_token: tokens.access_token || '',
        expires_in: tokens.expiry_date ? Math.floor((tokens.expiry_date - Date.now()) / 1000) : 3600,
        id_token: tokens.id_token,
        refresh_token: tokens.refresh_token,
        scope: tokens.scope || '',
        token_type: 'Bearer',
      };
    } catch (error: any) {
      this.logger.error(`Failed to exchange code for tokens: ${error.message}`, error.stack);
      throw new BadRequestException(`Failed to exchange authorization code: ${error.message}`);
    }
  }

  /**
   * Verify and decode Google ID Token (for both Code Model and One Tap)
   * Validates signature, audience, issuer, and expiration
   */
  async verifyIdToken(idToken: string): Promise<GoogleIdTokenPayload> {
    try {
      const ticket = await this.oauth2Client.verifyIdToken({
        idToken,
        audience: this.clientId,
      });

      const payload = ticket.getPayload();
      if (!payload) {
        throw new BadRequestException('Invalid ID token: no payload');
      }

      // Validate required claims
      if (!payload.sub) {
        throw new BadRequestException('Invalid ID token: missing sub claim');
      }

      // Validate audience
      const aud = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;
      if (aud !== this.clientId) {
        throw new BadRequestException(`Invalid ID token: audience mismatch. Expected ${this.clientId}, got ${aud}`);
      }

      // Validate issuer (should be Google)
      if (payload.iss !== 'accounts.google.com' && payload.iss !== 'https://accounts.google.com') {
        throw new BadRequestException(`Invalid ID token: issuer mismatch. Expected accounts.google.com, got ${payload.iss}`);
      }

      return {
        iss: payload.iss,
        sub: payload.sub,
        aud: aud,
        exp: payload.exp || 0,
        iat: payload.iat || 0,
        email: payload.email,
        email_verified: payload.email_verified,
        name: payload.name,
        picture: payload.picture,
        given_name: payload.given_name,
        family_name: payload.family_name,
      };
    } catch (error: any) {
      this.logger.error(`Failed to verify ID token: ${error.message}`, error.stack);
      
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      throw new BadRequestException(`Failed to verify ID token: ${error.message}`);
    }
  }

  /**
   * Get OAuth2Client instance (for redirect URL generation if needed)
   */
  getOAuth2Client(): OAuth2Client {
    return this.oauth2Client;
  }

  /**
   * Generate authorization URL (for redirect flow if needed)
   */
  getAuthUrl(): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['openid', 'email', 'profile'],
      prompt: 'consent', // Force consent to get refresh token
    });
  }
}

