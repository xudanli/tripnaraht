// src/auth/services/google-oauth.service.ts
import { Injectable, Logger, BadRequestException, InternalServerErrorException, Optional } from '@nestjs/common';
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

  constructor(@Optional() private configService?: ConfigService) {
    this.clientId = this.configService?.get<string>('GOOGLE_CLIENT_ID') || '';
    this.clientSecret = this.configService?.get<string>('GOOGLE_CLIENT_SECRET') || '';
    this.redirectUri = this.configService?.get<string>('GOOGLE_REDIRECT_URI') || '';

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
   * 
   * @param code Authorization code from Google
   * @param redirectUri The redirect URI (should match the origin of the calling page for Popup mode)
   */
  async exchangeCodeForTokens(code: string, redirectUri?: string): Promise<GoogleTokenResponse> {
    // Validate configuration
    if (!this.clientId || !this.clientSecret) {
      this.logger.error('Google OAuth configuration is missing. GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required.');
      throw new BadRequestException('Google OAuth is not configured. Please contact administrator.');
    }
    
    // For Popup mode, redirectUri should be the origin of the calling page
    // If not provided, use the configured redirectUri
    const finalRedirectUri: string = redirectUri ?? this.redirectUri;
    
    // Create a temporary OAuth2Client with the redirectUri for this request
    // This is necessary because redirectUri must match exactly what was used in the authorization request
    const oauth2Client = redirectUri && redirectUri !== this.redirectUri
      ? new OAuth2Client(this.clientId, this.clientSecret, redirectUri)
      : this.oauth2Client;

    this.logger.debug(`Exchanging code for tokens with redirect_uri: ${finalRedirectUri}`);

    try {
      const { tokens } = await oauth2Client.getToken(code);
      
      if (!tokens.id_token) {
        throw new BadRequestException('Google did not return an ID token');
      }

      return {
        access_token: tokens.access_token || '',
        expires_in: tokens.expiry_date ? Math.floor((tokens.expiry_date - Date.now()) / 1000) : 3600,
        id_token: tokens.id_token,
        refresh_token: tokens.refresh_token || undefined,
        scope: tokens.scope || '',
        token_type: 'Bearer',
      };
    } catch (error: any) {
      // Log detailed error for debugging (includes error_description from Google)
      const errorResponse = error?.response?.data;
      const errorMessage = error?.message || String(error);
      
      // Extract detailed error information
      let errorDetail = errorMessage;
      if (errorResponse) {
        if (typeof errorResponse === 'string') {
          errorDetail = errorResponse;
        } else if (errorResponse.error_description) {
          errorDetail = `${errorResponse.error}: ${errorResponse.error_description}`;
        } else if (errorResponse.error) {
          errorDetail = errorResponse.error;
        } else {
          errorDetail = JSON.stringify(errorResponse);
        }
      }
      
      this.logger.error(`Failed to exchange code for tokens: ${errorDetail}`);
      this.logger.error(`Request details: redirect_uri=${finalRedirectUri}, client_id=${this.clientId}`);
      if (error?.stack) {
        this.logger.debug(error.stack);
      }
      
      // Ensure we always throw a BadRequestException (400), not an unhandled error (500)
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to exchange authorization code: ${errorDetail}`);
    }
  }

  /**
   * Verify and decode Google ID Token (for both Code Model and One Tap)
   * Validates signature, audience, issuer, and expiration
   */
  async verifyIdToken(idToken: string): Promise<GoogleIdTokenPayload> {
    // Validate configuration
    if (!this.clientId) {
      this.logger.error('Google OAuth configuration is missing. GOOGLE_CLIENT_ID is required.');
      throw new BadRequestException('Google OAuth is not configured. Please contact administrator.');
    }
    
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
      const errorMessage = error?.message || error?.toString() || 'Unknown error';
      this.logger.error(`Failed to verify ID token: ${errorMessage}`, error?.stack);
      
      // Re-throw BadRequestException as-is
      if (error instanceof BadRequestException) {
        throw error;
      }
      
      // Ensure we always throw a BadRequestException (400), not an unhandled error (500)
      throw new BadRequestException(`Failed to verify ID token: ${errorMessage}`);
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

