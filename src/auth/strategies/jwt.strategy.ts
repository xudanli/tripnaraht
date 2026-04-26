// src/auth/strategies/jwt.strategy.ts
import { Injectable, UnauthorizedException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { TripNaraAccessTokenPayload } from '../interfaces/google-token-payload.interface';
import { resolvePlatformRoles } from '../platform-roles';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private configService?: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService?.get<string>('JWT_SECRET') || 'your-secret-key-change-in-production',
    });
  }

  async validate(payload: TripNaraAccessTokenPayload) {
    if (!payload.sub) {
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

    const roles = resolvePlatformRoles(this.configService, payload.sub, payload.roles, dbPlatformRole);

    return {
      userId: payload.sub,
      email: payload.email,
      roles,
    };
  }
}

