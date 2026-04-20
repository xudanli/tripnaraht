import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma.service';

type TableCheck = { table: string; reason: string };

@Injectable()
export class AiNativePersistenceHealthService implements OnModuleInit {
  private readonly logger = new Logger(AiNativePersistenceHealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const mode =
      this.config.get<string>('AI_NATIVE_PERSISTENCE_MODE') ??
      process.env.AI_NATIVE_PERSISTENCE_MODE ??
      'warn';

    // Modes:
    // - "off": never enforce
    // - "warn": log warnings only
    // - "require": hard fail if DB/tables missing
    //
    // Defaulting to warn keeps dev/test ergonomics; production should set "require".
    const enforce = mode === 'require';
    if (mode === 'off') return;

    // If Prisma intentionally skipped connection (dev/MCP), don't block unless explicitly required.
    const connected = this.prisma.isDbConnected();
    if (!connected) {
      const msg =
        '[AI-Native Persistence] Prisma is not connected. ' +
        'Replay/RLHF persistence will be memory-only. ' +
        'Set DATABASE_URL and ensure migrations are applied.';
      if (enforce) throw new Error(msg);
      this.logger.warn(msg);
      return;
    }

    const requiredTables: TableCheck[] = [
      { table: 'decision_snapshots', reason: 'Decision Replay snapshots persistence' },
      { table: 'decision_timelines', reason: 'Decision Replay timelines persistence' },
      { table: 'rlhf_behavior_signals', reason: 'Behavior signals persistence' },
      { table: 'rlhf_feedback_signals', reason: 'Feedback/outcome capture persistence' },
      { table: 'rlhf_execution_signals', reason: 'Execution deviation persistence' },
    ];

    const missing = await this.findMissingTables(requiredTables.map((t) => t.table));
    if (missing.length === 0) {
      this.logger.log('[AI-Native Persistence] OK: required tables exist');
      return;
    }

    const detail = missing
      .map((name) => {
        const why = requiredTables.find((t) => t.table === name)?.reason ?? 'required';
        return `${name} (${why})`;
      })
      .join(', ');

    const msg =
      `[AI-Native Persistence] Missing required DB tables: ${detail}. ` +
      'Apply migrations (see prisma/migrations/add_ai_native_decision_tables.sql).';

    if (enforce) throw new Error(msg);
    this.logger.warn(msg);
  }

  private async findMissingTables(tables: string[]): Promise<string[]> {
    const missing: string[] = [];
    for (const t of tables) {
      try {
        // to_regclass returns null when relation does not exist.
        const rows = (await this.prisma.$queryRaw<
          Array<{ regclass: string | null }>
        >`SELECT to_regclass(${`public.${t}`}) as regclass`) as Array<{ regclass: string | null }>;
        const ok = rows?.[0]?.regclass;
        if (!ok) missing.push(t);
      } catch (e: unknown) {
        // If we can't query catalog, treat as missing and let caller decide enforce/warn.
        missing.push(t);
      }
    }
    return missing;
  }
}

