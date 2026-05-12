import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { WorldFactAppendInput } from './world-fact.types';

@Injectable()
export class WorldFactRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findLatestIdByFactKey(factKey: string): Promise<string | null> {
    const row = await this.prisma.worldFact.findFirst({
      where: { factKey },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  async append(input: WorldFactAppendInput & { supersedesFactId?: string | null }) {
    return this.prisma.worldFact.create({
      data: {
        factKey: input.factKey,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        predicate: input.predicate,
        valueJson: input.valueJson as object,
        confidence: input.confidence ?? undefined,
        severity: input.severity ?? undefined,
        sourceType: input.sourceType,
        sourceRef: input.sourceRef ?? undefined,
        validFrom: input.validFrom ?? undefined,
        validTo: input.validTo ?? undefined,
        observedAt: input.observedAt ?? undefined,
        snapshotVersion: input.snapshotVersion ?? undefined,
        supersedesFactId: input.supersedesFactId ?? undefined,
      },
    });
  }

  async findLatestBySubjectPredicate(subjectType: string, subjectId: string, predicate: string) {
    return this.prisma.worldFact.findFirst({
      where: { subjectType, subjectId, predicate },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** 按 factKey 取当前链头（最新一行）；读取请优先走 {@link WorldFactResolverService} */
  async findLatestRowByFactKey(factKey: string) {
    return this.prisma.worldFact.findFirst({
      where: { factKey },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** 同一时间键下的版本链（审计 / Explainability）；不含其它 factKey */
  async findHistoryByFactKey(factKey: string, limit = 50) {
    return this.prisma.worldFact.findMany({
      where: { factKey },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }
}
