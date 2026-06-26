/**
 * Upsert real identity-governance rows for a C-end user (not mock).
 *
 * Required env:
 *   IDENTITY_SEED_EMAIL          (default: zjudanlixu@gmail.com)
 *
 * Optional:
 *   IDENTITY_SEED_PUBLISHING_LEVEL   PUBLIC_NON_COMMERCIAL | PUBLIC_COMMERCIAL (default: PUBLIC_NON_COMMERCIAL)
 *   IDENTITY_SEED_SUBSCRIPTION_PLAN  FREE | ORGANIZER_PRO | PROFESSIONAL_PRO | AGENCY_PLAN (default: PROFESSIONAL_PRO)
 *   IDENTITY_SEED_SEED_REASON        audit reason string
 *
 * Usage:
 *   IDENTITY_SEED_EMAIL=zjudanlixu@gmail.com npx tsx scripts/seed-identity-governance-user.ts
 */
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';

loadEnv({ path: path.resolve(__dirname, '..', '.env') });

const DEFAULT_EMAIL = 'zjudanlixu@gmail.com';
const VALID_LEVELS = new Set(['PUBLIC_NON_COMMERCIAL', 'PUBLIC_COMMERCIAL']);
const VALID_SUBSCRIPTION_PLANS = new Set([
  'FREE',
  'ORGANIZER_PRO',
  'PROFESSIONAL_PRO',
  'AGENCY_PLAN',
]);

function subscriptionEntitlements(plan: string) {
  switch (plan) {
    case 'ORGANIZER_PRO':
      return {
        tools: ['basic', 'plan_studio', 'decision_profiling', 'collaboration', 'route_templates'],
        limits: { activeTrips: 20, collaborators: 12 },
      };
    case 'PROFESSIONAL_PRO':
      return {
        tools: [
          'basic',
          'plan_studio',
          'decision_profiling',
          'trusted_projects',
          'route_templates',
          'in_trip_tools',
          'feasibility_repair',
          'collaboration',
        ],
        limits: { activeTrips: 50, collaborators: 20 },
      };
    case 'AGENCY_PLAN':
      return {
        tools: [
          'basic',
          'plan_studio',
          'decision_profiling',
          'trusted_projects',
          'route_templates',
          'in_trip_tools',
          'agency_workspace',
          'collaboration',
        ],
        limits: { activeTrips: 100, collaborators: 50 },
      };
    default:
      return { tools: ['basic'], limits: { activeTrips: 3, collaborators: 3 } };
  }
}

