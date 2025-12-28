// src/auth/services/user.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GoogleIdTokenPayload } from '../interfaces/google-token-payload.interface';

export interface UpsertUserResult {
  user: {
    id: string;
    googleSub: string | null;
    email: string | null;
    emailVerified: boolean | null;
    displayName: string | null;
    avatarUrl: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  isNewUser: boolean;
}

@Injectable()
export class AuthUserService {
  private readonly logger = new Logger(AuthUserService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Upsert user based on Google OAuth data
   * Priority: googleSub > email (for account merging)
   */
  async upsertUserFromGoogle(payload: GoogleIdTokenPayload): Promise<UpsertUserResult> {
    const { sub: googleSub, email, email_verified, name, picture } = payload;

    // Try to find existing user by googleSub first (most reliable)
    let existingUser = googleSub
      ? await this.prisma.user.findUnique({
          where: { googleSub },
        })
      : null;

    // If not found by googleSub, try by email (for account merging)
    if (!existingUser && email) {
      existingUser = await this.prisma.user.findUnique({
        where: { email },
      });

      // If found by email but googleSub is different/missing, bind googleSub
      if (existingUser && !existingUser.googleSub && googleSub) {
        this.logger.debug(`Binding googleSub ${googleSub} to existing user ${existingUser.id} (matched by email)`);
        existingUser = await this.prisma.user.update({
          where: { id: existingUser.id },
          data: { googleSub },
        });
      }
    }

    if (existingUser) {
      // Update existing user
      const updatedUser = await this.prisma.user.update({
        where: { id: existingUser.id },
        data: {
          email: email || existingUser.email,
          emailVerified: email_verified ?? existingUser.emailVerified,
          displayName: name || existingUser.displayName,
          avatarUrl: picture || existingUser.avatarUrl,
          googleSub: googleSub || existingUser.googleSub,
          updatedAt: new Date(),
        },
      });

      return {
        user: {
          id: updatedUser.id,
          googleSub: updatedUser.googleSub,
          email: updatedUser.email,
          emailVerified: updatedUser.emailVerified,
          displayName: updatedUser.displayName,
          avatarUrl: updatedUser.avatarUrl,
          createdAt: updatedUser.createdAt,
          updatedAt: updatedUser.updatedAt,
        },
        isNewUser: false,
      };
    }

    // Create new user
    const newUser = await this.prisma.user.create({
      data: {
        googleSub: googleSub || null,
        email: email || null,
        emailVerified: email_verified ?? false,
        displayName: name || null,
        avatarUrl: picture || null,
      },
    });

    // Create default UserProfile for new user
    await this.prisma.userProfile.upsert({
      where: { userId: newUser.id },
      update: {},
      create: {
        userId: newUser.id as any,
        preferences: null,
      },
    });

    this.logger.debug(`Created new user ${newUser.id} (googleSub: ${googleSub}, email: ${email})`);

    return {
      user: {
        id: newUser.id,
        googleSub: newUser.googleSub,
        email: newUser.email,
        emailVerified: newUser.emailVerified,
        displayName: newUser.displayName,
        avatarUrl: newUser.avatarUrl,
        createdAt: newUser.createdAt,
        updatedAt: newUser.updatedAt,
      },
      isNewUser: true,
    };
  }

  /**
   * Find user by ID
   */
  async findUserById(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
    });
  }
}

