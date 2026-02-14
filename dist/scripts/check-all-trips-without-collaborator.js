#!/usr/bin/env tsx
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const prisma = new client_1.PrismaClient();
async function checkAllTripsWithoutCollaborator() {
    console.log('='.repeat(70));
    console.log('🔍 检查所有缺少 TripCollaborator 的行程');
    console.log('='.repeat(70));
    console.log('');
    try {
        const tripsWithoutCollaborator = await prisma.trip.findMany({
            where: {
                TripCollaborator: {
                    none: {},
                },
            },
            select: {
                id: true,
                destination: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                metadata: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
        console.log(`📋 找到 ${tripsWithoutCollaborator.length} 个没有 TripCollaborator 的行程`);
        console.log('');
        if (tripsWithoutCollaborator.length > 0) {
            console.log('📋 行程详情:');
            tripsWithoutCollaborator.forEach((trip, index) => {
                const metadata = trip.metadata;
                console.log(`  ${index + 1}. Trip ID: ${trip.id}`);
                console.log(`     目的地: ${trip.destination}`);
                console.log(`     状态: ${trip.status || '(空)'}`);
                console.log(`     创建时间: ${trip.createdAt.toISOString()}`);
                console.log(`     更新时间: ${trip.updatedAt.toISOString()}`);
                if (metadata) {
                    if (metadata.createdFromTemplate) {
                        console.log(`     ⚠️  来源模板: ${metadata.createdFromTemplate}`);
                    }
                    if (metadata.templateName) {
                        console.log(`     模板名称: ${metadata.templateName}`);
                    }
                }
                console.log('');
            });
            const fromTemplate = tripsWithoutCollaborator.filter(trip => {
                const metadata = trip.metadata;
                return metadata === null || metadata === void 0 ? void 0 : metadata.createdFromTemplate;
            });
            console.log(`⚠️  其中 ${fromTemplate.length} 个是从模板创建的（需要修复）`);
            console.log('');
            if (fromTemplate.length > 0) {
                console.log('📋 从模板创建的行程（需要修复）:');
                fromTemplate.forEach((trip, index) => {
                    const metadata = trip.metadata;
                    console.log(`  ${index + 1}. Trip ID: ${trip.id}`);
                    console.log(`     目的地: ${trip.destination}`);
                    console.log(`     来源模板: ${metadata.createdFromTemplate}`);
                    console.log(`     创建时间: ${trip.createdAt.toISOString()}`);
                    console.log('');
                });
            }
        }
        else {
            console.log('✅ 所有行程都有 TripCollaborator 记录');
        }
        const userEmail = '2293028143@qq.com';
        const user = await prisma.user.findUnique({
            where: { email: userEmail },
            select: {
                id: true,
                email: true,
            },
        });
        if (user) {
            console.log('');
            console.log('='.repeat(70));
            console.log(`🔍 检查用户 ${userEmail} 的行程`);
            console.log('='.repeat(70));
            console.log('');
            const userTrips = await prisma.trip.findMany({
                where: {
                    OR: [
                        {
                            TripCollaborator: {
                                some: {
                                    userId: user.id,
                                },
                            },
                        },
                        {
                            metadata: {
                                path: ['createdFromTemplate'],
                                not: null,
                            },
                        },
                    ],
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
                            role: true,
                        },
                    },
                },
                orderBy: {
                    createdAt: 'desc',
                },
            });
            console.log(`📋 找到 ${userTrips.length} 个可能相关的行程`);
            console.log('');
            const withCollaborator = userTrips.filter(t => t.TripCollaborator.length > 0);
            const withoutCollaborator = userTrips.filter(t => t.TripCollaborator.length === 0);
            console.log(`  ✅ 有 TripCollaborator: ${withCollaborator.length} 个`);
            console.log(`  ⚠️  无 TripCollaborator: ${withoutCollaborator.length} 个`);
            console.log('');
            if (withoutCollaborator.length > 0) {
                console.log('⚠️  缺少 TripCollaborator 的行程:');
                withoutCollaborator.forEach((trip, index) => {
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
            }
        }
    }
    catch (error) {
        console.error('❌ 查询失败:', error.message);
        console.error(error);
    }
    finally {
        await prisma.$disconnect();
    }
}
checkAllTripsWithoutCollaborator().catch(console.error);
//# sourceMappingURL=check-all-trips-without-collaborator.js.map