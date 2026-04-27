/**
 * Upsert a staff user for `/api/admin/auth/login`.
 *
 * Required env:
 *   ADMIN_SEED_EMAIL
 *   ADMIN_SEED_PASSWORD   (min 8 chars; bcrypt-stored)
 *
 * Optional:
 *   ADMIN_SEED_DISPLAY_NAME  (default: Admin)
 *   ADMIN_SEED_ROLE          ADMIN | OPERATOR (default: ADMIN)
 *
 * Usage:
 *   npx tsx scripts/seed-admin-platform-user.ts
 *
 * Or one-shot (no .env edit):
 *   ADMIN_SEED_EMAIL=you@co.com ADMIN_SEED_PASSWORD='8+chars!' npm run seed:admin
 */
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

// Load project root `.env` even if cwd differs
loadEnv({ path: path.resolve(__dirname, '..', '.env') });

async function main() {
  const email = process.env.ADMIN_SEED_EMAIL?.trim();
  const password = process.env.ADMIN_SEED_PASSWORD;
  const displayName = process.env.ADMIN_SEED_DISPLAY_NAME?.trim() || 'Admin';
  const roleRaw = (process.env.ADMIN_SEED_ROLE || 'ADMIN').trim().toUpperCase();
  const platformRole = roleRaw === 'OPERATOR' ? 'OPERATOR' : 'ADMIN';

  if (!email || !password) {
    console.error('Missing ADMIN_SEED_EMAIL or ADMIN_SEED_PASSWORD');
    console.error('');
    console.error('Option A — add to project root `.env`:');
    console.error('  ADMIN_SEED_EMAIL=you@company.com');
    console.error('  ADMIN_SEED_PASSWORD=your-long-secret');
    console.error('');
    console.error('Option B — pass only for this run:');
    console.error(
      "  ADMIN_SEED_EMAIL=you@company.com ADMIN_SEED_PASSWORD='at-least-8-chars!' npm run seed:admin",
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('ADMIN_SEED_PASSWORD must be at least 8 characters');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        emailVerified: true,
        displayName,
        googleSub: null,
        avatarUrl: null,
        platformRole,
        passwordHash,
      },
      update: {
        displayName,
        platformRole,
        passwordHash,
        emailVerified: true,
      },
    });

    await prisma.userProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        preferences: null,
        updatedAt: new Date(),
      } as any,
    });

    console.log(`OK: staff user upserted id=${user.id} email=${user.email} platformRole=${user.platformRole}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
