// src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthController } from './auth.controller';
import { GoogleOAuthService } from './services/google-oauth.service';
import { TokenService } from './services/token.service';
import { AuthUserService } from './services/user.service';
import { EmailVerificationService } from './services/email-verification.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  imports: [
    PrismaModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        console.log('🔑 [AuthModule] JwtModule.registerAsync useFactory called');
        const expiresIn = configService.get<string>('JWT_ACCESS_TOKEN_EXPIRES_IN') || '48h';
        const secret = configService.get<string>('JWT_SECRET') || 'your-secret-key-change-in-production';
        console.log('🔑 [AuthModule] JwtModule config created');
        return {
          secret: secret,
          signOptions: {
            expiresIn: expiresIn as any, // JWT accepts string like '15m', '1h', etc.
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    GoogleOAuthService,
    TokenService,
    AuthUserService,
    EmailVerificationService,
    JwtStrategy,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
  exports: [GoogleOAuthService, TokenService, AuthUserService, EmailVerificationService, JwtModule],
})
export class AuthModule {}

