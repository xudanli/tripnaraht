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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const config_1 = require("@nestjs/config");
const google_oauth_service_1 = require("./services/google-oauth.service");
const token_service_1 = require("./services/token.service");
const user_service_1 = require("./services/user.service");
const email_verification_service_1 = require("./services/email-verification.service");
const google_auth_dto_1 = require("./dto/google-auth.dto");
const public_decorator_1 = require("./decorators/public.decorator");
let AuthController = class AuthController {
    constructor(googleOAuthService, tokenService, authUserService, emailVerificationService, configService) {
        this.googleOAuthService = googleOAuthService;
        this.tokenService = tokenService;
        this.authUserService = authUserService;
        this.emailVerificationService = emailVerificationService;
        this.configService = configService;
    }
    async googleCode(dto, req, res) {
        try {
            const origin = Array.isArray(req.headers.origin)
                ? req.headers.origin[0]
                : req.headers.origin || undefined;
            const allowedOrigins = new Set([
                'http://localhost:5173',
                'http://localhost:3001',
                'https://tripnara.com',
                'https://www.tripnara.com',
                ...(process.env.NODE_ENV !== 'production'
                    ? ['http://localhost:5174', 'http://127.0.0.1:5173', 'http://127.0.0.1:3001']
                    : []),
            ]);
            if (!origin || !allowedOrigins.has(origin)) {
                throw new common_1.BadRequestException(`Invalid origin for redirect_uri: ${origin}. Allowed origins: ${Array.from(allowedOrigins).join(', ')}`);
            }
            const tokenResponse = await this.googleOAuthService.exchangeCodeForTokens(dto.code, origin);
            const idTokenPayload = await this.googleOAuthService.verifyIdToken(tokenResponse.id_token);
            const { user, isNewUser } = await this.authUserService.upsertUserFromGoogle(idTokenPayload);
            const accessToken = await this.tokenService.issueAccessToken(user.id, user.email || undefined);
            const { token: refreshToken, expiresAt } = await this.tokenService.issueRefreshToken(user.id);
            const isProduction = this.configService.get('NODE_ENV') === 'production';
            res.cookie('refresh_token', refreshToken, {
                httpOnly: true,
                secure: isProduction,
                sameSite: 'lax',
                maxAge: (expiresAt.getTime() - Date.now()) / 1000,
                path: '/',
            });
            return {
                user: {
                    id: user.id,
                    email: user.email,
                    displayName: user.displayName,
                    avatarUrl: user.avatarUrl,
                    emailVerified: user.emailVerified,
                },
                accessToken,
            };
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException || error instanceof common_1.UnauthorizedException) {
                throw error;
            }
            console.error('[AuthController] Google code authentication error:', error);
            const errorMessage = (error === null || error === void 0 ? void 0 : error.message) || (error === null || error === void 0 ? void 0 : error.toString()) || 'Unknown error occurred';
            throw new common_1.BadRequestException(`Authentication failed: ${errorMessage}`);
        }
    }
    async googleIdToken(dto, res) {
        try {
            const idTokenPayload = await this.googleOAuthService.verifyIdToken(dto.idToken);
            const { user } = await this.authUserService.upsertUserFromGoogle(idTokenPayload);
            const accessToken = await this.tokenService.issueAccessToken(user.id, user.email || undefined);
            const { token: refreshToken, expiresAt } = await this.tokenService.issueRefreshToken(user.id);
            const isProduction = this.configService.get('NODE_ENV') === 'production';
            res.cookie('refresh_token', refreshToken, {
                httpOnly: true,
                secure: isProduction,
                sameSite: 'lax',
                maxAge: (expiresAt.getTime() - Date.now()) / 1000,
                path: '/',
            });
            return {
                user: {
                    id: user.id,
                    email: user.email,
                    displayName: user.displayName,
                    avatarUrl: user.avatarUrl,
                    emailVerified: user.emailVerified,
                },
                accessToken,
            };
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException || error instanceof common_1.UnauthorizedException) {
                throw error;
            }
            console.error('[AuthController] Google ID token authentication error:', error);
            const errorMessage = (error === null || error === void 0 ? void 0 : error.message) || (error === null || error === void 0 ? void 0 : error.toString()) || 'Unknown error occurred';
            throw new common_1.BadRequestException(`Authentication failed: ${errorMessage}`);
        }
    }
    async refresh(res) {
        var _a;
        const refreshToken = (_a = res.req.cookies) === null || _a === void 0 ? void 0 : _a.refresh_token;
        if (!refreshToken) {
            throw new common_1.UnauthorizedException('Refresh token not found');
        }
        try {
            const { userId, newRefreshToken, expiresAt } = await this.tokenService.verifyAndRotateRefreshToken(refreshToken);
            const user = await this.authUserService.findUserById(userId);
            if (!user) {
                throw new common_1.UnauthorizedException('User not found');
            }
            const accessToken = await this.tokenService.issueAccessToken(userId, user.email || undefined);
            const isProduction = this.configService.get('NODE_ENV') === 'production';
            res.cookie('refresh_token', newRefreshToken, {
                httpOnly: true,
                secure: isProduction,
                sameSite: 'lax',
                maxAge: (expiresAt.getTime() - Date.now()) / 1000,
                path: '/',
            });
            return { accessToken };
        }
        catch (error) {
            if (error instanceof common_1.UnauthorizedException) {
                throw error;
            }
            throw new common_1.UnauthorizedException(`Token refresh failed: ${error.message}`);
        }
    }
    async logout(res) {
        var _a;
        const refreshToken = (_a = res.req.cookies) === null || _a === void 0 ? void 0 : _a.refresh_token;
        if (refreshToken) {
            await this.tokenService.revokeRefreshToken(refreshToken);
        }
        res.clearCookie('refresh_token', {
            httpOnly: true,
            secure: this.configService.get('NODE_ENV') === 'production',
            sameSite: 'lax',
            path: '/',
        });
        return { message: 'Logged out successfully' };
    }
    async sendVerificationCode(dto) {
        try {
            await this.emailVerificationService.sendVerificationCode(dto.email);
            return { message: '验证码已发送，请查收邮件' };
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException) {
                throw error;
            }
            console.error('[AuthController] Send verification code error:', error);
            const errorMessage = (error === null || error === void 0 ? void 0 : error.message) || (error === null || error === void 0 ? void 0 : error.toString()) || 'Unknown error occurred';
            throw new common_1.BadRequestException(`发送验证码失败: ${errorMessage}`);
        }
    }
    async registerWithEmail(dto, res) {
        try {
            const isValid = await this.emailVerificationService.verifyCode(dto.email, dto.code);
            if (!isValid) {
                throw new common_1.BadRequestException('验证码无效或已过期');
            }
            const existingUser = await this.authUserService.findUserByEmail(dto.email);
            if (existingUser) {
                throw new common_1.BadRequestException('该邮箱已被注册');
            }
            const { user } = await this.authUserService.createUserWithEmail(dto.email, dto.displayName);
            const accessToken = await this.tokenService.issueAccessToken(user.id, user.email || undefined);
            const { token: refreshToken, expiresAt } = await this.tokenService.issueRefreshToken(user.id);
            const isProduction = this.configService.get('NODE_ENV') === 'production';
            res.cookie('refresh_token', refreshToken, {
                httpOnly: true,
                secure: isProduction,
                sameSite: 'lax',
                maxAge: (expiresAt.getTime() - Date.now()) / 1000,
                path: '/',
            });
            return {
                user: {
                    id: user.id,
                    email: user.email,
                    displayName: user.displayName,
                    avatarUrl: user.avatarUrl,
                    emailVerified: user.emailVerified,
                },
                accessToken,
            };
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException) {
                throw error;
            }
            throw new common_1.BadRequestException(`注册失败: ${error.message}`);
        }
    }
    async loginWithEmail(dto, res) {
        try {
            const isValid = await this.emailVerificationService.verifyCode(dto.email, dto.code);
            if (!isValid) {
                throw new common_1.BadRequestException('验证码无效或已过期');
            }
            const existingUser = await this.authUserService.findUserByEmail(dto.email);
            if (!existingUser) {
                throw new common_1.BadRequestException('该邮箱未注册，请先注册');
            }
            const accessToken = await this.tokenService.issueAccessToken(existingUser.id, existingUser.email || undefined);
            const { token: refreshToken, expiresAt } = await this.tokenService.issueRefreshToken(existingUser.id);
            const isProduction = this.configService.get('NODE_ENV') === 'production';
            res.cookie('refresh_token', refreshToken, {
                httpOnly: true,
                secure: isProduction,
                sameSite: 'lax',
                maxAge: (expiresAt.getTime() - Date.now()) / 1000,
                path: '/',
            });
            return {
                user: {
                    id: existingUser.id,
                    email: existingUser.email,
                    displayName: existingUser.displayName,
                    avatarUrl: existingUser.avatarUrl,
                    emailVerified: existingUser.emailVerified,
                },
                accessToken,
            };
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException) {
                throw error;
            }
            throw new common_1.BadRequestException(`登录失败: ${error.message}`);
        }
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('google/code'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: 'Google OAuth - Exchange authorization code',
        description: 'Exchange Google OAuth authorization code for TripNARA session tokens. This is the primary authentication method using the Code Model.',
    }),
    (0, swagger_1.ApiBody)({ type: google_auth_dto_1.GoogleCodeDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Successfully authenticated',
        type: google_auth_dto_1.AuthResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: 'Invalid authorization code',
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [google_auth_dto_1.GoogleCodeDto, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "googleCode", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('google/id-token'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: 'Google OAuth - Validate ID token',
        description: 'Validate Google ID token (from One Tap or Sign-In Button) and create TripNARA session. This is the accelerated login method.',
    }),
    (0, swagger_1.ApiBody)({ type: google_auth_dto_1.GoogleIdTokenDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Successfully authenticated',
        type: google_auth_dto_1.AuthResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: 'Invalid ID token',
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [google_auth_dto_1.GoogleIdTokenDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "googleIdToken", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('refresh'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: 'Refresh access token',
        description: 'Refresh access token using refresh token from cookie. Implements token rotation for security.',
    }),
    (0, swagger_1.ApiCookieAuth)('refresh_token'),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Successfully refreshed access token',
        schema: {
            type: 'object',
            properties: {
                accessToken: { type: 'string' },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 401,
        description: 'Invalid or expired refresh token',
    }),
    __param(0, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "refresh", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('logout'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: 'Logout',
        description: 'Logout user and revoke refresh token.',
    }),
    (0, swagger_1.ApiCookieAuth)('refresh_token'),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Successfully logged out',
        schema: {
            type: 'object',
            properties: {
                message: { type: 'string' },
            },
        },
    }),
    __param(0, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('email/send-code'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: 'Send email verification code',
        description: 'Send a verification code to the specified email address for registration.',
    }),
    (0, swagger_1.ApiBody)({ type: google_auth_dto_1.SendVerificationCodeDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Verification code sent successfully',
        schema: {
            type: 'object',
            properties: {
                message: { type: 'string' },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: 'Invalid email or too frequent requests',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [google_auth_dto_1.SendVerificationCodeDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "sendVerificationCode", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('email/register'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: 'Register with email verification code',
        description: 'Register a new user with email and verification code. Returns session tokens upon successful registration.',
    }),
    (0, swagger_1.ApiBody)({ type: google_auth_dto_1.RegisterWithEmailDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Successfully registered',
        type: google_auth_dto_1.AuthResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: 'Invalid verification code or email already registered',
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [google_auth_dto_1.RegisterWithEmailDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "registerWithEmail", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('email/login'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: 'Login with email verification code',
        description: 'Login an existing user with email and verification code. Returns session tokens upon successful login.',
    }),
    (0, swagger_1.ApiBody)({ type: google_auth_dto_1.LoginWithEmailDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: 'Successfully logged in',
        type: google_auth_dto_1.AuthResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: 'Invalid verification code or email not registered',
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [google_auth_dto_1.LoginWithEmailDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "loginWithEmail", null);
exports.AuthController = AuthController = __decorate([
    (0, swagger_1.ApiTags)('auth'),
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [google_oauth_service_1.GoogleOAuthService,
        token_service_1.TokenService,
        user_service_1.AuthUserService,
        email_verification_service_1.EmailVerificationService,
        config_1.ConfigService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map