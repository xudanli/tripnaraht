import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  DEFAULT_RISK_CONSTRAINT_BINDINGS,
  resolveBindingsForRisk,
} from '../knowledge/execution-risk-constraint-binding.defaults';
import {
  assertConstraintTemplateIdKnown,
  getConstraintTemplateDef,
  listConstraintTemplateDefs,
} from '../knowledge/execution-risk-constraint-templates';

const CATEGORIES = new Set([
  'TIME',
  'BUDGET',
  'DESTINATION',
  'ACTIVITY',
  'TRANSPORT',
  'ACCOMMODATION',
  'MEMBER',
  'SAFETY',
  'WORLD_STATE',
  'CUSTOM',
]);
const TYPES = new Set(['HARD', 'SOFT', 'EXTERNAL']);
const GATES = new Set(['ALLOW', 'AT_RISK', 'REPLAN_REQUIRED', 'STOP', 'REPLAN']);
const VIOLATIONS = new Set([
  'HARD_SAFETY',
  'HARD_TIME',
  'HARD_BOOKING',
  'HARD_MEMBER',
  'SOFT',
]);

export type ConstraintBindingBody = {
  knowledgeVersionId?: string | null;
  knowledgeCode: string;
  severityLevel?: string | null;
  constraintCategory: string;
  constraintType: string;
  constraintTemplateId: string;
  feasibilityDimension?: string | null;
  executionGate?: string | null;
  violationClass?: string | null;
  blocked?: boolean;
  notesZh?: string | null;
  status?: string;
  priority?: number;
};

@Injectable()
export class ExecutionRiskConstraintBindingService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: {
    knowledgeCode?: string;
    knowledgeVersionId?: string;
    includeGlobal?: boolean;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(200, Math.max(1, query.limit ?? 50));
    const includeGlobal = query.includeGlobal !== false;

    const where: Record<string, unknown> = {};
    if (query.knowledgeCode) where.knowledgeCode = query.knowledgeCode;
    if (query.status) where.status = query.status;
    if (query.knowledgeVersionId) {
      where.OR = includeGlobal
        ? [{ knowledgeVersionId: query.knowledgeVersionId }, { knowledgeVersionId: null }]
        : [{ knowledgeVersionId: query.knowledgeVersionId }];
    } else if (includeGlobal === false) {
      where.knowledgeVersionId = { not: null };
    }

