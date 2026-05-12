import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { createHash } from 'crypto';
import { Public } from '../../auth/decorators/public.decorator';
import { successResponse } from '../../common/dto/standard-response.dto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  BudgetAdjustDto,
  BudgetListQueryDto,
  CommitResourceDto,
  CompensateResourceDto,
  HoldResourceDto,
  InventoryItemDto,
  LockInventoryDto,
  QuoteResourceDto,
  ReleaseResourceDto,
  UpdateBudgetDto,
  UpdateConstraintConfigDto,
  UpdateDataSourceConfigDto,
  UpdateInventoryItemDto,
} from '../dto/physical-domain-admin.dto';
import { StaticPoliciesReadResponseDto } from '../dto/policy-lab.dto';
import { PhysicalValidatorService } from '../../domain/ontology/validator/physical-validator.service';

@ApiTags('Admin - Physical Domain')
@Controller('admin/physical-domain')
@Public()
export class PhysicalDomainAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly physicalValidator: PhysicalValidatorService,
  ) {}

  private computeResourceHash(input: {
    budgetAvailable: number;
    inventoryId: string;
    price: number;
    availability: string;
  }): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          budgetAvailable: Number(input.budgetAvailable),
          inventoryId: String(input.inventoryId),
          price: Number(input.price),
          availability: String(input.availability),
        }),
      )
      .digest('hex');
  }

  private async ensureDefaults(): Promise<void> {
    await (this.prisma as any).physicalDomainBudget.upsert({
      where: { accountId: 'default' },
      update: {},
      create: {
        accountId: 'default',
        currency: 'USD',
        total: 3000,
        available: 3000,
        held: 0,
        spent: 0,
      },
    });
    await (this.prisma as any).physicalDomainConstraintConfig.upsert({
      where: { ruleId: 'wind_speed_drive_limit_v1' },
      update: {},
      create: {
        ruleId: 'wind_speed_drive_limit_v1',
        enabled: true,
        threshold: 50,
        params: { unit: 'kph' },
      },
    });
    await (this.prisma as any).physicalDomainDataSourceConfig.upsert({
      where: { sourceId: 'weather-api' },
      update: {},
      create: {
        sourceId: 'weather-api',
        provider: 'DefaultWeatherAdapter',
        enabled: true,
        baseUrl: 'https://example-weather-provider',
        fallbackStrategy: 'cache_then_estimate',
      },
    });
  }

  @Get('policy/static-policies')
  @ApiOperation({
    summary: '只读：内置静态物理策略（Policy Lab Phase A；冰岛 F-Road 季历兜底等）',
    description:
      'Returns ACTIVE_FALLBACK policies when DB seasonal_closures / Road.is sync are absent. Operators cannot edit via this endpoint.',
  })
  @ApiResponse({ status: 200, type: StaticPoliciesReadResponseDto })
  async getStaticPhysicalPolicies() {
    return successResponse(this.physicalValidator.getStaticPolicies());
  }

  private isBudgetAnomaly(row: {
    total: number;
    available: number;
    held: number;
    spent: number;
  }): boolean {
    const total = Number(row.total);
    const available = Number(row.available);
    const held = Number(row.held);
    const spent = Number(row.spent);
    if (![total, available, held, spent].every((x) => Number.isFinite(x))) return true;
    if (total < 0 || available < 0 || held < 0 || spent < 0) return true;
    return available + held + spent > total + 1e-9;
  }

  @Get('resources/budget')
  @ApiOperation({ summary: '获取预算账户快照列表（管理端）' })
  async listBudgets(@Query() q: BudgetListQueryDto) {
    await this.ensureDefaults();
    const page = Number.isFinite(Number(q?.page)) ? Math.max(1, Math.floor(Number(q.page))) : 1;
    const limitRaw = Number.isFinite(Number(q?.limit)) ? Math.floor(Number(q.limit)) : 20;
    const limit = Math.min(200, Math.max(1, limitRaw));

    const rows = await (this.prisma as any).physicalDomainBudget.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    const all = Array.isArray(rows) ? rows : [];
    const filtered = all.filter((row: any) => {
      const accountId = String(row?.accountId ?? '');
      const currency = String(row?.currency ?? '');
      if (q?.q && !accountId.toLowerCase().includes(String(q.q).toLowerCase())) return false;
      if (q?.currency && currency.toUpperCase() !== String(q.currency).toUpperCase()) return false;
      if (q?.status) {
        const anomaly = this.isBudgetAnomaly({
          total: Number(row?.total ?? 0),
          available: Number(row?.available ?? 0),
          held: Number(row?.held ?? 0),
          spent: Number(row?.spent ?? 0),
        });
        if (q.status === 'ANOMALY' && !anomaly) return false;
        if (q.status === 'HEALTHY' && anomaly) return false;
      }
      return true;
    });

    const total = filtered.length;
    const start = (page - 1) * limit;
    const items = filtered.slice(start, start + limit).map((row: any) => ({
      accountId: String(row.accountId),
      currency: String(row.currency),
      total: Number(row.total),
      available: Number(row.available),
      held: Number(row.held),
      spent: Number(row.spent),
      updatedAt:
        row.updatedAt instanceof Date
          ? row.updatedAt.toISOString()
          : typeof row.updatedAt === 'string' && row.updatedAt
            ? row.updatedAt
            : new Date().toISOString(),
    }));

    return successResponse({
      items,
      pagination: {
        page,
        limit,
        total,
      },
    });
  }

  @Get('resources/budget/:accountId')
  @ApiOperation({ summary: '获取预算快照' })
  @ApiParam({ name: 'accountId', type: String })
  @ApiResponse({ status: 200, description: '预算快照' })
  async getBudget(@Param('accountId') accountId: string) {
    await this.ensureDefaults();
    const v = await (this.prisma as any).physicalDomainBudget.findUnique({ where: { accountId } });
    const fallback = await (this.prisma as any).physicalDomainBudget.findUnique({ where: { accountId: 'default' } });
    const out = v ?? fallback!;
    return successResponse({
      currency: out.currency,
      total: out.total,
      available: out.available,
      held: out.held,
      spent: out.spent,
    });
  }

  @Patch('resources/budget/:accountId')
  @ApiOperation({ summary: '更新预算字段（管理端）' })
  @ApiParam({ name: 'accountId', type: String })
  @ApiBody({ type: UpdateBudgetDto })
  async patchBudget(@Param('accountId') accountId: string, @Body() dto: UpdateBudgetDto) {
    await this.ensureDefaults();
    const base = await (this.prisma as any).physicalDomainBudget.findUnique({ where: { accountId } });
    const fallback = await (this.prisma as any).physicalDomainBudget.findUnique({ where: { accountId: 'default' } });
    const cur = base ?? fallback!;
    const next = await (this.prisma as any).physicalDomainBudget.upsert({
      where: { accountId },
      update: { ...dto },
      create: {
        accountId,
        currency: cur.currency,
        total: dto.total ?? cur.total,
        available: dto.available ?? cur.available,
        held: dto.held ?? cur.held,
        spent: dto.spent ?? cur.spent,
      },
    });
    return successResponse({
      currency: next.currency,
      total: next.total,
      available: next.available,
      held: next.held,
      spent: next.spent,
    });
  }

  @Post('resources/budget/:accountId/adjust')
  @ApiOperation({ summary: '预算增减/冲正' })
  @ApiParam({ name: 'accountId', type: String })
  @ApiBody({ type: BudgetAdjustDto })
  async adjustBudget(@Param('accountId') accountId: string, @Body() dto: BudgetAdjustDto) {
    await this.ensureDefaults();
    const base = await (this.prisma as any).physicalDomainBudget.findUnique({ where: { accountId } });
    const fallback = await (this.prisma as any).physicalDomainBudget.findUnique({ where: { accountId: 'default' } });
    const cur = base ?? fallback!;
    const delta = dto.op === 'CREDIT' ? Math.abs(dto.amount) : -Math.abs(dto.amount);
    const next = await (this.prisma as any).physicalDomainBudget.upsert({
      where: { accountId },
      update: {
        available: cur.available + delta,
        spent: dto.op === 'DEBIT' ? cur.spent + Math.abs(dto.amount) : cur.spent,
        total: dto.op === 'CREDIT' ? cur.total + Math.abs(dto.amount) : cur.total,
      },
      create: {
        accountId,
        currency: cur.currency,
        total: dto.op === 'CREDIT' ? cur.total + Math.abs(dto.amount) : cur.total,
        available: cur.available + delta,
        held: cur.held,
        spent: dto.op === 'DEBIT' ? cur.spent + Math.abs(dto.amount) : cur.spent,
      },
    });
    return successResponse({
      currency: next.currency,
      total: next.total,
      available: next.available,
      held: next.held,
      spent: next.spent,
    });
  }

  @Get('resources/inventory')
  @ApiOperation({ summary: '获取库存列表' })
  async getInventory() {
    const rows = await (this.prisma as any).physicalDomainInventoryItem.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    return successResponse(rows);
  }

  @Post('resources/inventory')
  @ApiOperation({ summary: '新增库存项' })
  @ApiBody({ type: InventoryItemDto })
  async createInventory(@Body() dto: InventoryItemDto) {
    const row = await (this.prisma as any).physicalDomainInventoryItem.upsert({
      where: { id: dto.id },
      update: {
        type: dto.type,
        price: dto.price,
        availability: dto.availability,
        lockable: dto.lockable,
        holdExpiresAt: dto.holdExpiresAt ? new Date(dto.holdExpiresAt) : null,
      },
      create: {
        id: dto.id,
        type: dto.type,
        price: dto.price,
        availability: dto.availability,
        lockable: dto.lockable,
        holdExpiresAt: dto.holdExpiresAt ? new Date(dto.holdExpiresAt) : null,
      },
    });
    return successResponse(row);
  }

  @Patch('resources/inventory/:id')
  @ApiOperation({ summary: '更新库存项' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: UpdateInventoryItemDto })
  async patchInventory(@Param('id') id: string, @Body() dto: UpdateInventoryItemDto) {
    const cur = await (this.prisma as any).physicalDomainInventoryItem.findUnique({ where: { id } });
    const row = await (this.prisma as any).physicalDomainInventoryItem.upsert({
      where: { id },
      update: {
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.price !== undefined ? { price: dto.price } : {}),
        ...(dto.availability !== undefined ? { availability: dto.availability } : {}),
        ...(dto.lockable !== undefined ? { lockable: dto.lockable } : {}),
      },
      create: {
        id,
        type: dto.type ?? cur?.type ?? 'HOTEL',
        price: dto.price ?? cur?.price ?? 0,
        availability: dto.availability ?? cur?.availability ?? 'AVAILABLE',
        lockable: dto.lockable ?? cur?.lockable ?? true,
        holdExpiresAt: cur?.holdExpiresAt ?? null,
      },
    });
    return successResponse(row);
  }

  @Post('resources/inventory/:id/lock')
  @ApiOperation({ summary: '锁定库存' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: LockInventoryDto })
  async lockInventory(@Param('id') id: string, @Body() dto: LockInventoryDto) {
    const cur = await (this.prisma as any).physicalDomainInventoryItem.findUnique({ where: { id } });
    const expires = dto.holdExpiresAt ? new Date(dto.holdExpiresAt) : new Date(Date.now() + 15 * 60 * 1000);
    const row = await (this.prisma as any).physicalDomainInventoryItem.upsert({
      where: { id },
      update: { holdExpiresAt: expires },
      create: {
        id,
        type: cur?.type ?? 'HOTEL',
        price: cur?.price ?? 0,
        availability: cur?.availability ?? 'LIMITED',
        lockable: cur?.lockable ?? true,
        holdExpiresAt: expires,
      },
    });
    return successResponse(row);
  }

  @Post('resources/inventory/:id/unlock')
  @ApiOperation({ summary: '解锁库存' })
  @ApiParam({ name: 'id', type: String })
  async unlockInventory(@Param('id') id: string) {
    const cur = await (this.prisma as any).physicalDomainInventoryItem.findUnique({ where: { id } });
    if (!cur) return successResponse({ id, unlocked: true });
    const row = await (this.prisma as any).physicalDomainInventoryItem.update({
      where: { id },
      data: { holdExpiresAt: null },
    });
    return successResponse(row);
  }

  @Post('resources/quote')
  @ApiOperation({ summary: '资源报价（price/availability/expiresAt/resourceHash）' })
  @ApiBody({ type: QuoteResourceDto })
  async quoteResource(@Body() dto: QuoteResourceDto) {
    await this.ensureDefaults();
    const inv = await (this.prisma as any).physicalDomainInventoryItem.findUnique({ where: { id: dto.inventoryId } });
    if (!inv) throw new BadRequestException(`Inventory not found: ${dto.inventoryId}`);
    const b = await (this.prisma as any).physicalDomainBudget.findUnique({ where: { accountId: dto.accountId } });
    const fallback = await (this.prisma as any).physicalDomainBudget.findUnique({ where: { accountId: 'default' } });
    const budget = b ?? fallback!;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const resourceHash = this.computeResourceHash({
      budgetAvailable: budget.available,
      inventoryId: inv.id,
      price: inv.price,
      availability: inv.availability,
    });
    return successResponse({
      accountId: dto.accountId,
      inventoryId: inv.id,
      price: inv.price,
      currency: budget.currency,
      availability: inv.availability,
      expiresAt,
      resourceHash,
    });
  }

  @Post('resources/hold')
  @ApiOperation({ summary: '资源冻结（预算冻结 + 库存锁定）' })
  @ApiBody({ type: HoldResourceDto })
  async holdResource(@Body() dto: HoldResourceDto) {
    await this.ensureDefaults();
    if (!dto.idempotencyKey?.trim()) throw new BadRequestException('idempotencyKey is required');
    const inv = await (this.prisma as any).physicalDomainInventoryItem.findUnique({ where: { id: dto.inventoryId } });
    if (!inv) throw new BadRequestException(`Inventory not found: ${dto.inventoryId}`);
    if (inv.availability === 'SOLD_OUT') throw new BadRequestException('inventory is SOLD_OUT');
    if (!inv.lockable) throw new BadRequestException('inventory is not lockable');

    const b = await (this.prisma as any).physicalDomainBudget.findUnique({ where: { accountId: dto.accountId } });
    const fallback = await (this.prisma as any).physicalDomainBudget.findUnique({ where: { accountId: 'default' } });
    const budget = b ?? fallback!;
    if (budget.available < dto.amount) throw new BadRequestException('budget available is insufficient');

    const holdExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const holdId = `bh_${dto.accountId}_${dto.inventoryId}_${Buffer.from(dto.idempotencyKey).toString('hex').slice(0, 16)}`;

    const nextBudget = await (this.prisma as any).physicalDomainBudget.upsert({
      where: { accountId: dto.accountId },
      update: {
        available: budget.available - dto.amount,
        held: budget.held + dto.amount,
      },
      create: {
        accountId: dto.accountId,
        currency: dto.currency ?? budget.currency,
        total: budget.total,
        available: budget.available - dto.amount,
        held: budget.held + dto.amount,
        spent: budget.spent,
      },
    });

    const nextInv = await (this.prisma as any).physicalDomainInventoryItem.upsert({
      where: { id: dto.inventoryId },
      update: { holdExpiresAt },
      create: {
        id: dto.inventoryId,
        type: inv.type ?? 'HOTEL',
        price: inv.price ?? dto.amount,
        availability: inv.availability ?? 'LIMITED',
        lockable: inv.lockable ?? true,
        holdExpiresAt,
      },
    });

    const resourceHash = this.computeResourceHash({
      budgetAvailable: nextBudget.available,
      inventoryId: nextInv.id,
      price: nextInv.price,
      availability: nextInv.availability,
    });

    return successResponse({
      holdId,
      accountId: dto.accountId,
      inventoryId: dto.inventoryId,
      amount: dto.amount,
      currency: dto.currency ?? nextBudget.currency,
      status: 'HELD',
      expiresAt: holdExpiresAt.toISOString(),
      idempotencyKey: dto.idempotencyKey,
      resourceHash,
    });
  }

  @Post('resources/commit')
  @ApiOperation({ summary: '资源提交（仅确认预订，不自动扣款）' })
  @ApiBody({ type: CommitResourceDto })
  async commitResource(@Body() dto: CommitResourceDto) {
    await this.ensureDefaults();
    const inv = await (this.prisma as any).physicalDomainInventoryItem.findUnique({ where: { id: dto.inventoryId } });
    if (!inv) throw new BadRequestException(`Inventory not found: ${dto.inventoryId}`);
    const b = await (this.prisma as any).physicalDomainBudget.findUnique({ where: { accountId: dto.accountId } });
    const fallback = await (this.prisma as any).physicalDomainBudget.findUnique({ where: { accountId: 'default' } });
    const budget = b ?? fallback!;
    if (budget.held < dto.amount) throw new BadRequestException('budget held is insufficient for commit');
    const currentHash = this.computeResourceHash({
      budgetAvailable: budget.available,
      inventoryId: inv.id,
      price: inv.price,
      availability: inv.availability,
    });
    if (dto.expectedResourceHash && dto.expectedResourceHash !== currentHash) {
      throw new BadRequestException('RESOURCE_STALE_RECOMPUTE');
    }
    // Manual-capture mode: commit confirms booking but does not auto capture payment.
    // Keep funds in held balance until explicit capture/refund policy is enabled.
    const nextBudget = budget;
    await (this.prisma as any).physicalDomainInventoryItem.upsert({
      where: { id: dto.inventoryId },
      update: { holdExpiresAt: null },
      create: {
        id: dto.inventoryId,
        type: inv.type ?? 'HOTEL',
        price: inv.price ?? dto.amount,
        availability: inv.availability ?? 'LIMITED',
        lockable: inv.lockable ?? true,
        holdExpiresAt: null,
      },
    });
    const bookingId = `bk_${dto.holdId}`;
    const paymentRef = `pay_${dto.holdId}`;
    return successResponse({
      bookingId,
      holdId: dto.holdId,
      paymentRef,
      status: 'PENDING_CAPTURE',
      captureMode: 'MANUAL_CONFIRMATION',
      budget: {
        accountId: dto.accountId,
        available: nextBudget.available,
        held: nextBudget.held,
        spent: nextBudget.spent,
      },
    });
  }

  @Post('resources/release')
  @ApiOperation({ summary: '释放资源冻结（held 回退到 available + 解锁库存）' })
  @ApiBody({ type: ReleaseResourceDto })
  async releaseResource(@Body() dto: ReleaseResourceDto) {
    await this.ensureDefaults();
    const b = await (this.prisma as any).physicalDomainBudget.findUnique({ where: { accountId: dto.accountId } });
    const fallback = await (this.prisma as any).physicalDomainBudget.findUnique({ where: { accountId: 'default' } });
    const budget = b ?? fallback!;
    if (budget.held < dto.amount) throw new BadRequestException('budget held is insufficient for release');

    const nextBudget = await (this.prisma as any).physicalDomainBudget.upsert({
      where: { accountId: dto.accountId },
      update: {
        held: budget.held - dto.amount,
        available: budget.available + dto.amount,
      },
      create: {
        accountId: dto.accountId,
        currency: budget.currency,
        total: budget.total,
        held: Math.max(0, budget.held - dto.amount),
        available: budget.available + dto.amount,
        spent: budget.spent,
      },
    });

    const inv = await (this.prisma as any).physicalDomainInventoryItem.findUnique({ where: { id: dto.inventoryId } });
    if (inv) {
      await (this.prisma as any).physicalDomainInventoryItem.update({
        where: { id: dto.inventoryId },
        data: { holdExpiresAt: null },
      });
    }

    return successResponse({
      released: true,
      holdId: dto.holdId ?? null,
      accountId: dto.accountId,
      inventoryId: dto.inventoryId,
      amount: dto.amount,
      status: 'RELEASED',
      budget: {
        available: nextBudget.available,
        held: nextBudget.held,
        spent: nextBudget.spent,
      },
    });
  }

  @Post('resources/compensate')
  @ApiOperation({ summary: '资源补偿（refund + release inventory）' })
  @ApiBody({ type: CompensateResourceDto })
  async compensateResource(@Body() dto: CompensateResourceDto) {
    await this.ensureDefaults();
    const b = await (this.prisma as any).physicalDomainBudget.findUnique({ where: { accountId: dto.accountId } });
    const fallback = await (this.prisma as any).physicalDomainBudget.findUnique({ where: { accountId: 'default' } });
    const budget = b ?? fallback!;
    if (budget.spent < dto.amount) throw new BadRequestException('budget spent is insufficient for refund');

    const nextBudget = await (this.prisma as any).physicalDomainBudget.upsert({
      where: { accountId: dto.accountId },
      update: {
        spent: budget.spent - dto.amount,
        available: budget.available + dto.amount,
      },
      create: {
        accountId: dto.accountId,
        currency: budget.currency,
        total: budget.total,
        held: budget.held,
        available: budget.available + dto.amount,
        spent: Math.max(0, budget.spent - dto.amount),
      },
    });

    const inv = await (this.prisma as any).physicalDomainInventoryItem.findUnique({ where: { id: dto.inventoryId } });
    if (inv) {
      await (this.prisma as any).physicalDomainInventoryItem.update({
        where: { id: dto.inventoryId },
        data: { holdExpiresAt: null },
      });
    }

    return successResponse({
      compensated: true,
      accountId: dto.accountId,
      inventoryId: dto.inventoryId,
      amount: dto.amount,
      reason: dto.reason ?? null,
      status: 'REFUNDED',
      budget: {
        available: nextBudget.available,
        held: nextBudget.held,
        spent: nextBudget.spent,
      },
    });
  }

  @Get('policy/constraints')
  @ApiOperation({ summary: '获取约束策略列表（Policy Lab）' })
  async getConstraints() {
    await this.ensureDefaults();
    const rows = await (this.prisma as any).physicalDomainConstraintConfig.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    return successResponse(rows);
  }

  @Get('policy/constraints/:ruleId')
  @ApiOperation({ summary: '按 ruleId 获取约束策略（Policy Lab）' })
  @ApiParam({ name: 'ruleId', type: String })
  async getConstraintByRuleId(@Param('ruleId') ruleId: string) {
    await this.ensureDefaults();
    const row = await (this.prisma as any).physicalDomainConstraintConfig.findUnique({ where: { ruleId } });
    return successResponse(row);
  }

  @Post('policy/constraints/validate')
  @ApiOperation({ summary: '校验约束参数（不落库）' })
  @ApiBody({ type: UpdateConstraintConfigDto })
  validateConstraint(@Body() dto: UpdateConstraintConfigDto) {
    this.validateConstraintParams(dto.params);
    return successResponse({ valid: true });
  }

  @Patch('policy/constraints/:ruleId')
  @ApiOperation({ summary: '更新约束策略（阈值/开关）' })
  @ApiParam({ name: 'ruleId', type: String })
  @ApiBody({ type: UpdateConstraintConfigDto })
  async patchConstraint(@Param('ruleId') ruleId: string, @Body() dto: UpdateConstraintConfigDto) {
    this.validateConstraintParams(dto.params);
    const row = await (this.prisma as any).physicalDomainConstraintConfig.upsert({
      where: { ruleId },
      update: {
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.threshold !== undefined ? { threshold: dto.threshold } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.params !== undefined ? { params: dto.params as any } : {}),
      },
      create: {
        ruleId,
        enabled: dto.enabled ?? true,
        threshold: dto.threshold,
        description: dto.description,
        params: (dto.params as any) ?? {},
      },
    });
    return successResponse(row);
  }

  @Delete('policy/constraints/:ruleId')
  @ApiOperation({ summary: '删除约束策略（Policy Lab）' })
  @ApiParam({ name: 'ruleId', type: String })
  async deleteConstraint(@Param('ruleId') ruleId: string) {
    const row = await (this.prisma as any).physicalDomainConstraintConfig.findUnique({ where: { ruleId } });
    if (!row) {
      return successResponse({ ruleId, deleted: false });
    }
    await (this.prisma as any).physicalDomainConstraintConfig.delete({ where: { ruleId } });
    return successResponse({ ruleId, deleted: true });
  }

  private validateConstraintParams(params?: Record<string, unknown>): void {
    if (!params || typeof params !== 'object' || Array.isArray(params)) return;
    const kind = String((params as any).kind ?? (params as any).type ?? '').toUpperCase();
    if (kind !== 'CONFLICT_MATRIX') return;
    const conditions = (params as any).conditions;
    const effect = String((params as any).effect ?? '').toUpperCase();
    const priority = Number((params as any).priority);
    const allowed = new Set(['HARD_BLOCK', 'WARNING', 'RE_ROUTE', 'SPEED_FACTOR_DOWN']);
    if (!Array.isArray(conditions) || conditions.length === 0 || !conditions.every((x) => typeof x === 'string' && x.trim())) {
      throw new BadRequestException('CONFLICT_MATRIX params.conditions 必须是非空字符串数组');
    }
    if (!allowed.has(effect)) {
      throw new BadRequestException('CONFLICT_MATRIX params.effect 非法');
    }
    if (!Number.isFinite(priority)) {
      throw new BadRequestException('CONFLICT_MATRIX params.priority 必须是数字');
    }
  }

  @Post('policy/constraints/:ruleId/rollback')
  @ApiOperation({ summary: '回滚约束策略到默认值（最小实现）' })
  @ApiParam({ name: 'ruleId', type: String })
  async rollbackConstraint(@Param('ruleId') ruleId: string) {
    const row = await (this.prisma as any).physicalDomainConstraintConfig.upsert({
      where: { ruleId },
      update: { enabled: true, threshold: null, params: {} as any },
      create: { ruleId, enabled: true, threshold: null, params: {} as any },
    });
    return successResponse(row);
  }

  @Get('data-sources')
  @ApiOperation({ summary: '获取数据源配置' })
  async getDataSources() {
    await this.ensureDefaults();
    const rows = await (this.prisma as any).physicalDomainDataSourceConfig.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    return successResponse(rows);
  }

  @Patch('data-sources/:sourceId')
  @ApiOperation({ summary: '更新数据源配置（Weather/Inventory/Fallback）' })
  @ApiParam({ name: 'sourceId', type: String })
  @ApiBody({ type: UpdateDataSourceConfigDto })
  async patchDataSource(@Param('sourceId') sourceId: string, @Body() dto: UpdateDataSourceConfigDto) {
    const row = await (this.prisma as any).physicalDomainDataSourceConfig.upsert({
      where: { sourceId },
      update: {
        ...(dto.provider !== undefined ? { provider: dto.provider } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.baseUrl !== undefined ? { baseUrl: dto.baseUrl } : {}),
        ...(dto.fallbackStrategy !== undefined ? { fallbackStrategy: dto.fallbackStrategy } : {}),
      },
      create: {
        sourceId,
        provider: dto.provider ?? 'UNKNOWN',
        enabled: dto.enabled ?? false,
        baseUrl: dto.baseUrl,
        fallbackStrategy: dto.fallbackStrategy,
      },
    });
    return successResponse(row);
  }

  @Post('data-sources/:sourceId/test')
  @ApiOperation({ summary: '测试数据源连通性（最小实现）' })
  @ApiParam({ name: 'sourceId', type: String })
  async testDataSource(@Param('sourceId') sourceId: string) {
    await this.ensureDefaults();
    const src = await (this.prisma as any).physicalDomainDataSourceConfig.findUnique({ where: { sourceId } });
    return successResponse({
      sourceId,
      ok: Boolean(src?.enabled),
      checkedAt: new Date().toISOString(),
      detail: src?.enabled ? 'SIMULATED_OK' : 'SIMULATED_DISABLED',
    });
  }
}