async function main() {
  const email = (process.env.IDENTITY_SEED_EMAIL ?? DEFAULT_EMAIL).trim().toLowerCase();
  const publishingLevel = (
    process.env.IDENTITY_SEED_PUBLISHING_LEVEL ?? 'PUBLIC_NON_COMMERCIAL'
  ).trim().toUpperCase();
  const subscriptionPlan = (
    process.env.IDENTITY_SEED_SUBSCRIPTION_PLAN ?? 'PROFESSIONAL_PRO'
  ).trim().toUpperCase();
  const seedReason =
    process.env.IDENTITY_SEED_SEED_REASON?.trim() || `identity_seed_script:${email}`;

  if (!VALID_LEVELS.has(publishingLevel)) {
    console.error(`Invalid IDENTITY_SEED_PUBLISHING_LEVEL: ${publishingLevel}`);
    process.exit(1);
  }
  if (!VALID_SUBSCRIPTION_PLANS.has(subscriptionPlan)) {
    console.error(`Invalid IDENTITY_SEED_SUBSCRIPTION_PLAN: ${subscriptionPlan}`);
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.error(`User not found for email=${email}`);
      console.error('Create the account via login/signup first, then re-run this script.');
      process.exit(1);
    }

    const now = new Date();
    const expiresAt = new Date(now.getFullYear() + 2, now.getMonth(), now.getDate());

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    });

    await prisma.userVerification.upsert({
      where: {
        userId_verificationType: { userId: user.id, verificationType: 'EMAIL' },
      },
      create: {
        userId: user.id,
        verificationType: 'EMAIL',
        status: 'VERIFIED',
        provider: 'identity_seed',
        verifiedAt: now,
        expiresAt: null,
      },
      update: {
        status: 'VERIFIED',
        provider: 'identity_seed',
        verifiedAt: now,
        expiresAt: null,
      },
    });

    await prisma.professionalProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        bio: 'Tripnara认证领队，擅长冰岛高地与川西长线带队（平台测试账号）',
        destinations: ['IS', 'CN'],
        yearsOfExperience: 8,
        metadata: { seeded: true, seededAt: now.toISOString() },
      },
      update: {
        bio: 'tripnara领队，擅长冰岛高地与川西长线带队（平台测试账号）',
        destinations: ['IS', 'CN'],
        yearsOfExperience: 8,
        metadata: { seeded: true, seededAt: now.toISOString() },
      },
    });

    const existingCert = await prisma.professionalCertification.findFirst({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
    });

    const cert =
      existingCert != null
        ? await prisma.professionalCertification.update({
            where: { id: existingCert.id },
            data: {
              status: 'VERIFIED',
              submittedAt: existingCert.submittedAt ?? now,
              verifiedAt: now,
              expiresAt,
              reviewNotes: '通过身份数据初始化脚本审核通过',
              materials: {
                ...(typeof existingCert.materials === 'object' && existingCert.materials != null
                  ? (existingCert.materials as Record<string, unknown>)
                  : {}),
                bio: '专业领队认证资料（测试数据）',
                destinations: ['IS'],
                yearsOfExperience: 8,
              },
            },
          })
        : await prisma.professionalCertification.create({
            data: {
              userId: user.id,
              status: 'VERIFIED',
              submittedAt: now,
              verifiedAt: now,
              expiresAt,
              reviewNotes: '通过身份数据初始化脚本审核通过',
              materials: {
                bio: '专业领队认证资料（测试数据）',
                destinations: ['IS'],
                yearsOfExperience: 8,
              },
            },
          });

    const personalContext = await prisma.userAccountContext.findFirst({
      where: { userId: user.id, contextType: 'personal' },
    });
    if (!personalContext) {
      await prisma.userAccountContext.create({
        data: { userId: user.id, contextType: 'personal', isActive: true },
      });
    } else {
      await prisma.userAccountContext.updateMany({
        where: { userId: user.id, isActive: true },
        data: { isActive: false },
      });
      await prisma.userAccountContext.update({
        where: { id: personalContext.id },
        data: { isActive: true },
      });
    }

    const professionalContext = await prisma.userAccountContext.findFirst({
      where: { userId: user.id, contextType: 'professional' },
    });
    if (!professionalContext) {
      await prisma.userAccountContext.create({
        data: { userId: user.id, contextType: 'professional', isActive: false },
      });
    }

    const subscription = await prisma.subscription.findFirst({
      where: { accountScope: 'USER', accountId: user.id, status: 'ACTIVE' },
      orderBy: { validFrom: 'desc' },
    });
    const subscriptionData = {
      plan: subscriptionPlan,
      status: 'ACTIVE' as const,
      entitlements: subscriptionEntitlements(subscriptionPlan),
      validFrom: subscription?.validFrom ?? now,
      validUntil: null as Date | null,
    };
    if (subscription) {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: subscriptionData,
      });
    } else {
      await prisma.subscription.create({
        data: {
          accountScope: 'USER',
          accountId: user.id,
          ...subscriptionData,
        },
      });
    }

    const publishing = await prisma.publishingPermission.findFirst({
      where: { subjectType: 'USER', subjectId: user.id, status: 'ACTIVE' },
      orderBy: { grantedAt: 'desc' },
    });

    if (publishing) {
      await prisma.publishingPermission.update({
        where: { id: publishing.id },
        data: {
          level: publishingLevel,
          reason: seedReason,
          grantedAt: now,
          suspendedAt: null,
        },
      });
    } else {
      await prisma.publishingPermission.create({
        data: {
          subjectType: 'USER',
          subjectId: user.id,
          level: publishingLevel,
          status: 'ACTIVE',
          reason: seedReason,
          grantedById: user.id,
        },
      });
    }

    console.log('OK: identity governance seeded');
    console.log(`  userId=${user.id}`);
    console.log(`  email=${user.email}`);
    console.log(`  professionalCertId=${cert.id} status=${cert.status}`);
    console.log(`  publishingLevel=${publishingLevel}`);
    console.log(`  subscriptionPlan=${subscriptionPlan}`);
    console.log('');
    console.log('Next: log in as this user and hard-refresh Settings → 身份与权限 / 可信项目');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
