export interface GoogleIdTokenPayload {
    iss: string;
    sub: string;
    aud: string;
    exp: number;
    iat: number;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
    given_name?: string;
    family_name?: string;
}
export interface GoogleTokenResponse {
    access_token: string;
    expires_in: number;
    id_token: string;
    refresh_token?: string;
    scope: string;
    token_type: string;
}
export interface TripNaraAccessTokenPayload {
    sub: string;
    email?: string;
    iat: number;
    exp: number;
}
