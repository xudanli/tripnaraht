"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var GoogleOAuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleOAuthService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const google_auth_library_1 = require("google-auth-library");
let GoogleOAuthService = GoogleOAuthService_1 = class GoogleOAuthService {
    constructor(configService) {
        var _a, _b, _c;
        this.configService = configService;
        this.logger = new common_1.Logger(GoogleOAuthService_1.name);
        this.clientId = ((_a = this.configService) === null || _a === void 0 ? void 0 : _a.get('GOOGLE_CLIENT_ID')) || '';
        this.clientSecret = ((_b = this.configService) === null || _b === void 0 ? void 0 : _b.get('GOOGLE_CLIENT_SECRET')) || '';
        this.redirectUri = ((_c = this.configService) === null || _c === void 0 ? void 0 : _c.get('GOOGLE_REDIRECT_URI')) || '';
        if (!this.clientId) {
            this.logger.warn('GOOGLE_CLIENT_ID is not set. Google OAuth will not work.');
        }
        this.oauth2Client = new google_auth_library_1.OAuth2Client(this.clientId, this.clientSecret, this.redirectUri);
    }
    async exchangeCodeForTokens(code, redirectUri) {
        var _a;
        if (!this.clientId || !this.clientSecret) {
            this.logger.error('Google OAuth configuration is missing. GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required.');
            throw new common_1.BadRequestException('Google OAuth is not configured. Please contact administrator.');
        }
        const finalRedirectUri = redirectUri !== null && redirectUri !== void 0 ? redirectUri : this.redirectUri;
        const oauth2Client = redirectUri && redirectUri !== this.redirectUri
            ? new google_auth_library_1.OAuth2Client(this.clientId, this.clientSecret, redirectUri)
            : this.oauth2Client;
        this.logger.debug(`Exchanging code for tokens with redirect_uri: ${finalRedirectUri}`);
        try {
            const { tokens } = await oauth2Client.getToken(code);
            if (!tokens.id_token) {
                throw new common_1.BadRequestException('Google did not return an ID token');
            }
            return {
                access_token: tokens.access_token || '',
                expires_in: tokens.expiry_date ? Math.floor((tokens.expiry_date - Date.now()) / 1000) : 3600,
                id_token: tokens.id_token,
                refresh_token: tokens.refresh_token || undefined,
                scope: tokens.scope || '',
                token_type: 'Bearer',
            };
        }
        catch (error) {
            const errorResponse = (_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.data;
            const errorMessage = (error === null || error === void 0 ? void 0 : error.message) || String(error);
            let errorDetail = errorMessage;
            if (errorResponse) {
                if (typeof errorResponse === 'string') {
                    errorDetail = errorResponse;
                }
                else if (errorResponse.error_description) {
                    errorDetail = `${errorResponse.error}: ${errorResponse.error_description}`;
                }
                else if (errorResponse.error) {
                    errorDetail = errorResponse.error;
                }
                else {
                    errorDetail = JSON.stringify(errorResponse);
                }
            }
            this.logger.error(`Failed to exchange code for tokens: ${errorDetail}`);
            this.logger.error(`Request details: redirect_uri=${finalRedirectUri}, client_id=${this.clientId}`);
            if (error === null || error === void 0 ? void 0 : error.stack) {
                this.logger.debug(error.stack);
            }
            if (error instanceof common_1.BadRequestException) {
                throw error;
            }
            throw new common_1.BadRequestException(`Failed to exchange authorization code: ${errorDetail}`);
        }
    }
    async verifyIdToken(idToken) {
        if (!this.clientId) {
            this.logger.error('Google OAuth configuration is missing. GOOGLE_CLIENT_ID is required.');
            throw new common_1.BadRequestException('Google OAuth is not configured. Please contact administrator.');
        }
        try {
            const ticket = await this.oauth2Client.verifyIdToken({
                idToken,
                audience: this.clientId,
            });
            const payload = ticket.getPayload();
            if (!payload) {
                throw new common_1.BadRequestException('Invalid ID token: no payload');
            }
            if (!payload.sub) {
                throw new common_1.BadRequestException('Invalid ID token: missing sub claim');
            }
            const aud = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;
            if (aud !== this.clientId) {
                throw new common_1.BadRequestException(`Invalid ID token: audience mismatch. Expected ${this.clientId}, got ${aud}`);
            }
            if (payload.iss !== 'accounts.google.com' && payload.iss !== 'https://accounts.google.com') {
                throw new common_1.BadRequestException(`Invalid ID token: issuer mismatch. Expected accounts.google.com, got ${payload.iss}`);
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
        }
        catch (error) {
            const errorMessage = (error === null || error === void 0 ? void 0 : error.message) || (error === null || error === void 0 ? void 0 : error.toString()) || 'Unknown error';
            this.logger.error(`Failed to verify ID token: ${errorMessage}`, error === null || error === void 0 ? void 0 : error.stack);
            if (error instanceof common_1.BadRequestException) {
                throw error;
            }
            throw new common_1.BadRequestException(`Failed to verify ID token: ${errorMessage}`);
        }
    }
    getOAuth2Client() {
        return this.oauth2Client;
    }
    getAuthUrl() {
        return this.oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: ['openid', 'email', 'profile'],
            prompt: 'consent',
        });
    }
};
exports.GoogleOAuthService = GoogleOAuthService;
exports.GoogleOAuthService = GoogleOAuthService = GoogleOAuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [config_1.ConfigService])
], GoogleOAuthService);
//# sourceMappingURL=google-oauth.service.js.map