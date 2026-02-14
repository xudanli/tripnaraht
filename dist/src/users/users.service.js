"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let UsersService = class UsersService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getCurrentUser(userId) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });
        if (!user) {
            throw new common_1.NotFoundException(`用户不存在: ${userId}`);
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
    async updateCurrentUser(userId, dto) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });
        if (!user) {
            throw new common_1.NotFoundException(`用户不存在: ${userId}`);
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
    async deleteCurrentUser(userId, confirmText) {
        if (confirmText !== '确认删除') {
            throw new common_1.BadRequestException('请输入"确认删除"以确认删除账户');
        }
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });
        if (!user) {
            throw new common_1.NotFoundException(`用户不存在: ${userId}`);
        }
        await this.prisma.$transaction(async (tx) => {
            await tx.userProfile.deleteMany({ where: { userId } });
            await tx.refreshToken.deleteMany({ where: { userId } });
            await tx.tripCollaborator.deleteMany({ where: { userId } });
            await tx.tripCollection.deleteMany({ where: { userId } });
            await tx.tripLike.deleteMany({ where: { userId } });
            await tx.user.delete({ where: { id: userId } });
        });
        return {
            deleted: true,
            userId,
            deletedAt: new Date(),
        };
    }
    async getProfile(userId) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });
        if (!user) {
            throw new common_1.NotFoundException(`User not found: ${userId}`);
        }
        const profile = await this.prisma.userProfile.findUnique({
            where: { userId },
        });
        if (!profile) {
            return {
                userId,
                preferences: undefined,
                createdAt: new Date(),
                updatedAt: new Date(),
            };
        }
        return {
            userId: profile.userId,
            preferences: profile.preferences,
            createdAt: profile.createdAt,
            updatedAt: profile.updatedAt,
        };
    }
    async updateProfile(userId, dto) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });
        if (!user) {
            throw new common_1.NotFoundException(`User not found: ${userId}`);
        }
        const profile = await this.prisma.userProfile.upsert({
            where: { userId },
            update: {
                preferences: dto.preferences,
                updatedAt: new Date(),
            },
            create: {
                userId,
                preferences: dto.preferences,
                updatedAt: new Date(),
            },
        });
        return {
            userId: profile.userId,
            preferences: profile.preferences,
            createdAt: profile.createdAt,
            updatedAt: profile.updatedAt,
        };
    }
    async getUsers(query) {
        const page = query.page || 1;
        const limit = query.limit || 20;
        const skip = (page - 1) * limit;
        const where = {};
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
            users: users,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        };
    }
    async getUserById(userId) {
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
            throw new common_1.NotFoundException(`User not found: ${userId}`);
        }
        return user;
    }
    async updateUser(userId, dto) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });
        if (!user) {
            throw new common_1.NotFoundException(`User not found: ${userId}`);
        }
        if (dto.email && dto.email !== user.email) {
            const existingUser = await this.prisma.user.findUnique({
                where: { email: dto.email },
            });
            if (existingUser) {
                throw new common_1.BadRequestException(`Email already exists: ${dto.email}`);
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
        return updatedUser;
    }
    async deleteUser(userId) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });
        if (!user) {
            throw new common_1.NotFoundException(`用户不存在: ${userId}`);
        }
        await this.prisma.$transaction(async (tx) => {
            await tx.userProfile.deleteMany({ where: { userId } });
            await tx.refreshToken.deleteMany({ where: { userId } });
            await tx.tripCollaborator.deleteMany({ where: { userId } });
            await tx.tripCollection.deleteMany({ where: { userId } });
            await tx.tripLike.deleteMany({ where: { userId } });
            await tx.user.delete({ where: { id: userId } });
        });
        return {
            deleted: true,
            userId,
            deletedAt: new Date(),
        };
    }
    async getUserStats() {
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekStart = new Date(now);
        weekStart.setDate(weekStart.getDate() - 7);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const [totalUsers, verifiedUsers, googleUsers, todayNewUsers, weekNewUsers, monthNewUsers, usersWithProfile,] = await Promise.all([
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
    async getUserDetail(userId) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                profile: true,
            },
        });
        if (!user) {
            throw new common_1.NotFoundException(`用户不存在: ${userId}`);
        }
        const [tripCount, collectionCount, likeCount] = await Promise.all([
            this.prisma.tripCollaborator.count({ where: { userId } }),
            this.prisma.tripCollection.count({ where: { userId } }),
            this.prisma.tripLike.count({ where: { userId } }),
        ]);
        return {
            id: user.id,
            googleSub: user.googleSub,
            email: user.email,
            emailVerified: user.emailVerified,
            displayName: user.displayName,
            avatarUrl: user.avatarUrl,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
            profile: user.profile ? {
                preferences: user.profile.preferences,
                createdAt: user.profile.createdAt,
                updatedAt: user.profile.updatedAt,
            } : null,
            tripCount,
            collectionCount,
            likeCount,
        };
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], UsersService);
//# sourceMappingURL=users.service.js.map