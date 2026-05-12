import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { timingSafeEqual } from 'node:crypto';
import { resolvePlatformRoles, hasAdminPlatformAccess } from '../../auth/platform-roles';
import type { TripNaraAccessTokenPayload } from '../../auth/interfaces/google-token-payload.interface';
import { PrismaService } from '../../prisma/prisma.service';

function extractBearer(req: { headers?: Record<string, string | string[] | undefined> }): string | undefined {
  const raw = req.headers?.authorization;
  const line = Array.isArray(raw) ? raw[0] : raw;
  if (!line || typeof line !== 'string') {
    return undefined;
  }
  const m = line.match(/^Bearer\s+(.+)$/i);
  const token = m?.[1]?.trim();
  return token || undefined;
}

function headerAdminGodKey(req: { headers?: Record<string, string | string[] | undefined> }): string | undefined {
  const raw = req.headers?.['x-admin-god-key'];
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === 'string' && v.trim() ? v : undefined;
}

/** Bearer / X-Access-Token / 整段放在 Authorization 的裸 JWT（常见前端误配） */
function extractAccessToken(req: {
  headers?: Record<string, string | string[] | undefined>;
}): string | undefined {
  const bearer = extractBearer(req);
  if (bearer) {
    let t = bearer.trim();
    if (
      (t.startsWith('"') && t.endsWith('"')) ||
      (t.startsWith("'") && t.endsWith("'"))
    ) {
      t = t.slice(1, -1);
    }
    return t;
  }
  const xa =
    req.headers?.['x-access-token'] ??
    req.headers?.['x-auth-access-token'];
  const xv = Array.isArray(xa) ? xa[0] : xa;
  if (typeof xv === 'string' && xv.trim()) {
    const t = xv.trim();
    if (
      (t.startsWith('"') && t.endsWith('"')) ||
      (t.startsWith("'") && t.endsWith("'"))
    ) {
      return t.slice(1, -1);
    }
    return t;
  }
  const raw = req.headers?.authorization;
  const line = Array.isArray(raw) ? raw[0] : raw;
  if (line && typeof line === 'string') {
    const s = line.trim();
    if (/^eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/.test(s)) {
      return s;
    }
  }
  return undefined;
}

/**
 * For `/admin/**` agent-ops routes marked `@Public()`:
 * Accepts either a normal user JWT (with ADMIN/OPERATOR roles from claims or env allow-lists)
 * or `Authorization: Bearer <ADMIN_GOD_API_KEY>` when `ADMIN_GOD_API_KEY` is configured.
 */
@Injectable()
export class AdminStrictAuthGuard implements CanActivate {
  private readonly logger = new Logger(AdminStrictAuthGuard.name);

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

    const token = extractAccessToken(req);
    if (!token) {
      throw new UnauthorizedException(
        'Missing access token (Authorization: Bearer <jwt>, X-Access-Token, or raw JWT in Authorization)',
      );
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
      // 必须使用 JwtModule 注册时的 secret（与 TokenService 签发一致）。
      payload = this.jwtService.verify<TripNaraAccessTokenPayload>(token);
    } catch (e: unknown) {
      if (process.env.NODE_ENV !== 'production' && e instanceof Error) {
        this.logger.warn(`JWT verify failed: ${e.name}: ${e.message}`);
      }
      if (e instanceof TokenExpiredError) {
        throw new UnauthorizedException('Access token expired');
      }
      if (e instanceof JsonWebTokenError) {
        throw new UnauthorizedException(
          'Invalid access token (use TripNARA accessToken from login response, not Google id_token / refresh_token)',
        );
      }
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
