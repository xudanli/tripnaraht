import { randomUUID } from 'crypto';

export type Row = Record<string, unknown>;

export const GATE1_E2E_IDS = {
  advisor: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  ops: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  analyst: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  intruder: 'dddddddd-dddd-4ddd-8ddd-ddddddddddddd',
  org: '33333333-3333-4333-8333-333333333333',
  orgAdmin: '44444444-4444-4444-8444-444444444444',
} as const;

function clone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map((item) => clone(item)) as T;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    out[key] = clone(entry);
  }
  return out as T;
}

function matchesWhere(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, expected]) => {
    if (key === 'OR' && Array.isArray(expected)) {
      return expected.some((clause) => matchesWhere(row, clause as Row));
    }
    if (key === 'NOT' && expected && typeof expected === 'object') {
      return !matchesWhere(row, expected as Row);
    }
    if (expected === null) return row[key] == null;
    if (expected && typeof expected === 'object' && !Array.isArray(expected) && !(expected instanceof Date)) {
      const obj = expected as Row;
      if ('in' in obj) return (obj.in as unknown[]).includes(row[key]);
      if ('notIn' in obj) return !(obj.notIn as unknown[]).includes(row[key]);
      if ('gte' in obj) {
        const value = row[key];
        if (value instanceof Date && obj.gte instanceof Date) return value.getTime() >= obj.gte.getTime();
        return (value as number) >= (obj.gte as number);
      }
      if ('gt' in obj) {
        const value = row[key];
        if (value instanceof Date && obj.gt instanceof Date) return value.getTime() > obj.gt.getTime();
        return String(value) > String(obj.gt);
      }
      if ('lt' in obj) {
        const value = row[key];
        if (value instanceof Date && obj.lt instanceof Date) return value.getTime() < obj.lt.getTime();
        return (value as number) < (obj.lt as number);
      }
      if ('lte' in obj) {
        const value = row[key];
        if (value instanceof Date && obj.lte instanceof Date) return value.getTime() <= obj.lte.getTime();
        return (value as number) <= (obj.lte as number);
      }
      if ('contains' in obj) {
        return String(row[key]).toLowerCase().includes(String(obj.contains).toLowerCase());
      }
      if ('mode' in obj) return matchesWhere(row, { [key]: obj.contains });
      if ('path' in obj && 'equals' in obj) return true;
    }
    return row[key] === expected;
  });
}

function sortRows(rows: Row[], orderBy?: Row | Row[]): Row[] {
  if (!orderBy) return rows;
  const clauses = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const clause of clauses) {
      const [field, direction] = Object.entries(clause)[0] ?? [];
      if (!field) continue;
      const av = a[field];
      const bv = b[field];
      if (av === bv) continue;
      const cmp =
        av instanceof Date && bv instanceof Date
          ? av.getTime() - bv.getTime()
          : String(av).localeCompare(String(bv));
      return direction === 'desc' ? -cmp : cmp;
    }
    return 0;
  });
}

function takeRows(rows: Row[], args?: { skip?: number; take?: number }): Row[] {
  const skip = args?.skip ?? 0;
  const take = args?.take ?? rows.length;
  return rows.slice(skip, skip + take);
}

export class Gate1MemoryStore {
  readonly tables: Record<string, Row[]> = {
    gate1Projects: [],
    gate1ExperimentBaselines: [],
    gate1Participants: [],
    gate1PrivateConstraints: [],
    gate1SanitizedConstraints: [],
    gate1PrivacyAnalystAssignments: [],
    gate1ConflictReports: [],
    gate1ConflictFindings: [],
    gate1CandidateStrategies: [],
    gate1AdvisorDecisions: [],
    gate1ManualWorkLogs: [],
    gate1AccessAuditLogs: [],
    gate1AnalyticsEvents: [],
    gate1ReadinessReports: [],
    gate1ReadinessFindings: [],
    gate1PlanBs: [],
    gate1ProjectOutcomes: [],
    gate1NotificationOutbox: [],
    gate1ProposalFeedbacks: [],
    gate1ParticipantFeedbacks: [],
    organizationMembers: [],
  };

