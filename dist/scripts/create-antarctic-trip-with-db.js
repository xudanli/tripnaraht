"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';
const prisma = new client_1.PrismaClient();
async function getVerificationCode(email) {
    try {
        const codeRecord = await prisma.emailVerificationCode.findFirst({
            where: {
                email,
                used: false,
                expiresAt: {
                    gt: new Date(),
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
        if (!codeRecord) {
            return null;
        }
        console.log(`验证码信息: code=${codeRecord.code}, expiresAt=${codeRecord.expiresAt.toISOString()}`);
        return codeRecord.code;
    }
    catch (error) {
        console.error('获取验证码失败:', error.message);
        return null;
    }
}
async function loginWithEmail(email, code) {
    var _a;
    try {
        console.log(`🔐 正在使用邮箱登录: ${email}...`);
        const response = await fetch(`${API_BASE_URL}/auth/email/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, code }),
            credentials: 'include',
        });
        const result = await response.json();
        if (!response.ok) {
            const errorMessage = Array.isArray(result.message)
                ? result.message.join(' ')
                : (result.message || ((_a = result.error) === null || _a === void 0 ? void 0 : _a.message) || '');
            if (errorMessage.includes('未注册') || errorMessage.includes('not registered')) {
                console.log('用户不存在，尝试注册...');
                return await registerWithEmail(email, code);
            }
            console.error('❌ 登录失败:');
            console.error(JSON.stringify(result, null, 2));
            return null;
        }
        console.log('✅ 登录成功!');
        console.log('登录返回数据:', JSON.stringify(result, null, 2));
        return result.accessToken || null;
    }
    catch (error) {
        console.error('❌ 登录请求失败:');
        console.error(error.message);
        return null;
    }
}
async function registerWithEmail(email, code) {
    try {
        console.log(`📝 正在使用邮箱注册: ${email}...`);
        const response = await fetch(`${API_BASE_URL}/auth/email/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email,
                code,
                displayName: 'Antarctic Explorer',
            }),
            credentials: 'include',
        });
        const result = await response.json();
        if (!response.ok) {
            console.error('❌ 注册失败:');
            console.error(JSON.stringify(result, null, 2));
            return null;
        }
        console.log('✅ 注册成功!');
        console.log('注册返回数据:', JSON.stringify(result, null, 2));
        return result.accessToken || null;
    }
    catch (error) {
        console.error('❌ 注册请求失败:');
        console.error(error.message);
        return null;
    }
}
async function createAntarcticTrip(accessToken) {
    const tripData = {
        destination: 'AQ',
        startDate: '2025-12-01',
        endDate: '2025-12-10',
        totalBudget: 150000,
        travelers: [
            {
                type: 'ADULT',
                mobilityTag: 'IRON_LEGS',
            },
        ],
        pace: 'standard',
        preferences: ['adventure', 'wildlife', 'photography'],
    };
    try {
        console.log('\n🚢 正在创建 Antarctic Peninsula 行程...');
        console.log('📋 行程参数:');
        console.log(JSON.stringify(tripData, null, 2));
        console.log(`🔑 使用 AccessToken: ${accessToken ? accessToken.substring(0, 20) + '...' : 'NULL'}`);
        const response = await fetch(`${API_BASE_URL}/trips`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify(tripData),
        });
        const result = await response.json();
        if (!response.ok) {
            console.error('\n❌ 创建行程失败:');
            console.error(JSON.stringify(result, null, 2));
            return null;
        }
        console.log('\n✅ 行程创建成功!');
        console.log('📦 返回数据:');
        console.log(JSON.stringify(result, null, 2));
        if (result.success && result.data) {
            const trip = result.data;
            console.log('\n📊 行程摘要:');
            console.log(`   ID: ${trip.id}`);
            console.log(`   目的地: ${trip.destination}`);
            console.log(`   开始日期: ${trip.startDate}`);
            console.log(`   结束日期: ${trip.endDate}`);
            console.log(`   状态: ${trip.status}`);
            if (trip.budgetConfig) {
                console.log(`   总预算: ${trip.budgetConfig.totalBudget} ${trip.budgetConfig.currency}`);
                console.log(`   每日预算: ${trip.budgetConfig.daily_budget} ${trip.budgetConfig.currency}`);
            }
            if (trip.pacingConfig) {
                console.log(`   节奏: ${trip.pacingConfig.level}`);
                console.log(`   每日最大活动数: ${trip.pacingConfig.maxDailyActivities}`);
            }
            return trip;
        }
        return null;
    }
    catch (error) {
        console.error('\n❌ 请求失败:');
        console.error(error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        return null;
    }
}
async function main() {
    console.log('🌍 Antarctic Peninsula 行程创建工具\n');
    console.log('='.repeat(50));
    const email = process.argv[2] || 'test-antarctic@example.com';
    try {
        console.log(`📧 正在发送验证码到: ${email}...`);
        const sendCodeResponse = await fetch(`${API_BASE_URL}/auth/email/send-code`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email }),
        });
        if (!sendCodeResponse.ok) {
            const error = await sendCodeResponse.json();
            console.error('发送验证码失败:', JSON.stringify(error, null, 2));
            process.exit(1);
        }
        console.log('验证码已发送，等待 3 秒后从数据库获取...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        const code = await getVerificationCode(email);
        if (!code) {
            console.error('❌ 无法从数据库获取验证码');
            console.log('💡 提示: 请手动检查数据库或邮件中的验证码');
            process.exit(1);
        }
        console.log(`✅ 找到验证码: ${code}`);
        let accessToken = await registerWithEmail(email, code);
        if (!accessToken) {
            console.log('注册失败，尝试登录...');
            console.log('发送新的验证码用于登录...');
            const sendCodeResponse = await fetch(`${API_BASE_URL}/auth/email/send-code`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email }),
            });
            if (sendCodeResponse.ok) {
                await new Promise(resolve => setTimeout(resolve, 3000));
                const loginCode = await getVerificationCode(email);
                if (loginCode) {
                    accessToken = await loginWithEmail(email, loginCode);
                }
            }
        }
        if (!accessToken) {
            console.error('\n❌ 无法获取 accessToken');
            process.exit(1);
        }
        const trip = await createAntarcticTrip(accessToken);
        if (!trip) {
            console.error('\n❌ 行程创建失败');
            process.exit(1);
        }
        console.log('\n🎉 完成!');
        console.log(`📌 行程 ID: ${trip.id}`);
        console.log(`🔗 查看行程: ${API_BASE_URL}/trips/${trip.id}`);
    }
    catch (error) {
        console.error('\n❌ 发生错误:');
        console.error(error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    }
    finally {
        await prisma.$disconnect();
    }
}
main().catch(console.error);
//# sourceMappingURL=create-antarctic-trip-with-db.js.map