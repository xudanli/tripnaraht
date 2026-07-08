import type { PrismaService } from '../../../prisma/prisma.service';
import { resolveTravelerNationality } from '../../../countries/utils/resolve-traveler-nationality.util';

/** Materialize / Ontology ingest — 从 UserProfile.preferences 解析护照国籍 */
export async function loadTravelerNationalityForExploration(
  prisma: PrismaService,
  userId: string,
): Promise<string | undefined> {
  try {
    const row = await prisma.userProfile.findUnique({
      where: { userId },
      select: { preferences: true },
    });
    return resolveTravelerNationality({
      userProfilePreferences: row?.preferences,
    });
  } catch {
    return undefined;
  }
}