  seedActors() {
    this.tables.organizationMembers.push({
      id: randomUUID(),
      organizationId: GATE1_E2E_IDS.org,
      userId: GATE1_E2E_IDS.orgAdmin,
      roles: ['OWNER', 'AGENCY_ADMIN'],
      status: 'ACTIVE',
    });
  }

  findMany(table: string, args: { where?: Row; orderBy?: Row | Row[]; take?: number; skip?: number; select?: Row; include?: Row } = {}) {
    const where = this.normalizeWhere(table, args.where);
    let rows = this.tables[table].filter((row) => matchesWhere(row, where));
    rows = takeRows(sortRows(rows, args.orderBy), args);
    if (args.select) {
      rows = rows.map((row) => {
        const picked: Row = {};
        for (const key of Object.keys(args.select!)) {
          if (args.select![key]) picked[key] = row[key];
        }
        return picked;
      });
    }
    return rows.map((row) => {
      const cloned = clone(row);
      return args.include ? this.enrich(table, cloned, args.include) : cloned;
    });
  }

  private normalizeWhere(table: string, where?: Row): Row | undefined {
    if (!where) return where;
    if (table === 'gate1PrivateConstraints' && where.participant && typeof where.participant === 'object') {
      const projectId = (where.participant as Row).projectId;
      const participantIds = this.tables.gate1Participants
        .filter((p) => p.projectId === projectId)
        .map((p) => p.id);
      const { participant, ...rest } = where;
      return { ...rest, participantId: { in: participantIds } };
    }
    if (table === 'gate1Participants' && where.projectId) {
      return where;
    }
    return where;
  }

  findFirst(table: string, args: { where?: Row; orderBy?: Row | Row[]; include?: Row } = {}) {
    const row = this.findMany(table, args)[0] ?? null;
    if (!row) return null;
    return args.include ? this.enrich(table, row, args.include) : row;
  }

  findUnique(table: string, args: { where: Row; include?: Row }) {
    const where = args.where;
    let row: Row | undefined;
    if ('id' in where) {
      row = this.tables[table].find((r) => r.id === where.id);
    } else if ('inviteToken' in where) {
      row = this.tables[table].find((r) => r.inviteToken === where.inviteToken);
    } else if ('projectId' in where && Object.keys(where).length === 1) {
      row = this.tables[table].find((r) => r.projectId === where.projectId);
    } else if ('projectId_version' in where) {
      const c = where.projectId_version as Row;
      row = this.tables[table].find((r) => r.projectId === c.projectId && r.version === c.version);
    } else if ('eventType_dedupeKey' in where) {
      const c = where.eventType_dedupeKey as Row;
      row = this.tables[table].find(
        (r) => r.eventType === c.eventType && r.dedupeKey === c.dedupeKey,
      );
    } else if ('organizationId_userId' in where) {
      const c = where.organizationId_userId as Row;
      row = this.tables[table].find(
        (r) => r.organizationId === c.organizationId && r.userId === c.userId,
      );
    }
    if (!row) return null;
    const cloned = clone(row);
    return args.include ? this.enrich(table, cloned, args.include) : cloned;
  }

  count(table: string, args: { where?: Row } = {}) {
    return this.findMany(table, args).length;
  }

