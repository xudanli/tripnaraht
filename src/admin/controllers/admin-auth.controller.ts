import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { Public } from '../../auth/decorators/public.decorator';
import { TokenService } from '../../auth/services/token.service';
import { AuthUserService } from '../../auth/services/user.service';
import { AdminAuthService } from '../services/admin-auth.service';
import { AdminStrictAuthGuard } from '../guards/admin-strict-auth.guard';
import { CurrentUser, type CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { AdminLoginDto, AdminAuthLoginResponseDto } from '../dto/admin-auth.dto';

@ApiTags('Admin — Auth')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(
    private readonly adminAuth: AdminAuthService,
    private readonly tokenService: TokenService,
    private readonly authUserService: AuthUserService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Staff login (email + password)',
    description:
      'Only for users with platform_role ADMIN or OPERATOR and a stored password_hash. Bootstrap accounts via `npm run seed:admin`.',
  })
  @ApiResponse({ status: 200, type: AdminAuthLoginResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() dto: AdminLoginDto, @Res({ passthrough: true }) res: Response): Promise<AdminAuthLoginResponseDto> {
    const out = await this.adminAuth.loginWithPassword(dto);
    const { token: refreshToken, expiresAt } = await this.tokenService.issueRefreshToken(out.user.id);
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: (expiresAt.getTime() - Date.now()) / 1000,
      path: '/',
    });
    return out;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('refresh_token')
  @ApiOperation({ summary: 'Rotate refresh cookie and issue new access token (same as /api/auth/refresh)' })
  async refresh(@Res({ passthrough: true }) res: Response): Promise<{ accessToken: string }> {
    const refreshToken = res.req.cookies?.refresh_token;
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not found');
    }
    try {
      const { userId, newRefreshToken, expiresAt } = await this.tokenService.verifyAndRotateRefreshToken(refreshToken);
      const user = await this.authUserService.findUserById(userId);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }
      const accessToken = await this.tokenService.issueAccessToken(userId, user.email || undefined);
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
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException(`Token refresh failed: ${error.message}`);
    }
  }

  @Public()
  @UseGuards(AdminStrictAuthGuard)
  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Current staff profile (requires admin JWT or god key)' })
  async me(@CurrentUser() u: CurrentUserPayload) {
    if (!u?.userId) {
      throw new UnauthorizedException('Not authenticated');
    }
    return this.adminAuth.getMe(u.userId);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth('refresh_token')
  @ApiOperation({ summary: 'Revoke refresh session' })
  async logout(@Res({ passthrough: true }) res: Response): Promise<{ message: string }> {
    const refreshToken = res.req.cookies?.refresh_token;
    if (refreshToken) {
      await this.tokenService.revokeRefreshToken(refreshToken);
    }
    res.clearCookie('refresh_token', {
      httpOnly: true,
      secure: this.configService.get<string>('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: '/',
    });
    return { message: 'Logged out successfully' };
  }
}
