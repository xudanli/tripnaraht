// src/auth/auth.controller.ts
import {
  Controller,
  Post,
  Body,
  Res,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiCookieAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { GoogleOAuthService } from './services/google-oauth.service';
import { TokenService } from './services/token.service';
import { AuthUserService } from './services/user.service';
import { EmailVerificationService } from './services/email-verification.service';
import { GoogleCodeDto, GoogleIdTokenDto, AuthResponseDto, SendVerificationCodeDto, RegisterWithEmailDto } from './dto/google-auth.dto';
import { Public } from './decorators/public.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private googleOAuthService: GoogleOAuthService,
    private tokenService: TokenService,
    private authUserService: AuthUserService,
    private emailVerificationService: EmailVerificationService,
    private configService: ConfigService,
  ) {}

  /**
   * POST /auth/google/code
   * Primary approach: Exchange authorization code for tokens
   */
  @Public()
  @Post('google/code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Google OAuth - Exchange authorization code',
    description: 'Exchange Google OAuth authorization code for TripNARA session tokens. This is the primary authentication method using the Code Model.',
  })
  @ApiBody({ type: GoogleCodeDto })
  @ApiResponse({
    status: 200,
    description: 'Successfully authenticated',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid authorization code',
  })
  async googleCode(
    @Body() dto: GoogleCodeDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    try {
      // 1. Get origin from request header (for Popup mode, this is the redirect_uri)
      const origin = Array.isArray(req.headers.origin) 
        ? req.headers.origin[0] 
        : req.headers.origin || undefined;
      
      // 2. Validate origin against whitelist
      const allowedOrigins = new Set([
        'http://localhost:5173',
        'http://localhost:3001',
        'https://tripnara.com',
        'https://www.tripnara.com',
        // 开发环境额外支持
        ...(process.env.NODE_ENV !== 'production' 
          ? ['http://localhost:5174', 'http://127.0.0.1:5173', 'http://127.0.0.1:3001']
          : []
        ),
      ]);

      if (!origin || !allowedOrigins.has(origin)) {
        throw new BadRequestException(
          `Invalid origin for redirect_uri: ${origin}. Allowed origins: ${Array.from(allowedOrigins).join(', ')}`
        );
      }

      // 3. Exchange code for tokens (using origin as redirect_uri for Popup mode)
      const tokenResponse = await this.googleOAuthService.exchangeCodeForTokens(dto.code, origin);

      // 2. Verify and decode ID token
      const idTokenPayload = await this.googleOAuthService.verifyIdToken(tokenResponse.id_token);

      // 3. Upsert user
      const { user, isNewUser } = await this.authUserService.upsertUserFromGoogle(idTokenPayload);

      // 4. Issue TripNARA tokens
      const accessToken = await this.tokenService.issueAccessToken(user.id, user.email || undefined);
      const { token: refreshToken, expiresAt } = await this.tokenService.issueRefreshToken(user.id);

      // 5. Set refresh token as httpOnly cookie
      const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
      res.cookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure: isProduction, // Only send over HTTPS in production
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
    } catch (error: any) {
      if (error instanceof BadRequestException || error instanceof UnauthorizedException) {
        throw error;
      }
      throw new BadRequestException(`Authentication failed: ${error.message}`);
    }
  }

  /**
   * POST /auth/google/id-token
   * Secondary approach: Direct ID token validation (One Tap / Button)
   */
  @Public()
  @Post('google/id-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Google OAuth - Validate ID token',
    description: 'Validate Google ID token (from One Tap or Sign-In Button) and create TripNARA session. This is the accelerated login method.',
  })
  @ApiBody({ type: GoogleIdTokenDto })
  @ApiResponse({
    status: 200,
    description: 'Successfully authenticated',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid ID token',
  })
  async googleIdToken(
    @Body() dto: GoogleIdTokenDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    try {
      // 1. Verify and decode ID token
      const idTokenPayload = await this.googleOAuthService.verifyIdToken(dto.idToken);

      // 2. Upsert user
      const { user } = await this.authUserService.upsertUserFromGoogle(idTokenPayload);

      // 3. Issue TripNARA tokens
      const accessToken = await this.tokenService.issueAccessToken(user.id, user.email || undefined);
      const { token: refreshToken, expiresAt } = await this.tokenService.issueRefreshToken(user.id);

      // 4. Set refresh token as httpOnly cookie
      const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
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
    } catch (error: any) {
      if (error instanceof BadRequestException || error instanceof UnauthorizedException) {
        throw error;
      }
      throw new BadRequestException(`Authentication failed: ${error.message}`);
    }
  }

  /**
   * POST /auth/refresh
   * Refresh access token using refresh token
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token',
    description: 'Refresh access token using refresh token from cookie. Implements token rotation for security.',
  })
  @ApiCookieAuth('refresh_token')
  @ApiResponse({
    status: 200,
    description: 'Successfully refreshed access token',
    schema: {
      type: 'object',
      properties: {
        accessToken: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired refresh token',
  })
  async refresh(
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string }> {
    const refreshToken = res.req.cookies?.refresh_token;

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not found');
    }

    try {
      // Verify and rotate refresh token
      const { userId, newRefreshToken, expiresAt } = await this.tokenService.verifyAndRotateRefreshToken(refreshToken);

      // Get user to get email for access token
      const user = await this.authUserService.findUserById(userId);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Issue new access token
      const accessToken = await this.tokenService.issueAccessToken(userId, user.email || undefined);

      // Set new refresh token cookie
      const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
      res.cookie('refresh_token', newRefreshToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        maxAge: (expiresAt.getTime() - Date.now()) / 1000,
        path: '/',
      });

      return { accessToken };
    } catch (error: any) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException(`Token refresh failed: ${error.message}`);
    }
  }

  /**
   * POST /auth/logout
   * Logout and revoke refresh token
   */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Logout',
    description: 'Logout user and revoke refresh token.',
  })
  @ApiCookieAuth('refresh_token')
  @ApiResponse({
    status: 200,
    description: 'Successfully logged out',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
  })
  async logout(@Res({ passthrough: true }) res: Response): Promise<{ message: string }> {
    const refreshToken = res.req.cookies?.refresh_token;

    if (refreshToken) {
      await this.tokenService.revokeRefreshToken(refreshToken);
    }

    // Clear refresh token cookie
    res.clearCookie('refresh_token', {
      httpOnly: true,
      secure: this.configService.get<string>('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: '/',
    });

    return { message: 'Logged out successfully' };
  }

  /**
   * POST /auth/email/send-code
   * Send verification code to email
   */
  @Public()
  @Post('email/send-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send email verification code',
    description: 'Send a verification code to the specified email address for registration.',
  })
  @ApiBody({ type: SendVerificationCodeDto })
  @ApiResponse({
    status: 200,
    description: 'Verification code sent successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid email or too frequent requests',
  })
  async sendVerificationCode(@Body() dto: SendVerificationCodeDto): Promise<{ message: string }> {
    try {
      await this.emailVerificationService.sendVerificationCode(dto.email);
      return { message: '验证码已发送，请查收邮件' };
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`发送验证码失败: ${error.message}`);
    }
  }

  /**
   * POST /auth/email/register
   * Register with email and verification code
   */
  @Public()
  @Post('email/register')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Register with email verification code',
    description: 'Register a new user with email and verification code. Returns session tokens upon successful registration.',
  })
  @ApiBody({ type: RegisterWithEmailDto })
  @ApiResponse({
    status: 200,
    description: 'Successfully registered',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid verification code or email already registered',
  })
  async registerWithEmail(
    @Body() dto: RegisterWithEmailDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    try {
      // 1. Verify code
      const isValid = await this.emailVerificationService.verifyCode(dto.email, dto.code);
      if (!isValid) {
        throw new BadRequestException('验证码无效或已过期');
      }

      // 2. Check if user already exists
      const existingUser = await this.authUserService.findUserByEmail(dto.email);
      if (existingUser) {
        throw new BadRequestException('该邮箱已被注册');
      }

      // 3. Create user
      const { user } = await this.authUserService.createUserWithEmail(dto.email, dto.displayName);

      // 4. Issue TripNARA tokens
      const accessToken = await this.tokenService.issueAccessToken(user.id, user.email || undefined);
      const { token: refreshToken, expiresAt } = await this.tokenService.issueRefreshToken(user.id);

      // 5. Set refresh token as httpOnly cookie
      const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
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
    } catch (error: any) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`注册失败: ${error.message}`);
    }
  }
}

