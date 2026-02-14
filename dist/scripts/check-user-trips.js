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
async function checkUserTrips() {
    const userEmail = '2293028143@qq.com';
    console.log('='.repeat(70));
    console.log(`🔍 检查用户 ${userEmail} 的行程数据`);
    console.log('='.repeat(70));
    console.log('');
    try {
        const user = await prisma.user.findUnique({
            where: { email: userEmail },
            select: {
                id: true,
                email: true,
                displayName: true,
            },
        });
        if (!user) {
            console.error(`❌ 用户 ${userEmail} 不存在`);
            return;
        }
        console.log(`✅ 找到用户:`);
        console.log(`  ID: ${user.id}`);
        console.log(`  Email: ${user.email}`);
        console.log(`  DisplayName: ${user.displayName || '(空)'}`);
        console.log('');
        const collaborators = await prisma.tripCollaborator.findMany({
            where: {
                userId: user.id,
            },
            select: {
                id: true,
                tripId: true,
                role: true,
                createdAt: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
        console.log(`📋 TripCollaborator 记录数: ${collaborators.length}`);
        console.log('');
        if (collaborators.length > 0) {
            console.log('📋 TripCollaborator 详情:');
            collaborators.forEach((collab, index) => {
                console.log(`  ${index + 1}. Trip ID: ${collab.tripId}`);
                console.log(`     角色: ${collab.role}`);
                console.log(`     创建时间: ${collab.createdAt}`);
                console.log('');
            });
        }
        const tripIds = collaborators.map(c => c.tripId);
        if (tripIds.length > 0) {
            const trips = await prisma.trip.findMany({
                where: {
                    id: { in: tripIds },
                },
                select: {
                    id: true,
                    destination: true,
                    startDate: true,
                    endDate: true,
                    status: true,
                    createdAt: true,
                    updatedAt: true,
                    metadata: true,
                },
                orderBy: {
                    createdAt: 'desc',
                },
            });
            console.log(`📋 关联的行程数: ${trips.length}`);
            console.log('');
            if (trips.length > 0) {
                console.log('📋 行程详情:');
                trips.forEach((trip, index) => {
                    console.log(`  ${index + 1}. Trip ID: ${trip.id}`);
                    console.log(`     目的地: ${trip.destination}`);
                    console.log(`     开始日期: ${trip.startDate.toISOString().split('T')[0]}`);
                    console.log(`     结束日期: ${trip.endDate.toISOString().split('T')[0]}`);
                    console.log(`     状态: ${trip.status || '(空)'}`);
                    console.log(`     创建时间: ${trip.createdAt.toISOString()}`);
                    console.log(`     更新时间: ${trip.updatedAt.toISOString()}`);
                    if (trip.metadata) {
                        const metadata = trip.metadata;
                        if (metadata.createdFromTemplate) {
                            console.log(`     来源模板: ${metadata.createdFromTemplate}`);
                        }
                        if (metadata.templateName) {
                            console.log(`     模板名称: ${metadata.templateName}`);
                        }
                    }
                    console.log('');
                });
            }
        }
        else {
            console.log('⚠️  没有找到关联的行程');
        }
        const allTrips = await prisma.trip.findMany({
            where: {
                TripCollaborator: {
                    some: {
                        userId: user.id,
                        role: 'OWNER',
                    },
                },
            },
            select: {
                id: true,
                destination: true,
                startDate: true,
                endDate: true,
                status: true,
                createdAt: true,
                metadata: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
        console.log('');
        console.log('='.repeat(70));
        console.log(`📊 通过 TripCollaborator 查询的行程数: ${allTrips.length}`);
        console.log('='.repeat(70));
        console.log('');
        const tripsWithStatus = await prisma.trip.findMany({
            where: {
                TripCollaborator: {
                    some: {
                        userId: user.id,
                        role: 'OWNER',
                    },
                },
                status: 'PLANNING',
            },
            select: {
                id: true,
                destination: true,
                status: true,
                createdAt: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
        console.log(`📊 PLANNING 状态的行程数: ${tripsWithStatus.length}`);
        console.log('');
        const tripsByStatus = await prisma.trip.groupBy({
            by: ['status'],
            where: {
                TripCollaborator: {
                    some: {
                        userId: user.id,
                        role: 'OWNER',
                    },
                },
            },
            _count: {
                id: true,
            },
        });
        console.log('📊 按状态分组的行程数:');
        tripsByStatus.forEach(item => {
            console.log(`  ${item.status || '(空)'}: ${item._count.id} 个`);
        });
        console.log('');
        const recentTrips = await prisma.trip.findMany({
            take: 10,
            orderBy: {
                createdAt: 'desc',
            },
            select: {
                id: true,
                destination: true,
                status: true,
                createdAt: true,
                TripCollaborator: {
                    select: {
                        userId: true,
                        role: true,
                    },
                },
            },
        });
        const collaboratorUserIds = new Set();
        recentTrips.forEach(trip => {
            trip.TripCollaborator.forEach(c => collaboratorUserIds.add(c.userId));
        });
        const collaboratorUsers = await prisma.user.findMany({
            where: {
                id: { in: Array.from(collaboratorUserIds) },
            },
            select: {
                id: true,
                email: true,
            },
        });
        const userMap = new Map(collaboratorUsers.map(u => [u.id, u.email]));
        console.log('='.repeat(70));
        console.log('📋 最近创建的10个行程（包括所有用户）:');
        console.log('='.repeat(70));
        console.log('');
        recentTrips.forEach((trip, index) => {
            const isUserTrip = trip.TripCollaborator.some(c => c.userId === user.id);
            console.log(`${index + 1}. Trip ID: ${trip.id}`);
            console.log(`   目的地: ${trip.destination}`);
            console.log(`   状态: ${trip.status || '(空)'}`);
            console.log(`   创建时间: ${trip.createdAt.toISOString()}`);
            console.log(`   是否属于该用户: ${isUserTrip ? '✅ 是' : '❌ 否'}`);
            console.log(`   协作者数: ${trip.TripCollaborator.length}`);
            if (trip.TripCollaborator.length > 0) {
                trip.TripCollaborator.forEach(c => {
                    const userEmail = userMap.get(c.userId) || 'N/A';
                    console.log(`     - ${userEmail} (${c.role})`);
                });
            }
            console.log('');
        });
    }
    catch (error) {
        console.error('❌ 查询失败:', error.message);
        console.error(error);
    }
    finally {
        await prisma.$disconnect();
    }
}
checkUserTrips().catch(console.error);
//# sourceMappingURL=check-user-trips.js.map