  create(table: string, args: { data: Row; include?: Row }) {
    const now = new Date();
    const row: Row = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      ...args.data,
    };
    const data = args.data as Row;
    if (data.findings && typeof data.findings === 'object' && 'create' in (data.findings as Row)) {
      const nested = data.findings as { create: Row[] };
      delete row.findings;
      this.tables[table].push(row);
      for (const f of nested.create) {
        this.create('gate1ConflictFindings', {
          data: { ...f, reportId: row.id },
        });
      }
      return args.include ? this.enrich(table, clone(row), args.include) : clone(row);
    }
    this.tables[table].push(row);
    const cloned = clone(row);
    return args.include ? this.enrich(table, cloned, args.include) : cloned;
  }

  createMany(table: string, args: { data: Row[] }) {
    for (const data of args.data) this.create(table, { data });
    return { count: args.data.length };
  }

  update(table: string, args: { where: { id: string }; data: Row; include?: Row }) {
    const index = this.tables[table].findIndex((row) => row.id === args.where.id);
    if (index < 0) throw new Error(`Row not found in ${table}`);
    this.tables[table][index] = {
      ...this.tables[table][index],
      ...args.data,
      updatedAt: new Date(),
    };
    const row = clone(this.tables[table][index]);
    return args.include ? this.enrich(table, row, args.include) : row;
  }

  updateMany(table: string, args: { where?: Row; data: Row }) {
    let count = 0;
    for (const row of this.tables[table]) {
      if (matchesWhere(row, args.where)) {
        Object.assign(row, args.data, { updatedAt: new Date() });
        count += 1;
      }
    }
    return { count };
  }

  deleteMany(table: string, args: { where?: Row } = {}) {
    const before = this.tables[table].length;
    this.tables[table] = this.tables[table].filter((row) => !matchesWhere(row, args.where));
    return { count: before - this.tables[table].length };
  }

  upsert(table: string, args: { where: Row; create: Row; update: Row }) {
    const existing = this.findUnique(table, { where: args.where });
    if (existing) {
      return this.update(table, { where: { id: existing.id as string }, data: args.update });
    }
    return this.create(table, { data: { ...args.create, ...('projectId' in args.where ? { projectId: args.where.projectId } : {}) } });
  }

  enrich(table: string, row: Row, include: Row): Row {
    const enriched = { ...row };
    if (include.report && row.reportId) {
      enriched.report = this.findUnique('gate1ConflictReports', { where: { id: row.reportId } })
        ?? this.findUnique('gate1ReadinessReports', { where: { id: row.reportId } });
    }
    if (include.findings && row.id) {
      if (table === 'gate1ConflictReports') {
        enriched.findings = this.findMany('gate1ConflictFindings', {
          where: { reportId: row.id },
          orderBy: { sortOrder: 'asc' },
        });
      }
      if (table === 'gate1ReadinessReports') {
        enriched.findings = this.findMany('gate1ReadinessFindings', {
          where: { reportId: row.id },
          orderBy: { sortOrder: 'asc' },
        });
      }
    }
    if (include.project && row.projectId) {
      const project = this.findUnique('gate1Projects', { where: { id: row.projectId } });
      if (include.project === true) {
        enriched.project = project;
      } else if (typeof include.project === 'object') {
        const select = (include.project as { select?: Row }).select;
        if (select && project) {
          const picked: Row = {};
          for (const key of Object.keys(select)) {
            if (select[key]) picked[key] = project[key];
          }
          enriched.project = picked;
        }
      }
    }
    if (include.participant && row.participantId) {
      const participant = this.findUnique('gate1Participants', { where: { id: row.participantId } });
      if (include.participant === true) {
        enriched.participant = participant;
      } else if (include.participant && typeof include.participant === 'object') {
        const select = (include.participant as { select?: Row }).select;
        if (select && participant) {
          const picked: Row = {};
          for (const key of Object.keys(select)) {
            if (select[key]) picked[key] = participant[key];
          }
          enriched.participant = picked;
        }
      }
    }
    if (include.selectedCandidate && row.selectedCandidateId) {
      enriched.selectedCandidate = this.findUnique('gate1CandidateStrategies', {
        where: { id: row.selectedCandidateId },
      });
    }
    if (include.participants && table === 'gate1Projects' && row.id) {
      enriched.participants = this.findMany('gate1Participants', { where: { projectId: row.id } });
    }
    if (include.decisions && table === 'gate1Projects' && row.id) {
      enriched.decisions = this.findMany('gate1AdvisorDecisions', { where: { projectId: row.id } });
    }
    if (include.manualWorkLogs && table === 'gate1Projects' && row.id) {
      enriched.manualWorkLogs = this.findMany('gate1ManualWorkLogs', { where: { projectId: row.id } });
    }
    if (include.outcome && table === 'gate1Projects' && row.id) {
      enriched.outcome = this.findUnique('gate1ProjectOutcomes', { where: { projectId: row.id } });
    }
    if (include.readinessReports && table === 'gate1Projects' && row.id) {
      const spec = include.readinessReports as Row | boolean;
      const extraWhere =
        spec && typeof spec === 'object' && spec.where ? (spec.where as Row) : {};
      enriched.readinessReports = this.findMany('gate1ReadinessReports', {
        where: { projectId: row.id, ...extraWhere },
        include:
          spec && typeof spec === 'object' && spec.include ? (spec.include as Row) : undefined,
      });
    }
    if (include.planBs && table === 'gate1Projects' && row.id) {
      const spec = include.planBs as Row | boolean;
      const extraWhere = spec && typeof spec === 'object' && spec.where ? (spec.where as Row) : {};
      enriched.planBs = this.findMany('gate1PlanBs', { where: { projectId: row.id, ...extraWhere } });
    }
    if (include.participantFeedbacks && table === 'gate1Projects' && row.id) {
      enriched.participantFeedbacks = this.findMany('gate1ParticipantFeedbacks', {
        where: { projectId: row.id },
      });
    }
    return enriched;
  }
}

