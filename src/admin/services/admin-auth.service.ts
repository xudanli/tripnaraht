import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenService } from '../../auth/services/token.service';
import { resolvePlatformRoles } from '../../auth/platform-roles';
import { ConfigService } from '@nestjs/config';
import type { AdminLoginDto } from '../dto/admin-auth.dto';

const STAFF_ROLES = new Set(['ADMIN', 'OPERATOR']);

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly config: ConfigService,
  ) {}

  async loginWithPassword(dto: AdminLoginDto) {
    const email = dto.email.trim();
    const plain = dto.password;
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });
    if (!user) {
      this.logger.warn(`[admin/auth/login] no user for email (case-insensitive match): ${email}`);
      throw new UnauthorizedException('Invalid email or password');
    }
    const role = String(user.platformRole ?? 'USER').toUpperCase();
    if (!STAFF_ROLES.has(role)) {
      this.logger.warn(
        `[admin/auth/login] user ${user.id} has platform_role=${user.platformRole}; need ADMIN or OPERATOR — run: npm run seed:admin`,
      );
      throw new UnauthorizedException('Invalid email or password');
    }
    if (!user.passwordHash?.trim()) {
      this.logger.warn(
        `[admin/auth/login] user ${user.id} has no password_hash — run: npm run seed:admin (same DATABASE_URL as this API)`,
      );
      throw new UnauthorizedException('Invalid email or password');
    }
    const match = await bcrypt.compare(plain, user.passwordHash);
    if (!match) {
      this.logger.warn(`[admin/auth/login] wrong password for user ${user.id}`);
      throw new UnauthorizedException('Invalid email or password');
    }
    const accessToken = await this.tokenService.issueAccessToken(user.id, user.email ?? undefined);
    const roles = resolvePlatformRoles(this.config, user.id, undefined, user.platformRole);
    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        platformRole: user.platformRole,
      },
      accessToken,
      roles,
    };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        emailVerified: true,
        platformRole: true,
      },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    const roles = resolvePlatformRoles(this.config, user.id, undefined, user.platformRole);
    return { user, roles };
  }
}
