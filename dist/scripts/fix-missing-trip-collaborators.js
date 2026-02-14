#!/usr/bin/env tsx
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const crypto_1 = require("crypto");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const prisma = new client_1.PrismaClient();
async function fixMissingTripCollaborators() {
    const userEmail = '2293028143@qq.com';
    console.log('='.repeat(70));
    console.log(`🔧 修复用户 ${userEmail} 缺少 TripCollaborator 的行程`);
    console.log('='.repeat(70));
    console.log('');
    try {
        const user = await prisma.user.findUnique({
            where: { email: userEmail },
            select: {
                id: true,
                email: true,
            },
        });
        if (!user) {
            console.error(`❌ 用户 ${userEmail} 不存在`);
            return;
        }
        console.log(`✅ 找到用户: ${user.email} (ID: ${user.id})`);
        console.log('');
        const tripsFromTemplate = await prisma.trip.findMany({
            where: {
                metadata: {
                    path: ['createdFromTemplate'],
                    not: null,
                },
            },
            select: {
                id: true,
                destination: true,
                status: true,
                createdAt: true,
                metadata: true,
                TripCollaborator: {
                    where: {
                        userId: user.id,
                    },
                    select: {
                        id: true,
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
        console.log(`📋 找到 ${tripsFromTemplate.length} 个从模板创建的行程`);
        console.log('');
        const tripsToFix = tripsFromTemplate.filter(trip => trip.TripCollaborator.length === 0);
        console.log(`⚠️  其中 ${tripsToFix.length} 个行程缺少 TripCollaborator 记录`);
        console.log('');
        if (tripsToFix.length === 0) {
            console.log('✅ 所有行程都已有关联的 TripCollaborator 记录');
            return;
        }
        console.log('📋 需要修复的行程:');
        tripsToFix.forEach((trip, index) => {
            const metadata = trip.metadata;
            console.log(`  ${index + 1}. Trip ID: ${trip.id}`);
            console.log(`     目的地: ${trip.destination}`);
            console.log(`     状态: ${trip.status || '(空)'}`);
            console.log(`     创建时间: ${trip.createdAt.toISOString()}`);
            if (metadata === null || metadata === void 0 ? void 0 : metadata.createdFromTemplate) {
                console.log(`     来源模板: ${metadata.createdFromTemplate}`);
            }
            console.log('');
        });
        console.log('🔧 开始修复...');
        console.log('');
        let fixed = 0;
        let errors = 0;
        for (const trip of tripsToFix) {
            try {
                const existingCollaborators = await prisma.tripCollaborator.findMany({
                    where: {
                        tripId: trip.id,
                    },
                });
                if (existingCollaborators.length > 0) {
                    console.log(`  ⚠️  Trip ${trip.id} 已有其他协作者，跳过`);
                    continue;
                }
                await prisma.tripCollaborator.create({
                    data: {
                        id: (0, crypto_1.randomUUID)(),
                        tripId: trip.id,
                        userId: user.id,
                        role: 'OWNER',
                        updatedAt: new Date(),
                    },
                });
                console.log(`  ✅ 已为 Trip ${trip.id} 创建 TripCollaborator 记录`);
                fixed++;
            }
            catch (error) {
                console.error(`  ❌ 修复 Trip ${trip.id} 失败: ${error.message}`);
                errors++;
            }
        }
        console.log('');
        console.log('='.repeat(70));
        console.log('📊 修复统计:');
        console.log(`  ✅ 已修复: ${fixed} 个`);
        console.log(`  ❌ 失败: ${errors} 个`);
        console.log('='.repeat(70));
        console.log('');
        const finalCount = await prisma.tripCollaborator.count({
            where: {
                userId: user.id,
                role: 'OWNER',
            },
        });
        console.log(`✅ 用户现在共有 ${finalCount} 个行程（作为 OWNER）`);
    }
    catch (error) {
        console.error('❌ 修复失败:', error.message);
        console.error(error);
    }
    finally {
        await prisma.$disconnect();
    }
}
fixMissingTripCollaborators().catch(console.error);
//# sourceMappingURL=fix-missing-trip-collaborators.js.map