const TABLE_MAP: Record<string, string> = {
  gate1Project: 'gate1Projects',
  gate1ExperimentBaseline: 'gate1ExperimentBaselines',
  gate1Participant: 'gate1Participants',
  gate1PrivateConstraint: 'gate1PrivateConstraints',
  gate1SanitizedConstraint: 'gate1SanitizedConstraints',
  gate1PrivacyAnalystAssignment: 'gate1PrivacyAnalystAssignments',
  gate1ConflictReport: 'gate1ConflictReports',
  gate1ConflictFinding: 'gate1ConflictFindings',
  gate1CandidateStrategy: 'gate1CandidateStrategies',
  gate1AdvisorDecision: 'gate1AdvisorDecisions',
  gate1ManualWorkLog: 'gate1ManualWorkLogs',
  gate1AccessAuditLog: 'gate1AccessAuditLogs',
  gate1AnalyticsEvent: 'gate1AnalyticsEvents',
  gate1ReadinessReport: 'gate1ReadinessReports',
  gate1ReadinessFinding: 'gate1ReadinessFindings',
  gate1PlanB: 'gate1PlanBs',
  gate1ProjectOutcome: 'gate1ProjectOutcomes',
  gate1NotificationOutbox: 'gate1NotificationOutbox',
  gate1ProposalFeedback: 'gate1ProposalFeedbacks',
  gate1ParticipantFeedback: 'gate1ParticipantFeedbacks',
  organizationMember: 'organizationMembers',
};

export function buildGate1Prisma(store: Gate1MemoryStore) {
  const prisma: Record<string, Record<string, unknown>> = {};
  for (const [model, table] of Object.entries(TABLE_MAP)) {
    prisma[model] = {
      findMany: (args: Record<string, unknown> = {}) => {
        const rows = store.findMany(table, args as never);
        if (args.include) {
          return rows.map((row) => store.enrich(table, row, args.include as Row));
        }
        return rows;
      },
      findFirst: (args: Record<string, unknown> = {}) => store.findFirst(table, args as never),
      findUnique: (args: Record<string, unknown>) => store.findUnique(table, args as never),
      count: (args: Record<string, unknown> = {}) => store.count(table, args as never),
      create: (args: { data: Row; include?: Row }) => store.create(table, args),
      createMany: (args: { data: Row[] }) => store.createMany(table, args),
      update: (args: { where: { id: string }; data: Row; include?: Row }) => store.update(table, args),
      updateMany: (args: { where?: Row; data: Row }) => store.updateMany(table, args),
      deleteMany: (args: { where?: Row }) => store.deleteMany(table, args),
      upsert: (args: { where: Row; create: Row; update: Row }) => store.upsert(table, args),
    };
  }
  return prisma as never;
}
