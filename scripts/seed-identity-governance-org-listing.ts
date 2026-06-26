/**
 * Upsert organization + published trusted project listing for a C-end user.
 *
 * Required env:
 *   IDENTITY_SEED_EMAIL (default: zjudanlixu@gmail.com)
 *
 * Optional:
 *   IDENTITY_ORG_SLUG              (default: jijing-outdoor-iceland)
 *   IDENTITY_ORG_DISPLAY_NAME      (default: 极境户外 · 冰岛专线)
 *   IDENTITY_SEED_PUBLISHING_LEVEL   PUBLIC_NON_COMMERCIAL | PUBLIC_COMMERCIAL (default: PUBLIC_COMMERCIAL)
 *
 * Usage:
 *   IDENTITY_SEED_EMAIL=zjudanlixu@gmail.com npm run seed:identity-governance-org
 */
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';

loadEnv({ path: path.resolve(__dirname, '..', '.env') });

const DEFAULT_EMAIL = 'zjudanlixu@gmail.com';
const DEFAULT_ORG_SLUG = 'jijing-outdoor-iceland';
const DEFAULT_ORG_NAME = '极境户外 · 冰岛专线';
const SEED_LISTING_KEY = 'seed:org-iceland-highlands-2026';

const VALID_LEVELS = new Set(['PUBLIC_NON_COMMERCIAL', 'PUBLIC_COMMERCIAL']);

function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

