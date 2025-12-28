// src/auth/services/token.service.ts
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { TripNaraAccessTokenPayload } from '../interfaces/google-token-payload.interface';

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly accessTokenExpiresIn: string;
  private readonly refreshTokenExpiresInDays: number;

  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.accessTokenExpiresIn = this.configService.get<string>('JWT_ACCESS_TOKEN_EXPIRES_IN') || '15m';
    this.refreshTokenExpiresInDays = parseInt(
      this.configService.get<string>('JWT_REFRESH_TOKEN_EXPIRES_IN_DAYS') || '30',
      10,
    );
  }

  /**
   * Issue access token (short-lived JWT)
   */
  async issueAccessToken(userId: string, email?: string): Promise<string> {
    const payload: TripNaraAccessTokenPayload = {
      sub: userId,
      email,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + this.getExpirationInSeconds(this.accessTokenExpiresIn),
    };

    return this.jwtService.signAsync(payload);
  }

  /**
   * Issue refresh token (long-lived, stored in DB)
   * Returns the plain token (to be sent to client) and stores the hash in DB
   */
  async issueRefreshToken(userId: string): Promise<{ token: string; expiresAt: Date }> {
    // Generate random token
    const token = this.generateRandomToken();
    const tokenHash = await bcrypt.hash(token, 10);
    
    // Calculate expiration
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.refreshTokenExpiresInDays);

    // Store in database
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });

    this.logger.debug(`Issued refresh token for user ${userId}, expires at ${expiresAt}`);

    return { token, expiresAt };
  }

  /**
   * Verify refresh token and return user ID
   * Also performs token rotation (invalidates old, issues new)
   */
  async verifyAndRotateRefreshToken(token: string): Promise<{ userId: string; newRefreshToken: string; expiresAt: Date }> {
    // Find all non-revoked refresh tokens for this user (we'll verify the hash)
    const tokens = await this.prisma.refreshToken.findMany({
      where: {
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        User: true,
      },
    });

    // Find matching token by comparing hashes
    let matchedToken = null;
    for (const dbToken of tokens) {
      const isValid = await bcrypt.compare(token, dbToken.tokenHash);
      if (isValid) {
        matchedToken = dbToken;
        break;
      }
    }

    if (!matchedToken) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Revoke old token
    await this.prisma.refreshToken.update({
      where: { id: matchedToken.id },
      data: { revokedAt: new Date() },
    });

    // Issue new refresh token (rotation)
    const { token: newToken, expiresAt } = await this.issueRefreshToken(matchedToken.userId);

    return {
      userId: matchedToken.userId,
      newRefreshToken: newToken,
      expiresAt,
    };
  }

  /**
   * Revoke a refresh token
   */
  async revokeRefreshToken(token: string): Promise<void> {
    const tokens = await this.prisma.refreshToken.findMany({
      where: {
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    for (const dbToken of tokens) {
      const isValid = await bcrypt.compare(token, dbToken.tokenHash);
      if (isValid) {
        await this.prisma.refreshToken.update({
          where: { id: dbToken.id },
          data: { revokedAt: new Date() },
        });
        return;
      }
    }

    // Token not found - silently succeed (idempotent)
    this.logger.warn('Attempted to revoke non-existent refresh token');
  }

  /**
   * Revoke all refresh tokens for a user
   */
  async revokeAllRefreshTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    this.logger.debug(`Revoked all refresh tokens for user ${userId}`);
  }

  /**
   * Clean up expired refresh tokens (can be called periodically)
   */
  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.prisma.refreshToken.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    this.logger.debug(`Cleaned up ${result.count} expired refresh tokens`);
    return result.count;
  }

  /**
   * Generate random token for refresh token
   */
  private generateRandomToken(): string {
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Parse expiration string (e.g., '15m', '1h', '30d') to seconds
   */
  private getExpirationInSeconds(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) {
      return 15 * 60; // Default 15 minutes
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 3600;
      case 'd':
        return value * 86400;
      default:
        return 15 * 60;
    }
  }
}

