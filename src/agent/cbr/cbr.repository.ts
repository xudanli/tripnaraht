import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Prisma `CbrCaseAggregate` 行（用于预加载映射；显式结构避免部分 TS 配置下模型类型重导出缺失）。
 */
export interface CbrCaseAggregateRow {
  conflictType: string;
  primaryViolationType: string | null;
  regionId: string | null;
  month: number | null;
  relaxationTypesJson: unknown;
  totalCount: number;
  lateAcceptCount: number;
  avgWallHitLatencyMs: number | null;
  avgWallHitEventSpan: number | null;
  evidenceAnchors: unknown;
  updatedAt: Date;
}

/**
 * 判例库（CBR）持久层：与 `CbrCaseAggregate` / export 脚本中的聚合语义对齐。
 */
@Injectable()
export class CbrRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 高置信度判例：用于启动时温加载到 LocalCaseStore（避免长尾撑爆内存）。
   */
  async findAggregatesWithMinTotalCount(input: { minTotalCount: number; take?: number }): Promise<CbrCaseAggregateRow[]> {
    const take = Math.min(Math.max(1, input.take ?? 5000), 50_000);
    const rows = await this.prisma.cbrCaseAggregate.findMany({
      where: { totalCount: { gte: input.minTotalCount } },
      orderBy: [{ totalCount: 'desc' }, { updatedAt: 'desc' }],
      take,
    });
    return rows as CbrCaseAggregateRow[];
  }
}
