// src/users/users.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserProfileDto, GetUserProfileResponseDto } from './dto/user-profile.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  /**
   * 获取用户画像
   */
  async getProfile(userId: string): Promise<GetUserProfileResponseDto> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      // 如果不存在，返回默认空画像
      return {
        userId,
        preferences: undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    return {
      userId: profile.userId,
      preferences: profile.preferences as any,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }

  /**
   * 更新用户画像
   */
  async updateProfile(
    userId: string,
    dto: UpdateUserProfileDto
  ): Promise<GetUserProfileResponseDto> {
    const profile = await this.prisma.userProfile.upsert({
      where: { userId },
      update: {
        preferences: dto.preferences as any,
        updatedAt: new Date(),
      },
      create: {
        userId,
        preferences: dto.preferences as any,
      },
    });

    return {
      userId: profile.userId,
      preferences: profile.preferences as any,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }
}
