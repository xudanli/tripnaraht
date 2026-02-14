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
var AuthUserService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthUserService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let AuthUserService = AuthUserService_1 = class AuthUserService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(AuthUserService_1.name);
    }
    async upsertUserFromGoogle(payload) {
        const { sub: googleSub, email, email_verified, name, picture } = payload;
        let existingUser = googleSub
            ? await this.prisma.user.findUnique({
                where: { googleSub },
            })
            : null;
        if (!existingUser && email) {
            existingUser = await this.prisma.user.findUnique({
                where: { email },
            });
            if (existingUser && !existingUser.googleSub && googleSub) {
                this.logger.debug(`Binding googleSub ${googleSub} to existing user ${existingUser.id} (matched by email)`);
                existingUser = await this.prisma.user.update({
                    where: { id: existingUser.id },
                    data: { googleSub },
                });
            }
        }
        if (existingUser) {
            const updatedUser = await this.prisma.user.update({
                where: { id: existingUser.id },
                data: {
                    email: email || existingUser.email,
                    emailVerified: email_verified !== null && email_verified !== void 0 ? email_verified : existingUser.emailVerified,
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
        const newUser = await this.prisma.user.create({
            data: {
                googleSub: googleSub || null,
                email: email || null,
                emailVerified: email_verified !== null && email_verified !== void 0 ? email_verified : false,
                displayName: name || null,
                avatarUrl: picture || null,
            },
        });
        await this.prisma.userProfile.upsert({
            where: { userId: newUser.id },
            update: {},
            create: {
                userId: newUser.id,
                preferences: null,
                updatedAt: new Date(),
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
    async findUserById(userId) {
        return this.prisma.user.findUnique({
            where: { id: userId },
        });
    }
    async findUserByEmail(email) {
        return this.prisma.user.findUnique({
            where: { email },
        });
    }
    async createUserWithEmail(email, displayName) {
        const existingUser = await this.findUserByEmail(email);
        if (existingUser) {
            throw new common_1.ConflictException('该邮箱已被注册');
        }
        const newUser = await this.prisma.user.create({
            data: {
                email,
                emailVerified: true,
                displayName: displayName || null,
                googleSub: null,
                avatarUrl: null,
            },
        });
        await this.prisma.userProfile.upsert({
            where: { userId: newUser.id },
            update: {},
            create: {
                userId: newUser.id,
                preferences: null,
                updatedAt: new Date(),
            },
        });
        this.logger.debug(`Created new user ${newUser.id} (email: ${email})`);
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
};
exports.AuthUserService = AuthUserService;
exports.AuthUserService = AuthUserService = AuthUserService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AuthUserService);
//# sourceMappingURL=user.service.js.map