async function main() {
  const email = (process.env.IDENTITY_SEED_EMAIL ?? DEFAULT_EMAIL).trim().toLowerCase();
  const orgSlug = (process.env.IDENTITY_ORG_SLUG ?? DEFAULT_ORG_SLUG).trim();
  const orgDisplayName = (process.env.IDENTITY_ORG_DISPLAY_NAME ?? DEFAULT_ORG_NAME).trim();
  const publishingLevel = (
    process.env.IDENTITY_SEED_PUBLISHING_LEVEL ?? 'PUBLIC_COMMERCIAL'
  )
    .trim()
    .toUpperCase();

  if (!VALID_LEVELS.has(publishingLevel)) {
    console.error(`Invalid IDENTITY_SEED_PUBLISHING_LEVEL: ${publishingLevel}`);
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.error(`User not found for email=${email}`);
      console.error('Run signup/login first, then: npm run seed:identity-governance');
      process.exit(1);
    }

    const now = new Date();
    const certExpiresAt = new Date(now.getFullYear() + 2, now.getMonth(), now.getDate());

    if (!user.displayName?.trim()) {
      await prisma.user.update({
        where: { id: user.id },
        data: { displayName: '徐丹丽' },
      });
    }

    let organization = await prisma.organization.findFirst({
      where: {
        OR: [{ slug: orgSlug }, { ownerId: user.id, displayName: orgDisplayName }],
      },
    });

    if (!organization) {
      organization = await prisma.organization.create({
        data: {
          slug: orgSlug,
          displayName: orgDisplayName,
          legalName: '成都极境户外运动服务有限公司',
          verificationStatus: 'VERIFIED',
          ownerId: user.id,
          metadata: {
            seeded: true,
            seededAt: now.toISOString(),
            focusDestinations: ['IS', 'NO'],
          },
        },
      });
    } else {
      organization = await prisma.organization.update({
        where: { id: organization.id },
        data: {
          slug: orgSlug,
          displayName: orgDisplayName,
          legalName: '成都极境户外运动服务有限公司',
          verificationStatus: 'VERIFIED',
          metadata: {
            seeded: true,
            seededAt: now.toISOString(),
            focusDestinations: ['IS', 'NO'],
          },
        },
      });
    }

    await prisma.organizationMember.upsert({
      where: {
        organizationId_userId: {
          organizationId: organization.id,
          userId: user.id,
        },
      },
      create: {
        organizationId: organization.id,
        userId: user.id,
        roles: ['OWNER', 'AGENCY_ADMIN', 'LEADER'],
        status: 'ACTIVE',
        acceptedAt: now,
      },
      update: {
        roles: ['OWNER', 'AGENCY_ADMIN', 'LEADER'],
        status: 'ACTIVE',
        acceptedAt: now,
      },
    });

    const existingAgencyCert = await prisma.agencyCertification.findFirst({
      where: { organizationId: organization.id },
      orderBy: { updatedAt: 'desc' },
    });

    const agencyCert =
      existingAgencyCert != null
        ? await prisma.agencyCertification.update({
            where: { id: existingAgencyCert.id },
            data: {
              status: 'VERIFIED',
              submittedAt: existingAgencyCert.submittedAt ?? now,
              verifiedAt: now,
              expiresAt: certExpiresAt,
              reviewNotes: '机构认证测试数据（seed 脚本）',
              materials: {
                businessLicense: '示例营业执照编号 91510100MA6XXXXX',
                outboundLicense: '示例出境游资质 L-SC-CJ00000',
                destinations: ['IS', 'NO'],
              },
            },
          })
        : await prisma.agencyCertification.create({
            data: {
              organizationId: organization.id,
              status: 'VERIFIED',
              submittedAt: now,
              verifiedAt: now,
              expiresAt: certExpiresAt,
              reviewNotes: '机构认证测试数据（seed 脚本）',
              materials: {
                businessLicense: '示例营业执照编号 91510100MA6XXXXX',
                outboundLicense: '示例出境游资质 L-SC-CJ00000',
                destinations: ['IS', 'NO'],
              },
            },
          });

    const orgPublishing = await prisma.publishingPermission.findFirst({
      where: {
        subjectType: 'ORGANIZATION',
        subjectId: organization.id,
        status: 'ACTIVE',
      },
      orderBy: { grantedAt: 'desc' },
    });

    if (orgPublishing) {
      await prisma.publishingPermission.update({
        where: { id: orgPublishing.id },
        data: {
          level: publishingLevel,
          reason: `org_seed_script:${email}`,
          grantedAt: now,
          suspendedAt: null,
        },
      });
    } else {
      await prisma.publishingPermission.create({
        data: {
          subjectType: 'ORGANIZATION',
          subjectId: organization.id,
          level: publishingLevel,
          status: 'ACTIVE',
          reason: `org_seed_script:${email}`,
          grantedById: user.id,
        },
      });
    }

    const orgSubscription = await prisma.subscription.findFirst({
      where: {
        accountScope: 'ORGANIZATION',
        accountId: organization.id,
        status: 'ACTIVE',
      },
      orderBy: { validFrom: 'desc' },
    });

    const orgSubscriptionData = {
      plan: 'AGENCY_PLAN',
      status: 'ACTIVE' as const,
      entitlements: {
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
      },
      validFrom: orgSubscription?.validFrom ?? now,
      validUntil: null as Date | null,
    };

    if (orgSubscription) {
      await prisma.subscription.update({
        where: { id: orgSubscription.id },
        data: orgSubscriptionData,
      });
    } else {
      await prisma.subscription.create({
        data: {
          accountScope: 'ORGANIZATION',
          accountId: organization.id,
          ...orgSubscriptionData,
        },
      });
    }

    const orgContext = await prisma.userAccountContext.findFirst({
      where: {
        userId: user.id,
        contextType: 'organization',
        contextId: organization.id,
      },
    });
    if (!orgContext) {
      await prisma.userAccountContext.create({
        data: {
          userId: user.id,
          contextType: 'organization',
          contextId: organization.id,
          isActive: false,
        },
      });
    }

    const startDate = new Date('2026-08-05T00:00:00.000Z');
    const endDate = new Date('2026-08-12T00:00:00.000Z');
    const publishedAt = addDays(now, -14);

    const existingListing = await prisma.trustedProjectListing.findFirst({
      where: {
        organizationId: organization.id,
        metadata: {
          path: ['seedKey'],
          equals: SEED_LISTING_KEY,
        },
      },
    });

    const listingData = {
      publisherSubjectType: 'ORGANIZATION',
      publisherSubjectId: organization.id,
      createdByUserId: user.id,
      responsibleUserId: user.id,
      organizationId: organization.id,
      commercialType: 'COMMERCIAL',
      reviewStatus: 'APPROVED',
      listingStatus: 'published',
      title: '冰岛高地环线 · 8日机构带队',
      destination: 'IS',
      startDate,
      endDate,
      summary:
        '兰德曼纳劳卡至索斯莫克经典穿越，由极境户外认证领队带队。含行前体能评估、每日天气预案与应急撤离方案。',
      slotsTotal: 8,
      slotsFilled: 2,
      budgetMinCents: 880000,
      budgetMaxCents: 1280000,
      riskDisclosure:
        '高地天气多变，需具备多日徒步经验、防水装备与基础自救能力。机构保留因极端天气调整路线的权利。',
      refundPolicy: '出发前 21 天全额退款；7–20 天退 70%；7 天内按合同条款处理。',
      submittedAt: addDays(now, -21),
      publishedAt,
      reviewNotes: '机构行程测试数据（seed 脚本自动审核通过）',
      reviewedById: user.id,
      metadata: {
        seedKey: SEED_LISTING_KEY,
        seededAt: now.toISOString(),
        highlights: ['F208 高地巴士', '索斯莫克峡谷', '专业向导配比 1:4'],
      },
    };

    const listing = existingListing
      ? await prisma.trustedProjectListing.update({
          where: { id: existingListing.id },
          data: listingData,
        })
      : await prisma.trustedProjectListing.create({
          data: listingData,
        });

    console.log('OK: organization trusted project seeded');
    console.log(`  userId=${user.id}`);
    console.log(`  email=${user.email}`);
    console.log(`  organizationId=${organization.id}`);
    console.log(`  organizationName=${organization.displayName}`);
    console.log(`  agencyCertId=${agencyCert.id} status=${agencyCert.status}`);
    console.log(`  orgPublishingLevel=${publishingLevel}`);
    console.log(`  listingId=${listing.id}`);
    console.log(`  listingTitle=${listing.title}`);
    console.log(`  listingStatus=${listing.listingStatus}`);
    console.log(`  slotsRemaining=${listing.slotsTotal - listing.slotsFilled}`);
    console.log('');
    console.log('Next:');
    console.log('  1. Hard-refresh /dashboard/trusted-projects');
    console.log('  2. Switch account context to organization in Settings → 身份与权限');
    console.log(`  3. Open listing: /dashboard/trusted-projects/${listing.id}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
