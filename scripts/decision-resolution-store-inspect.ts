import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const tripId = process.argv[2] ?? '510d95ce-7cc4-4a07-8aba-2d4694451a3c';
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { metadata: true },
  });
  const store = (trip?.metadata as Record<string, unknown>)?.decisionProblemResolutions as
    | { byProblemId?: Record<string, unknown> }
    | undefined;
  console.log(JSON.stringify(store?.byProblemId ?? {}, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
