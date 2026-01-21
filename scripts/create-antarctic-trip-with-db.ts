// scripts/create-antarctic-trip-with-db.ts
/**
 * 创建 Antarctic Peninsula 行程的完整测试脚本
 * 包括：从数据库获取验证码 -> 登录 -> 创建行程
 */

import { PrismaClient } from '@prisma/client';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';
const prisma = new PrismaClient();

interface CreateTripRequest {
  destination: string;
  startDate: string;
  endDate: string;
  totalBudget: number;
  travelers: Array<{
    type: 'ADULT' | 'ELDERLY' | 'CHILD';
    mobilityTag: 'IRON_LEGS' | 'ACTIVE_SENIOR' | 'CITY_POTATO' | 'LIMITED';
  }>;
  pace?: 'relaxed' | 'standard' | 'tight';
  preferences?: string[];
}

/**
 * 从数据库获取最新的验证码
 */
async function getVerificationCode(email: string): Promise<string | null> {
  try {
    // 只获取未使用的验证码
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
  } catch (error: any) {
    console.error('获取验证码失败:', error.message);
    return null;
  }
}

/**
 * 步骤 1: 使用邮箱登录
 */
async function loginWithEmail(email: string, code: string): Promise<string | null> {
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

    const result = await response.json() as any;

    if (!response.ok) {
      // 如果用户不存在，尝试注册
      const errorMessage = Array.isArray(result.message) 
        ? result.message.join(' ') 
        : (result.message || result.error?.message || '');
      
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
  } catch (error: any) {
    console.error('❌ 登录请求失败:');
    console.error(error.message);
    return null;
  }
}

/**
 * 步骤 1.5: 使用邮箱注册
 */
async function registerWithEmail(email: string, code: string): Promise<string | null> {
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

    const result = await response.json() as any;

    if (!response.ok) {
      console.error('❌ 注册失败:');
      console.error(JSON.stringify(result, null, 2));
      return null;
    }

    console.log('✅ 注册成功!');
    console.log('注册返回数据:', JSON.stringify(result, null, 2));
    
    // 注册接口返回的是 AuthResponseDto，包含 user 和 accessToken
    return result.accessToken || null;
  } catch (error: any) {
    console.error('❌ 注册请求失败:');
    console.error(error.message);
    return null;
  }
}

/**
 * 步骤 2: 创建 Antarctic Peninsula 行程
 */
async function createAntarcticTrip(accessToken: string) {
  const tripData: CreateTripRequest = {
    destination: 'AQ', // 使用 AQ（南极洲）作为国家代码
    startDate: '2025-12-01', // 南极夏季（南半球夏季，12月-2月）
    endDate: '2025-12-10', // 10天行程
    totalBudget: 150000, // 15万人民币（南极行程通常较贵）
    travelers: [
      {
        type: 'ADULT',
        mobilityTag: 'IRON_LEGS', // 特种兵级别，适合探险行程
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

    const result = await response.json() as any;

    if (!response.ok) {
      console.error('\n❌ 创建行程失败:');
      console.error(JSON.stringify(result, null, 2));
      return null;
    }

    console.log('\n✅ 行程创建成功!');
    console.log('📦 返回数据:');
    console.log(JSON.stringify(result, null, 2));

    if (result.success && result.data) {
      const trip = result.data as any;
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
  } catch (error: any) {
    console.error('\n❌ 请求失败:');
    console.error(error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    return null;
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('🌍 Antarctic Peninsula 行程创建工具\n');
  console.log('='.repeat(50));
  
  const email = process.argv[2] || 'test-antarctic@example.com';
  
  try {
    // 步骤 0: 发送新的验证码
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
    
    // 获取最新的未使用验证码
    const code = await getVerificationCode(email);
    
    if (!code) {
      console.error('❌ 无法从数据库获取验证码');
      console.log('💡 提示: 请手动检查数据库或邮件中的验证码');
      process.exit(1);
    }
    
    console.log(`✅ 找到验证码: ${code}`);

    // 步骤 1: 先尝试注册，如果用户已存在则登录
    let accessToken = await registerWithEmail(email, code);
    if (!accessToken) {
      // 注册失败，可能是用户已存在，尝试登录
      console.log('注册失败，尝试登录...');
      // 需要新的验证码用于登录
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

    // 步骤 2: 创建行程
    const trip = await createAntarcticTrip(accessToken);
    if (!trip) {
      console.error('\n❌ 行程创建失败');
      process.exit(1);
    }

    console.log('\n🎉 完成!');
    console.log(`📌 行程 ID: ${trip.id}`);
    console.log(`🔗 查看行程: ${API_BASE_URL}/trips/${trip.id}`);
  } catch (error: any) {
    console.error('\n❌ 发生错误:');
    console.error(error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// 运行主函数
main().catch(console.error);
