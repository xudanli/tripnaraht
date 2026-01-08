// src/users/users.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserProfileDto, GetUserProfileResponseDto } from './dto/user-profile.dto';
import { GetUsersQueryDto, UserListResponseDto, UserResponseDto, UpdateUserDto } from './dto/admin-user.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  /**
   * 获取用户画像
   */
  async getProfile(userId: string): Promise<GetUserProfileResponseDto> {
    // Verify user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`User not found: ${userId}`);
    }

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
    // Verify user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`User not found: ${userId}`);
    }

    const profile = await this.prisma.userProfile.upsert({
      where: { userId },
      update: {
        preferences: dto.preferences as any,
        updatedAt: new Date(),
      },
      create: {
        userId,
        preferences: dto.preferences as any,
        updatedAt: new Date(),
      },
    });

    return {
      userId: profile.userId,
      preferences: profile.preferences as any,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }

  /**
   * 获取用户列表（管理接口）
   */
  async getUsers(query: GetUsersQueryDto): Promise<UserListResponseDto> {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.search) {
      where.OR = [
        { email: { contains: query.search, mode: 'insensitive' } },
        { displayName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.emailVerified !== undefined) {
      where.emailVerified = query.emailVerified;
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          googleSub: true,
          email: true,
          emailVerified: true,
          displayName: true,
          avatarUrl: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      users: users as UserResponseDto[],
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 获取用户详情（管理接口）
   */
  async getUserById(userId: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        googleSub: true,
        email: true,
        emailVerified: true,
        displayName: true,
        avatarUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`User not found: ${userId}`);
    }

    return user as UserResponseDto;
  }

  /**
   * 更新用户信息（管理接口）
   */
  async updateUser(userId: string, dto: UpdateUserDto): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`User not found: ${userId}`);
    }

    // 如果更新邮箱，检查是否已存在
    if (dto.email && dto.email !== user.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });

      if (existingUser) {
        throw new BadRequestException(`Email already exists: ${dto.email}`);
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.displayName !== undefined && { displayName: dto.displayName }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.emailVerified !== undefined && { emailVerified: dto.emailVerified }),
        ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
      },
      select: {
        id: true,
        googleSub: true,
        email: true,
        emailVerified: true,
        displayName: true,
        avatarUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updatedUser as UserResponseDto;
  }
}
