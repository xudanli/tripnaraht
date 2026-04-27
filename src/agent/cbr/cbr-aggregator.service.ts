import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { auditReportToCaseRecord } from './case-extractor.util';
import { upsertCbrCaseAggregateFromRecord } from './cbr-case-aggregate-persist.util';
import type { PhysicalConflictAuditReport } from '../utils/terminal-audit-report.generator';

/**
 * CBR 在线聚合：将审计报告中的 gold 判例异步回刷到 DB，与 LocalCaseStore 内存层形成双写飞轮。
 */
@Injectable()
export class CbrAggregatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * 从 terminal audit_report 抽取 gold CaseRecord 并做 delta upsert（仅 is_gold_sample 时有数据）。
   */
  async ingestAuditReport(audit_report: PhysicalConflictAuditReport, request_id?: string): Promise<void> {
    const gate =
      this.configService.get<string>('CBR_DB_INGEST') ??
      process.env.CBR_DB_INGEST ??
      'true';
    if (!(gate === 'true' || gate === '1')) return;

    const rec = auditReportToCaseRecord({ audit_report, request_id });
    if (!rec) return;
    await upsertCbrCaseAggregateFromRecord(this.prisma, rec);
  }
}
