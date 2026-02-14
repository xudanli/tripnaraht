"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthModule = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const passport_1 = require("@nestjs/passport");
const config_1 = require("@nestjs/config");
const prisma_module_1 = require("../prisma/prisma.module");
const auth_controller_1 = require("./auth.controller");
const google_oauth_service_1 = require("./services/google-oauth.service");
const token_service_1 = require("./services/token.service");
const user_service_1 = require("./services/user.service");
const email_verification_service_1 = require("./services/email-verification.service");
const jwt_strategy_1 = require("./strategies/jwt.strategy");
const core_1 = require("@nestjs/core");
const jwt_auth_guard_1 = require("./guards/jwt-auth.guard");
let AuthModule = class AuthModule {
};
exports.AuthModule = AuthModule;
exports.AuthModule = AuthModule = __decorate([
    (0, common_1.Module)({
        imports: [
            prisma_module_1.PrismaModule,
            passport_1.PassportModule.register({ defaultStrategy: 'jwt' }),
            jwt_1.JwtModule.registerAsync({
                imports: [config_1.ConfigModule],
                useFactory: (configService) => {
                    console.log('🔑 [AuthModule] JwtModule.registerAsync useFactory called');
                    const expiresIn = configService.get('JWT_ACCESS_TOKEN_EXPIRES_IN') || '48h';
                    const secret = configService.get('JWT_SECRET') || 'your-secret-key-change-in-production';
                    console.log('🔑 [AuthModule] JwtModule config created');
                    return {
                        secret: secret,
                        signOptions: {
                            expiresIn: expiresIn,
                        },
                    };
                },
                inject: [config_1.ConfigService],
            }),
        ],
        controllers: [auth_controller_1.AuthController],
        providers: [
            google_oauth_service_1.GoogleOAuthService,
            token_service_1.TokenService,
            user_service_1.AuthUserService,
            email_verification_service_1.EmailVerificationService,
            jwt_strategy_1.JwtStrategy,
            {
                provide: core_1.APP_GUARD,
                useClass: jwt_auth_guard_1.JwtAuthGuard,
            },
        ],
        exports: [google_oauth_service_1.GoogleOAuthService, token_service_1.TokenService, user_service_1.AuthUserService, email_verification_service_1.EmailVerificationService, jwt_1.JwtModule],
    })
], AuthModule);
//# sourceMappingURL=auth.module.js.map