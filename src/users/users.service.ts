// src/users/users.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService, UploadResult } from '../upload/upload.service';
import { UpdateUserProfileDto, GetUserProfileResponseDto } from './dto/user-profile.dto';
import { GetUsersQueryDto, UserListResponseDto, UserResponseDto, UpdateUserDto } from './dto/admin-user.dto';
import { CurrentUserResponseDto, UpdateCurrentUserDto, DeleteAccountResponseDto } from './dto/current-user.dto';
import { UserStatsResponseDto, UserDetailResponseDto } from './dto/user-stats.dto';
import {
  projectMobileDetail,
  projectMobileExtras,
} from './utils/admin-user-enrichment.util';
import { buildSummary } from '../mobile/services/mobile-driver-profile.service';
import type { MobileDriverProfileResponseDto } from '../mobile/dto/mobile-driver-profile.dto';

interface MulterFile {
  buffer: Buffer;
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
}

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private uploadService: UploadService,
  ) {}

  // ==================== 当前用户接口 ====================

  /**
   * 获取当前用户信息
   */
  async getCurrentUser(userId: string): Promise<CurrentUserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`用户不存在: ${userId}`);
    }

    return {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      googleSub: user.googleSub,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * 更新当前用户信息
   */
  async updateCurrentUser(userId: string, dto: UpdateCurrentUserDto): Promise<CurrentUserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`用户不存在: ${userId}`);
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.displayName !== undefined && { displayName: dto.displayName }),
        ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
      },
    });

    return {
      id: updatedUser.id,
      email: updatedUser.email,
      emailVerified: updatedUser.emailVerified,
      displayName: updatedUser.displayName,
      avatarUrl: updatedUser.avatarUrl,
      googleSub: updatedUser.googleSub,
      createdAt: updatedUser.createdAt,
      updatedAt: updatedUser.updatedAt,
    };
  }

  /**
   * 上传并更新当前用户头像（OSS）
   */
  async uploadAvatar(
    userId: string,
    file: MulterFile,
  ): Promise<{ upload: UploadResult; user: CurrentUserResponseDto }> {
    if (!this.uploadService.isAvailable()) {
      throw new BadRequestException('图片上传服务未配置，请联系管理员');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`用户不存在: ${userId}`);
    }

    const upload = await this.uploadService.uploadImage(file, `avatars/${userId}`).catch((error: Error) => {
      throw new BadRequestException(error.message || '头像上传失败');
    });
    const previousAvatarUrl = user.avatarUrl;

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: upload.url },
    });

    await this.tryDeletePreviousAvatar(previousAvatarUrl, upload.key);

    return {
      upload,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        emailVerified: updatedUser.emailVerified,
        displayName: updatedUser.displayName,
        avatarUrl: updatedUser.avatarUrl,
        googleSub: updatedUser.googleSub,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
      },
    };
  }

  /** 若旧头像是本服务 OSS 上的 avatars/ 路径，上传成功后尝试删除旧文件 */
  private async tryDeletePreviousAvatar(previousUrl: string | null | undefined, newKey: string): Promise<void> {
    if (!previousUrl) return;
    const key = this.extractOssKeyFromAvatarUrl(previousUrl);
    if (!key || !key.startsWith('avatars/') || key === newKey) return;
    try {
      await this.uploadService.deleteImage(key);
    } catch {
      /* 旧图删除失败不影响主流程 */
    }
  }

  private extractOssKeyFromAvatarUrl(url: string): string | null {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname.replace(/^\/+/, '');
      return path || null;
    } catch {
      return null;
    }
  }

  /**
   * 删除当前用户账户
   */
  async deleteCurrentUser(userId: string, confirmText?: string): Promise<DeleteAccountResponseDto> {
    // 安全检查：要求用户确认删除
    if (confirmText !== '确认删除') {
      throw new BadRequestException('请输入"确认删除"以确认删除账户');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`用户不存在: ${userId}`);
    }

    // 使用事务删除用户及其关联数据
    await this.prisma.$transaction(async (tx) => {
      // 删除用户偏好
      await tx.userProfile.deleteMany({ where: { userId } });
      
      // 删除刷新令牌
      await tx.refreshToken.deleteMany({ where: { userId } });
      
      // 删除行程协作者记录
      await tx.tripCollaborator.deleteMany({ where: { userId } });
      
      // 删除行程收藏
      await tx.tripCollection.deleteMany({ where: { userId } });
      
      // 删除行程点赞
      await tx.tripLike.deleteMany({ where: { userId } });
      
      // 最后删除用户
      await tx.user.delete({ where: { id: userId } });
    });

    return {
      deleted: true,
      userId,
      deletedAt: new Date(),
    };
  }

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
   * 附带 iOS 个人中心摘要：identity / travelPortrait / driverSummary + 计数
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
          platformRole: true,
          createdAt: true,
          updatedAt: true,
          profile: { select: { preferences: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const userIds = users.map((u) => u.id);
    const [tripGroups, docGroups] = userIds.length
      ? await Promise.all([
          this.prisma.tripCollaborator.groupBy({
            by: ['userId'],
            where: { userId: { in: userIds } },
            _count: true,
          }),
          this.prisma.userCredentialDocument.groupBy({
            by: ['userId'],
            where: { userId: { in: userIds }, deletedAt: null },
            _count: true,
          }),
        ])
      : [[], []];

    const tripCountByUser = new Map(
      tripGroups.map((g) => [g.userId, g._count]),
    );
    const docCountByUser = new Map(
      docGroups.map((g) => [g.userId, g._count]),
    );

    const enriched: UserResponseDto[] = users.map((user) => {
      const extras = projectMobileExtras(user.profile?.preferences);
      return {
        id: user.id,
        googleSub: user.googleSub,
        email: user.email,
        emailVerified: user.emailVerified,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        platformRole: user.platformRole,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        identity: extras.identity,
        travelPortrait: extras.travelPortrait,
        driverSummary: extras.driverSummary,
        hasIdentity: extras.hasIdentity,
        hasTravelPortrait: extras.hasTravelPortrait,
        hasDriverProfile: extras.hasDriverProfile,
        tripCount: tripCountByUser.get(user.id) ?? 0,
        documentCount: docCountByUser.get(user.id) ?? 0,
        emergencyContactCount: extras.emergencyContactCount,
      };
    });

    return {
      users: enriched,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 获取用户详情（管理接口）— 含 iOS 个人中心摘要
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
        platformRole: true,
        createdAt: true,
        updatedAt: true,
        profile: { select: { preferences: true } },
      },
    });

    if (!user) {
      throw new NotFoundException(`User not found: ${userId}`);
    }

    const extras = projectMobileExtras(user.profile?.preferences);
    const [tripCount, documentCount] = await Promise.all([
      this.prisma.tripCollaborator.count({ where: { userId } }),
      this.prisma.userCredentialDocument.count({
        where: { userId, deletedAt: null },
      }),
    ]);

    return {
      id: user.id,
      googleSub: user.googleSub,
      email: user.email,
      emailVerified: user.emailVerified,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      platformRole: user.platformRole,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      identity: extras.identity,
      travelPortrait: extras.travelPortrait,
      driverSummary: extras.driverSummary,
      hasIdentity: extras.hasIdentity,
      hasTravelPortrait: extras.hasTravelPortrait,
      hasDriverProfile: extras.hasDriverProfile,
      tripCount,
      documentCount,
      emergencyContactCount: extras.emergencyContactCount,
    };
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

  /**
   * 删除用户（管理接口）
   */
  async deleteUser(userId: string): Promise<DeleteAccountResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`用户不存在: ${userId}`);
    }

    // 使用事务删除用户及其关联数据
    await this.prisma.$transaction(async (tx) => {
      // 删除用户偏好
      await tx.userProfile.deleteMany({ where: { userId } });
      
      // 删除刷新令牌
      await tx.refreshToken.deleteMany({ where: { userId } });
      
      // 删除行程协作者记录
      await tx.tripCollaborator.deleteMany({ where: { userId } });
      
      // 删除行程收藏
      await tx.tripCollection.deleteMany({ where: { userId } });
      
      // 删除行程点赞
      await tx.tripLike.deleteMany({ where: { userId } });
      
      // 最后删除用户
      await tx.user.delete({ where: { id: userId } });
    });

    return {
      deleted: true,
      userId,
      deletedAt: new Date(),
    };
  }

  /**
   * 获取用户统计信息（管理接口）
   */
  async getUserStats(): Promise<UserStatsResponseDto> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalUsers,
      verifiedUsers,
      googleUsers,
      todayNewUsers,
      weekNewUsers,
      monthNewUsers,
      usersWithProfile,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { emailVerified: true } }),
      this.prisma.user.count({ where: { googleSub: { not: null } } }),
      this.prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.user.count({ where: { createdAt: { gte: weekStart } } }),
      this.prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
      this.prisma.userProfile.count(),
    ]);

    return {
      totalUsers,
      verifiedUsers,
      unverifiedUsers: totalUsers - verifiedUsers,
      googleUsers,
      todayNewUsers,
      weekNewUsers,
      monthNewUsers,
      usersWithProfile,
      generatedAt: new Date(),
    };
  }

  /**
   * 获取用户详情（包含关联数据 + iOS 个人中心完整块）（管理接口）
   */
  async getUserDetail(userId: string): Promise<UserDetailResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`用户不存在: ${userId}`);
    }

    const mobile = projectMobileDetail(user.profile?.preferences);
    const driverSummary = mobile.driverProfile
      ? buildSummary(
          mobile.driverProfile as unknown as Omit<
            MobileDriverProfileResponseDto,
            'updatedAt'
          >,
        )
      : null;

    const [tripCount, collectionCount, likeCount, documents] = await Promise.all([
      this.prisma.tripCollaborator.count({ where: { userId } }),
      this.prisma.tripCollection.count({ where: { userId } }),
      this.prisma.tripLike.count({ where: { userId } }),
      this.prisma.userCredentialDocument.findMany({
        where: { userId, deletedAt: null },
        select: {
          id: true,
          type: true,
          status: true,
          expiresOn: true,
          numberLast4: true,
          fileName: true,
          mimeType: true,
          fileSize: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      id: user.id,
      googleSub: user.googleSub,
      email: user.email,
      emailVerified: user.emailVerified,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      platformRole: user.platformRole,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      profile: user.profile
        ? {
            preferences: user.profile.preferences,
            createdAt: user.profile.createdAt,
            updatedAt: user.profile.updatedAt,
          }
        : null,
      identity: mobile.identity,
      travelPortrait: mobile.travelPortrait,
      driverProfile: mobile.driverProfile,
      driverSummary,
      emergencyContacts: mobile.emergencyContacts,
      documents,
      tripCount,
      collectionCount,
      likeCount,
      documentCount: documents.length,
      emergencyContactCount: mobile.emergencyContacts.length,
    };
  }
}
