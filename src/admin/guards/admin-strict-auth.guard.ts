import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { timingSafeEqual } from 'node:crypto';
import { resolvePlatformRoles, hasAdminPlatformAccess } from '../../auth/platform-roles';
import type { TripNaraAccessTokenPayload } from '../../auth/interfaces/google-token-payload.interface';
import { PrismaService } from '../../prisma/prisma.service';

function extractBearer(req: { headers?: Record<string, string | string[] | undefined> }): string | undefined {
  const raw = req.headers?.authorization;
  const line = Array.isArray(raw) ? raw[0] : raw;
  const [type, token] = (line ?? '').split(' ') ?? [];
  return type === 'Bearer' && token ? token : undefined;
}

function headerAdminGodKey(req: { headers?: Record<string, string | string[] | undefined> }): string | undefined {
  const raw = req.headers?.['x-admin-god-key'];
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === 'string' && v.trim() ? v : undefined;
}

/**
 * For `/admin/**` agent-ops routes marked `@Public()`:
 * Accepts either a normal user JWT (with ADMIN/OPERATOR roles from claims or env allow-lists)
 * or `Authorization: Bearer <ADMIN_GOD_API_KEY>` when `ADMIN_GOD_API_KEY` is configured.
 */
@Injectable()
export class AdminStrictAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    @Optional() private readonly config?: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const god = this.config?.get<string>('ADMIN_GOD_API_KEY')?.trim();
    if (god) {
      const headerKey = headerAdminGodKey(req);
      if (headerKey) {
        try {
          const a = Buffer.from(headerKey);
          const b = Buffer.from(god);
          if (a.length === b.length && timingSafeEqual(a, b)) {
            req.user = { userId: 'admin-god-api-key', email: undefined, roles: ['ADMIN'] };
            return true;
          }
        } catch {
          // fall through
        }
      }
    }

    const token = extractBearer(req);
    if (!token) {
      throw new UnauthorizedException('Missing Bearer token or x-admin-god-key');
    }

    if (god) {
      try {
        const a = Buffer.from(token);
        const b = Buffer.from(god);
        if (a.length === b.length && timingSafeEqual(a, b)) {
          req.user = { userId: 'admin-god-api-key', email: undefined, roles: ['ADMIN'] };
          return true;
        }
      } catch {
        // fall through to JWT
      }
    }

    let payload: TripNaraAccessTokenPayload;
    try {
      const secret = this.config?.get<string>('JWT_SECRET') || 'your-secret-key-change-in-production';
      payload = this.jwtService.verify<TripNaraAccessTokenPayload>(token, { secret });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    if (!payload?.sub) {
      throw new UnauthorizedException('Invalid token: missing user ID');
    }
    let dbPlatformRole: string | null = null;
    try {
      if (this.prisma.isDbConnected()) {
        const u = await this.prisma.user.findUnique({
          where: { id: payload.sub },
          select: { platformRole: true },
        });
        dbPlatformRole = u?.platformRole ?? null;
      }
    } catch {
      dbPlatformRole = null;
    }
    const roles = resolvePlatformRoles(this.config, payload.sub, payload.roles, dbPlatformRole);
    if (!hasAdminPlatformAccess(roles)) {
      throw new ForbiddenException('Admin or operator role required');
    }
    req.user = { userId: payload.sub, email: payload.email, roles };
    return true;
  }
}