    const [total, rows] = await Promise.all([
      this.prisma.executionRiskConstraintBinding.count({ where: where as never }),
      this.prisma.executionRiskConstraintBinding.findMany({
        where: where as never,
        orderBy: [{ priority: 'asc' }, { knowledgeCode: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      page,
      limit,
      total,
      items: rows.map(mapBinding),
      fieldLabelsZh: FIELD_LABELS_ZH,
    };
  }

  /**
   * 约束模板目录（Admin 下拉真源）
   * 真源：CODE_REGISTRY（execution-risk-constraint-templates.ts）
   * 与运行时 TripConstraint ID / seed-defaults 一致
   */
  async listTemplates(query: {
    q?: string;
    status?: string;
    constraintCategory?: string;
    page?: number;
    limit?: number;
    includeUsageCount?: boolean;
  }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(200, Math.max(1, query.limit ?? 100));
    // status 未传：默认 ENABLED；传 all 则不过滤
    const statusFilter =
      query.status === 'all' || query.status === '*'
        ? null
        : query.status ?? 'ENABLED';
    const filtered = listConstraintTemplateDefs({
      q: query.q,
      status: statusFilter,
      constraintCategory: query.constraintCategory,
    });
    const total = filtered.length;
    const pageItems = filtered.slice((page - 1) * limit, page * limit);

    const usageById = new Map<string, number>();
    if (query.includeUsageCount !== false) {
      const grouped = await this.prisma.executionRiskConstraintBinding.groupBy({
        by: ['constraintTemplateId'],
        _count: { _all: true },
      });
      for (const g of grouped) {
        usageById.set(g.constraintTemplateId, g._count._all);
      }
    }

    return {
      items: pageItems.map((t) => ({
        ...t,
        usageCount: usageById.get(t.id) ?? 0,
      })),
      total,
      page,
      limit,
      sourceOfTruth: 'CODE_REGISTRY' as const,
      sourceNoteZh:
        '模板目录来自代码注册表，与 TripConstraint LEGACY/OFFICIAL ID 及 seed-defaults 同源；运行时 Enrichment/Feasibility/Constraints/Advisory/Apply 消费同一套 id。',
    };
  }

  async getTemplate(templateId: string) {
    const def = getConstraintTemplateDef(templateId);
    if (!def) throw new NotFoundException(`Constraint template ${templateId} not found`);
    const usageCount = await this.prisma.executionRiskConstraintBinding.count({
      where: { constraintTemplateId: templateId },
    });
    return {
      ...def,
      usageCount,
      sourceOfTruth: 'CODE_REGISTRY' as const,
    };
  }

  async get(id: string) {
    const row = await this.prisma.executionRiskConstraintBinding.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException(`Binding ${id} not found`);
    return mapBinding(row);
  }

  async resolve(input: { knowledgeCode: string; severityLevel?: string }) {
    const rows = await this.prisma.executionRiskConstraintBinding.findMany({
      where: {
        knowledgeCode: input.knowledgeCode,
        status: 'ACTIVE',
      },
      orderBy: { priority: 'asc' },
    });
    // 未 seed 时回退默认种子，保证 Feasibility / Enrichment 运行时可解析
    const source =
      rows.length > 0
        ? rows.map((r) => ({
            id: r.id,
            knowledgeCode: r.knowledgeCode,
            severityLevel: r.severityLevel,
            status: r.status,
            priority: r.priority,
            blocked: r.blocked,
            constraintTemplateId: r.constraintTemplateId,
            constraintCategory: r.constraintCategory,
            constraintType: r.constraintType,
            executionGate: r.executionGate,
            violationClass: r.violationClass,
            feasibilityDimension: r.feasibilityDimension,
            notesZh: r.notesZh,
          }))
        : DEFAULT_RISK_CONSTRAINT_BINDINGS.filter(
            (b) => b.knowledgeCode === input.knowledgeCode,
          ).map((b) => ({
            id: b.id,
            knowledgeCode: b.knowledgeCode,
            severityLevel: b.severityLevel,
            status: 'ACTIVE',
            priority: b.priority,
            blocked: b.blocked,
            constraintTemplateId: b.constraintTemplateId,
            constraintCategory: b.constraintCategory,
            constraintType: b.constraintType,
            executionGate: b.executionGate,
            violationClass: b.violationClass,
            feasibilityDimension: b.feasibilityDimension,
            notesZh: b.notesZh,
          }));
    const resolved = resolveBindingsForRisk({
      knowledgeCode: input.knowledgeCode,
      severityLevel: input.severityLevel,
      bindings: source,
    });
    return {
      knowledgeCode: resolved.knowledgeCode,
      severityLevel: resolved.severityLevel,
      anyBlocked: resolved.anyBlocked,
      source: rows.length > 0 ? 'database' : 'defaults',
      bindings: resolved.bindings.map((b) =>
        mapBinding({
          ...b,
          knowledgeVersionId: null,
        }),
      ),
      primary: resolved.primary
        ? mapBinding({
            ...resolved.primary,
            knowledgeVersionId: null,
          })
        : null,
      fieldLabelsZh: FIELD_LABELS_ZH,
    };
  }

  async create(body: ConstraintBindingBody) {
    this.assertBody(body);
    const id = `rcb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`.slice(
      0,
      64,
    );
    const row = await this.prisma.executionRiskConstraintBinding.create({
      data: {
        id,
        knowledgeVersionId: body.knowledgeVersionId ?? null,
        knowledgeCode: body.knowledgeCode.trim(),
        severityLevel: normalizeLevel(body.severityLevel),
        constraintCategory: body.constraintCategory,
        constraintType: body.constraintType,
        constraintTemplateId: body.constraintTemplateId.trim(),
        feasibilityDimension: body.feasibilityDimension ?? null,
        executionGate: normalizeLevel(body.executionGate),
        violationClass: body.violationClass ?? null,
        blocked: body.blocked !== false,
        notesZh: body.notesZh ?? null,
        status: body.status ?? 'ACTIVE',
        priority: body.priority ?? 100,
      },
    });
    return mapBinding(row);
  }

  async put(id: string, body: ConstraintBindingBody) {
    this.assertBody(body);
    await this.require(id);
    const row = await this.prisma.executionRiskConstraintBinding.update({
      where: { id },
      data: {
        knowledgeVersionId: body.knowledgeVersionId ?? null,
        knowledgeCode: body.knowledgeCode.trim(),
        severityLevel: normalizeLevel(body.severityLevel),
        constraintCategory: body.constraintCategory,
        constraintType: body.constraintType,
        constraintTemplateId: body.constraintTemplateId.trim(),
        feasibilityDimension: body.feasibilityDimension ?? null,
        executionGate: normalizeLevel(body.executionGate),
        violationClass: body.violationClass ?? null,
        blocked: body.blocked !== false,
        notesZh: body.notesZh ?? null,
        status: body.status ?? 'ACTIVE',
        priority: body.priority ?? 100,
      },
    });
    return mapBinding(row);
  }

  async patch(id: string, body: Partial<ConstraintBindingBody>) {
    await this.require(id);
    if (body.constraintCategory && !CATEGORIES.has(body.constraintCategory)) {
      throw new BadRequestException(`Invalid constraintCategory: ${body.constraintCategory}`);
    }
    if (body.constraintType && !TYPES.has(body.constraintType)) {
      throw new BadRequestException(`Invalid constraintType: ${body.constraintType}`);
    }
    if (body.constraintTemplateId !== undefined) {
      this.assertTemplateId(body.constraintTemplateId.trim());
    }
    const row = await this.prisma.executionRiskConstraintBinding.update({
      where: { id },
      data: {
        ...(body.knowledgeVersionId !== undefined
          ? { knowledgeVersionId: body.knowledgeVersionId }
          : {}),
        ...(body.knowledgeCode !== undefined
          ? { knowledgeCode: body.knowledgeCode.trim() }
          : {}),
        ...(body.severityLevel !== undefined
          ? { severityLevel: normalizeLevel(body.severityLevel) }
          : {}),
        ...(body.constraintCategory !== undefined
          ? { constraintCategory: body.constraintCategory }
          : {}),
        ...(body.constraintType !== undefined ? { constraintType: body.constraintType } : {}),
        ...(body.constraintTemplateId !== undefined
          ? { constraintTemplateId: body.constraintTemplateId.trim() }
          : {}),
        ...(body.feasibilityDimension !== undefined
          ? { feasibilityDimension: body.feasibilityDimension }
          : {}),
        ...(body.executionGate !== undefined
          ? { executionGate: normalizeLevel(body.executionGate) }
          : {}),
        ...(body.violationClass !== undefined ? { violationClass: body.violationClass } : {}),
        ...(body.blocked !== undefined ? { blocked: body.blocked } : {}),
        ...(body.notesZh !== undefined ? { notesZh: body.notesZh } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
      },
    });
    return mapBinding(row);
  }

  async remove(id: string) {
    await this.require(id);
    await this.prisma.executionRiskConstraintBinding.delete({ where: { id } });
    return { deleted: true, id };
  }

  /** 导入默认种子（全局）；已存在 id 则跳过 */
  async seedDefaults() {
    let created = 0;
    let skipped = 0;
    for (const seed of DEFAULT_RISK_CONSTRAINT_BINDINGS) {
      this.assertTemplateId(seed.constraintTemplateId);
      const existing = await this.prisma.executionRiskConstraintBinding.findUnique({
        where: { id: seed.id },
      });
      if (existing) {
        skipped += 1;
        continue;
      }
      await this.prisma.executionRiskConstraintBinding.create({
        data: {
          id: seed.id,
          knowledgeVersionId: null,
          knowledgeCode: seed.knowledgeCode,
          severityLevel: seed.severityLevel,
          constraintCategory: seed.constraintCategory,
          constraintType: seed.constraintType,
          constraintTemplateId: seed.constraintTemplateId,
          feasibilityDimension: seed.feasibilityDimension,
          executionGate: seed.executionGate,
          violationClass: seed.violationClass,
          blocked: seed.blocked,
          notesZh: seed.notesZh,
          status: 'ACTIVE',
          priority: seed.priority,
        },
      });
      created += 1;
    }
    return {
      created,
      skipped,
      totalDefaults: DEFAULT_RISK_CONSTRAINT_BINDINGS.length,
      fieldLabelsZh: FIELD_LABELS_ZH,
    };
  }

  private async require(id: string) {
    const row = await this.prisma.executionRiskConstraintBinding.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException(`Binding ${id} not found`);
    return row;
  }

  private assertTemplateId(id: string) {
    try {
      assertConstraintTemplateIdKnown(id);
    } catch {
      throw new BadRequestException(
        `constraintTemplateId "${id}" is not in templates catalog (GET .../constraint-bindings/templates)`,
      );
    }
  }

  private assertBody(body: ConstraintBindingBody) {
    if (!body.knowledgeCode?.trim()) throw new BadRequestException('knowledgeCode is required');
    if (!body.constraintTemplateId?.trim()) {
      throw new BadRequestException('constraintTemplateId is required');
    }
    this.assertTemplateId(body.constraintTemplateId.trim());
    if (!CATEGORIES.has(body.constraintCategory)) {
      throw new BadRequestException(`Invalid constraintCategory: ${body.constraintCategory}`);
    }
    if (!TYPES.has(body.constraintType)) {
      throw new BadRequestException(`Invalid constraintType: ${body.constraintType}`);
    }
    if (body.executionGate && !GATES.has(body.executionGate) && body.executionGate !== 'REPLAN') {
      throw new BadRequestException(`Invalid executionGate: ${body.executionGate}`);
    }
    if (body.violationClass && !VIOLATIONS.has(body.violationClass)) {
      throw new BadRequestException(`Invalid violationClass: ${body.violationClass}`);
    }
  }
}

function normalizeLevel(level?: string | null): string | null {
  if (level == null || level === '') return null;
  if (level === 'REPLAN') return 'REPLAN_REQUIRED';
  return level;
}

function mapBinding(row: {
  id: string;
  knowledgeVersionId: string | null;
  knowledgeCode: string;
  severityLevel: string | null;
  constraintCategory: string;
  constraintType: string;
  constraintTemplateId: string;
  feasibilityDimension: string | null;
  executionGate: string | null;
  violationClass: string | null;
  blocked: boolean;
  notesZh: string | null;
  status: string;
  priority: number;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    id: row.id,
    knowledgeVersionId: row.knowledgeVersionId,
    knowledgeCode: row.knowledgeCode,
    severityLevel: row.severityLevel,
    constraintCategory: row.constraintCategory,
    constraintType: row.constraintType,
    constraintTemplateId: row.constraintTemplateId,
    feasibilityDimension: row.feasibilityDimension,
    executionGate: row.executionGate,
    violationClass: row.violationClass,
    blocked: row.blocked,
    notesZh: row.notesZh,
    status: row.status,
    priority: row.priority,
    createdAt: row.createdAt?.toISOString?.() ?? undefined,
    updatedAt: row.updatedAt?.toISOString?.() ?? undefined,
    // 中文展示别名（表格列）
    riskCode: row.knowledgeCode,
    constraintCategoryZh: CATEGORY_ZH[row.constraintCategory] ?? row.constraintCategory,
    constraintTypeZh: TYPE_ZH[row.constraintType] ?? row.constraintType,
    executionGateZh: GATE_ZH[row.executionGate ?? ''] ?? row.executionGate,
    violationClassZh: VIOLATION_ZH[row.violationClass ?? ''] ?? row.violationClass,
    blockedZh: row.blocked ? '硬阻断' : '仅警告',
  };
}

const CATEGORY_ZH: Record<string, string> = {
  TIME: '时间',
  BUDGET: '预算',
  DESTINATION: '目的地',
  ACTIVITY: '活动',
  TRANSPORT: '交通',
  ACCOMMODATION: '住宿',
  MEMBER: '成员',
  SAFETY: '安全',
  WORLD_STATE: '世界态',
  CUSTOM: '自定义',
};

const TYPE_ZH: Record<string, string> = {
  HARD: '硬约束',
  SOFT: '软约束',
  EXTERNAL: '外部/官方约束',
};

const GATE_ZH: Record<string, string> = {
  AT_RISK: '有风险',
  REPLAN_REQUIRED: '需改线',
  STOP: '停止',
  ALLOW: '允许',
};

const VIOLATION_ZH: Record<string, string> = {
  HARD_SAFETY: '硬安全',
  HARD_TIME: '硬时间',
  HARD_BOOKING: '硬预订',
  HARD_MEMBER: '硬成员',
  SOFT: '软约束',
};

export const FIELD_LABELS_ZH: Record<string, { labelZh: string; meaningZh: string }> = {
  id: { labelZh: '绑定 ID', meaningZh: '风险-约束映射主键' },
  knowledgeCode: { labelZh: '风险知识编码', meaningZh: '如 ENV-WIND-01' },
  riskCode: { labelZh: '风险编码', meaningZh: '同 knowledgeCode，便于表格对齐研究表' },
  severityLevel: {
    labelZh: '触发门禁级别',
    meaningZh: '仅当风险达到该级别时启用；空=任意级别',
  },
  constraintCategory: { labelZh: '约束类别', meaningZh: '时间/安全/交通/成员/世界态等' },
  constraintCategoryZh: { labelZh: '约束类别（中文）', meaningZh: '类别中文展示' },
  constraintType: { labelZh: '约束软硬', meaningZh: 'HARD / SOFT / EXTERNAL' },
  constraintTypeZh: { labelZh: '约束软硬（中文）', meaningZh: '硬/软/外部' },
  constraintTemplateId: {
    labelZh: '约束模板 ID',
    meaningZh: '对齐 TripConstraint 合成 ID，如 c_official_is_wind_safety',
  },
  feasibilityDimension: {
    labelZh: '可行性维度',
    meaningZh: 'environment / schedule / transport / booking / team_fit…',
  },
  executionGate: { labelZh: '执行门禁', meaningZh: '建议对齐的 AT_RISK / REPLAN_REQUIRED / STOP' },
  executionGateZh: { labelZh: '执行门禁（中文）', meaningZh: '门禁中文' },
  violationClass: {
    labelZh: '违反类别',
    meaningZh: 'HARD_SAFETY / HARD_TIME / HARD_BOOKING / HARD_MEMBER / SOFT',
  },
  violationClassZh: { labelZh: '违反类别（中文）', meaningZh: '违反类别中文' },
  blocked: { labelZh: '是否硬阻断', meaningZh: 'true=方案不可行；false=仅警告' },
  blockedZh: { labelZh: '阻断说明', meaningZh: '硬阻断 / 仅警告' },
  notesZh: { labelZh: '中文备注', meaningZh: '运营可读的映射说明' },
  status: { labelZh: '状态', meaningZh: 'ACTIVE / DISABLED / DRAFT' },
  priority: { labelZh: '优先级', meaningZh: '数字越小越优先' },
  knowledgeVersionId: {
    labelZh: '知识版本',
    meaningZh: '空=全局目录；有值=随知识版本级联',
  },
};
