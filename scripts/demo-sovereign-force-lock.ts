/**
 * PRD 3.15 — Danny Laugavegur 帖 force-lock preview/commit 联调
 *
 * 用法：npx tsx scripts/demo-sovereign-force-lock.ts
 * 可选：SKIP_COMMIT=1 仅 preview；POST_ID=uuid 指定帖
 */
import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';
import jwt from 'jsonwebtoken';

const DANNY_EMAIL = '2293028143@qq.com';
const DANNY_ID = '5872f534-4fdf-483d-9e5a-464d3f36935d';
const BASE = process.env.API_BASE ?? 'http://127.0.0.1:3000';
const JWT_SECRET = process.env.JWT_SECRET ?? 'tripnara-dev-secret-key';

async function issueToken(userId: string, email: string): Promise<string> {
  return jwt.sign({ sub: userId, userId, email }, JWT_SECRET, { expiresIn: '1h' });
}

async function api<T>(
  method: string,
  path: string,
  token: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: T | null; raw: string }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const raw = await res.text();
  let data: T | null = null;
  try {
    data = JSON.parse(raw) as T;
  } catch {
    /* non-json */
  }
  return { ok: res.ok, status: res.status, data, raw };
}

async function ensureApprovedMember(prisma: PrismaClient, postId: string, captainId: string) {
  const approved = await prisma.matchSquareRecruitmentApplication.count({
    where: { postId, status: 'approved' },
  });
  if (approved >= 1) {
    console.log(`· 已有 ${approved} 名已通过队员`);
    return;
  }

  const member = await prisma.user.findFirst({
    where: { email: { not: DANNY_EMAIL }, id: { not: captainId } },
    orderBy: { createdAt: 'asc' },
  });
  if (!member) throw new Error('无可用队员账号，请先 seed 阿音等 demo 用户');

  const travel = await prisma.userTravelProfile.findUnique({ where: { userId: member.id } });
  const ext = (travel?.extendedProfile as Record<string, unknown> | null) ?? {};
  const intake = ext.odyssey_intake as { mbtiType?: string; card?: { title?: string } } | undefined;

  await prisma.matchSquareRecruitmentApplication.create({
    data: {
      postId,
      applicantUserId: member.id,
      status: 'approved',
      message: 'demo force-lock 已通过队员',
      planningCommitmentAccepted: true,
      teamworkCommitmentAccepted: true,
      applicantDisplayName: member.displayName ?? member.email ?? 'Demo Member',
      applicantMbtiType: intake?.mbtiType ?? 'ISTJ',
      applicantCardTitle: intake?.card?.title ?? '重装后勤型',
      applicantInteractionMode: 'steady_companion',
      applicantPersonaSnapshot: { demo: true } as Prisma.InputJsonValue,
      compatibilityPercent: 82,
      targetSlotIndex: 0,
      targetSlotLabel: '建议补位 · 重装后勤',
      decidedAt: new Date(),
    },
  });

  await prisma.matchSquareRecruitmentPost.update({
    where: { id: postId },
    data: { slotsFilled: 1 },
  });

  console.log(`✓ 已注入 demo 已通过队员 ${member.email} (${member.id})，slotsFilled=1`);
}

async function main() {
  const prisma = new PrismaClient();
  const skipCommit = process.env.SKIP_COMMIT === '1';

  try {
    const danny = await prisma.user.findUnique({ where: { email: DANNY_EMAIL } });
    if (!danny) throw new Error(`Danny not found: ${DANNY_EMAIL}`);

    let postId = process.env.POST_ID?.trim();
    if (!postId) {
      const post = await prisma.matchSquareRecruitmentPost.findFirst({
        where: {
          captainUserId: danny.id,
          status: 'active',
          destination: { contains: '冰岛' },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!post) throw new Error('无 active 冰岛帖，请先运行 seed-match-square-laugavegur-demo.ts');
      postId = post.id;
    }

    const post = await prisma.matchSquareRecruitmentPost.findUnique({ where: { id: postId } });
    if (!post) throw new Error(`Post not found: ${postId}`);
    if (post.captainUserId !== danny.id) throw new Error('指定帖非 Danny 队长帖');

    console.log('=== Sovereign Force Lock Demo ===\n');
    console.log(`postId:      ${postId}`);
    console.log(`status:      ${post.status}`);
    console.log(`slots:       ${post.slotsFilled}/${post.slotsNeeded}`);
    console.log(`destination: ${post.destination}\n`);

    if (post.status !== 'active') {
      const snap = post.captainPersonaSnapshot as Record<string, unknown> | null;
      if (snap?._sovereignForceLock_v1) {
        console.log('· 该帖已 force-lock，展示 snapshot:');
        console.log(JSON.stringify(snap._sovereignForceLock_v1, null, 2));
      } else {
        console.log('· 帖非 active，跳过 commit');
      }
    } else {
      await ensureApprovedMember(prisma, postId, danny.id);
    }

    const token = await issueToken(danny.id, DANNY_EMAIL);

    console.log('\n--- GET force-lock/preview ---');
    const previewRes = await api<{ success: boolean; data: Record<string, unknown> }>(
      'GET',
      `/api/match-square/posts/${postId}/force-lock/preview`,
      token,
    );
    console.log(`HTTP ${previewRes.status}`);
    if (previewRes.data?.success && previewRes.data.data) {
      const p = previewRes.data.data;
      console.log(JSON.stringify(p, null, 2));
    } else {
      console.log(previewRes.raw);
      if (!previewRes.ok) process.exit(1);
    }

    const canForceLock = Boolean(
      previewRes.data?.success &&
        (previewRes.data.data as { canForceLock?: boolean })?.canForceLock,
    );

    if (!skipCommit && canForceLock && post.status === 'active') {
      console.log('\n--- POST force-lock ---');
      const commitRes = await api<{ success: boolean; data: Record<string, unknown> }>(
        'POST',
        `/api/match-square/posts/${postId}/force-lock`,
        token,
        { note: 'demo 联调 — 核心队员已到，强制锁团', skipInstantiate: false },
      );
      console.log(`HTTP ${commitRes.status}`);
      if (commitRes.data?.success && commitRes.data.data) {
        console.log(JSON.stringify(commitRes.data.data, null, 2));
      } else {
        console.log(commitRes.raw);
        if (!commitRes.ok) process.exit(1);
      }

      console.log('\n--- GET post detail (sovereignLock) ---');
      const detailRes = await api<{ success: boolean; data: { post: Record<string, unknown> } }>(
        'GET',
        `/api/match-square/posts/${postId}`,
        token,
      );
      if (detailRes.data?.success) {
        const sovereignLock = detailRes.data.data.post.sovereignLock;
        console.log('sovereignLock:', JSON.stringify(sovereignLock, null, 2));
        console.log('status:', detailRes.data.data.post.status);
        console.log('slots:', detailRes.data.data.post.slotsFilled, '/', detailRes.data.data.post.slotsNeeded);
      } else {
        console.log(detailRes.raw);
      }
    } else if (skipCommit) {
      console.log('\n· SKIP_COMMIT=1，跳过 POST force-lock');
    } else if (!canForceLock) {
      console.log('\n· canForceLock=false，跳过 commit');
    }

    console.log('\n✓ Demo 完成');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
