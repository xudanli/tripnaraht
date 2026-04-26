// src/auth/interfaces/google-token-payload.interface.ts

/**
 * Google ID Token payload structure
 * Based on OpenID Connect specification
 */
export interface GoogleIdTokenPayload {
  iss: string; // Issuer (accounts.google.com or https://accounts.google.com)
  sub: string; // Subject (Google user unique ID)
  aud: string; // Audience (client ID)
  exp: number; // Expiration time (Unix timestamp)
  iat: number; // Issued at (Unix timestamp)
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
}

/**
 * Google token response from token endpoint
 */
export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  id_token: string;
  refresh_token?: string;
  scope: string;
  token_type: string;
}

/**
 * JWT payload for TripNARA access tokens
 */
export interface TripNaraAccessTokenPayload {
  sub: string; // User ID
  email?: string;
  /** Optional platform roles embedded at issuance (ADMIN / OPERATOR). */
  roles?: string[];
  iat: number;
  exp: number;
}

