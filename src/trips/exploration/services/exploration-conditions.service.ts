import { BadRequestException, Injectable } from '@nestjs/common';
import { DEFAULT_RESEARCH_PROTOCOL_ID } from '../constants/exploration-status.constants';
import {
  EXPLORATION_DESTINATION_PRESETS,
  EXPLORATION_VEHICLE_TYPES,
  isResearchProtocolForcedByEnv,
  type ExplorationVehicleTypeCode,
} from '../config/exploration-conditions.config';
import {
  DEFAULT_EXPLORATION_VEHICLE_TYPE,
  TRANSPORT_CONSTRAINT_BFF,
} from '../../../common/constants/travel-mode-scope.constants';
import {
  EXPLORATION_INSURANCE_TIERS,
  isExplorationInsuranceCoverageTier,
} from '../config/exploration-insurance.config';
import { resolveResearchProtocol } from '../config/exploration-protocol.registry';
import type { CreateExplorationScenarioDto } from '../dto/exploration.dto';
import type { PatchExplorationConditionsDto } from '../dto/exploration-conditions.dto';
import type { ExplorationInput, ExplorationConditionsView } from '../types/exploration.types';
import { mergeExplorationInputWithProtocol } from '../utils/exploration-input.util';

@Injectable()
export class ExplorationConditionsService {
  /** 解析创建模式：显式 protocol > 环境强制研究 > Consumer */
  resolveProtocolId(dto: CreateExplorationScenarioDto): string | null {
    if (dto.researchProtocolId?.trim()) {
      return dto.researchProtocolId.trim();
    }
    if (isResearchProtocolForcedByEnv()) {
      return DEFAULT_RESEARCH_PROTOCOL_ID;
    }
    return null;
  }

  resolveLockedFields(protocolId: string | null): string[] {
    if (!protocolId) return [];
    const protocol = resolveResearchProtocol(protocolId);
    if (!protocol) return [];
    return this.normalizeLockedFieldsForClient(protocol.lockedFields);
  }

  /** 协议 nested path → 前端表单项 key */
  normalizeLockedFieldsForClient(protocolLocked: string[]): string[] {
    const set = new Set<string>();
    for (const field of protocolLocked) {
      if (field.startsWith('mobilityContext')) {
        set.add('mobilityContext');
      } else if (field.startsWith('insuranceContext')) {
        set.add('insuranceContext');
      } else if (field.startsWith('rentalContext')) {
        set.add('rentalContext');
      } else {
        set.add(field);
      }
    }
    return [...set];
  }

  buildInitialInput(
    dto: CreateExplorationScenarioDto,
    protocolId: string | null,
  ): ExplorationInput {
    const userInput = this.dtoToExplorationInput(dto, protocolId);

    if (!protocolId) {
      this.validateConsumerInput(userInput);
      return userInput;
    }

    const protocol = resolveResearchProtocol(protocolId);
    if (!protocol) {
      throw new BadRequestException(`Unknown research protocol: ${protocolId}`);
    }

    return mergeExplorationInputWithProtocol(
      userInput,
      protocol.defaultScenario,
      protocol.lockedFields,
    );
  }

  applyPatch(
    current: ExplorationInput,
    patch: PatchExplorationConditionsDto,
    lockedFields: string[],
  ): ExplorationInput {
    const next: ExplorationInput = {
      ...current,
      destinationCodes: patch.destinationCodes ?? current.destinationCodes,
      dateRange: patch.dateRange
        ? { ...current.dateRange, ...patch.dateRange }
        : current.dateRange,
      travelers: patch.travelers ?? current.travelers,
      budget: patch.budget !== undefined ? patch.budget : current.budget,
      mobilityContext: this.normalizeMobilityContext({
        ...current.mobilityContext,
        ...(patch.mobilityContext ?? {}),
      }),
      insuranceContext: {
        ...current.insuranceContext,
        ...(patch.insuranceContext ?? {}),
      },
      rentalContext: {
        ...current.rentalContext,
        ...(patch.rentalContext ?? {}),
      },
      source: current.source === 'RESEARCH_PROTOCOL' ? 'USER_CREATED' : current.source,
    };

    this.assertPatchAllowed(patch, lockedFields);
    this.validateConsumerInput(next);
    return next;
  }

  toConditionsView(input: ExplorationInput): ExplorationConditionsView {
    return {
      destinationCodes: input.destinationCodes,
      dateRange: input.dateRange,
      travelers: input.travelers,
      budget: input.budget,
      mobilityMode: TRANSPORT_CONSTRAINT_BFF.scope,
      mobilityModeLabel: TRANSPORT_CONSTRAINT_BFF.label,
      mobilityContext: this.normalizeMobilityContext(input.mobilityContext),
      insuranceContext: input.insuranceContext,
      rentalContext: input.rentalContext,
    };
  }

  getCatalog(destinationCode?: string) {
    const code = destinationCode?.trim().toUpperCase() ?? 'IS';
    const preset = EXPLORATION_DESTINATION_PRESETS[code];

    const vehicleTypes = (preset?.vehicleTypes ?? EXPLORATION_VEHICLE_TYPES.map((v) => v.code)).map(
      (code) => {
        const found = EXPLORATION_VEHICLE_TYPES.find((v) => v.code === code);
        return found ?? { code, label: code };
      },
    );

    return {
      destinationCode: code,
      destinationLabel: preset?.label ?? code,
      mobilityMode: TRANSPORT_CONSTRAINT_BFF.scope,
      mobilityModeLabel: TRANSPORT_CONSTRAINT_BFF.label,
      transportModeEditable: false,
      vehicleTypes,
      insuranceTiers: EXPLORATION_INSURANCE_TIERS.map((t) => ({ ...t })),
      budgetPresets: preset?.budgetPresets ?? [{ currency: 'USD', min: 2000, max: 8000 }],
      supportedDestinationCodes: Object.keys(EXPLORATION_DESTINATION_PRESETS),
    };
  }

  validateConsumerInput(input: ExplorationInput): void {
    if (!input.destinationCodes?.length) {
      throw new BadRequestException('destinationCodes is required');
    }
    for (const code of input.destinationCodes) {
      if (!/^[A-Z]{2}$/.test(code)) {
        throw new BadRequestException(`Invalid destination code: ${code}`);
      }
    }

    if (!input.dateRange?.startDate || !input.dateRange?.endDate) {
      throw new BadRequestException('dateRange.startDate and endDate are required');
    }
    const start = new Date(input.dateRange.startDate);
    const end = new Date(input.dateRange.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('dateRange must be valid ISO dates');
    }
    if (end < start) {
      throw new BadRequestException('dateRange.endDate must be on or after startDate');
    }

    if (!input.travelers?.length) {
      throw new BadRequestException('travelers must contain at least one traveler');
    }
    for (const t of input.travelers) {
      if (!['ADULT', 'CHILD', 'INFANT'].includes(t.type)) {
        throw new BadRequestException(`Invalid traveler type: ${t.type}`);
      }
    }

    if (input.budget?.currency && input.budget.currency.length !== 3) {
      throw new BadRequestException('budget.currency must be a 3-letter code');
    }
    if (
      input.budget?.min !== undefined &&
      input.budget?.max !== undefined &&
      input.budget.min > input.budget.max
    ) {
      throw new BadRequestException('budget.min must not exceed budget.max');
    }

    const vehicle = input.mobilityContext?.vehicleType;
    if (vehicle) {
      const allowed = EXPLORATION_VEHICLE_TYPES.map((v) => v.code);
      if (!allowed.includes(vehicle as ExplorationVehicleTypeCode)) {
        throw new BadRequestException(
          `mobilityContext.vehicleType must be one of: ${allowed.join(', ')}`,
        );
      }
    }

    const tier = input.insuranceContext?.coverageTier;
    if (tier && !isExplorationInsuranceCoverageTier(tier)) {
      throw new BadRequestException(
        `insuranceContext.coverageTier must be one of: ${EXPLORATION_INSURANCE_TIERS.map((t) => t.code).join(', ')}`,
      );
    }

    const pickupTime = input.rentalContext?.pickupTimeLocal;
    if (pickupTime && !/^\d{1,2}:\d{2}$/.test(pickupTime)) {
      throw new BadRequestException('rentalContext.pickupTimeLocal must be HH:mm');
    }
  }

  private dtoToExplorationInput(
    dto: CreateExplorationScenarioDto,
    protocolId: string | null,
  ): ExplorationInput {
    return {
      destinationCodes: dto.destinationCodes ?? [],
      dateRange: dto.dateRange ?? { startDate: '', endDate: '' },
      travelers: dto.travelers ?? [],
      budget: dto.budget,
      mobilityContext: this.normalizeMobilityContext(dto.mobilityContext),
      insuranceContext: dto.insuranceContext,
      rentalContext: dto.rentalContext,
      source: protocolId ? 'RESEARCH_PROTOCOL' : 'USER_CREATED',
    };
  }

  private assertPatchAllowed(
    patch: PatchExplorationConditionsDto,
    lockedFields: string[],
  ): void {
    const locked = new Set(lockedFields);
    if (patch.destinationCodes !== undefined && locked.has('destinationCodes')) {
      throw new BadRequestException('destinationCodes is locked by research protocol');
    }
    if (patch.dateRange !== undefined && locked.has('dateRange')) {
      throw new BadRequestException('dateRange is locked by research protocol');
    }
    if (patch.travelers !== undefined && locked.has('travelers')) {
      throw new BadRequestException('travelers is locked by research protocol');
    }
    if (patch.budget !== undefined && locked.has('budget')) {
      throw new BadRequestException('budget is locked by research protocol');
    }
    if (patch.mobilityContext !== undefined && locked.has('mobilityContext')) {
      throw new BadRequestException('mobilityContext is locked by research protocol');
    }
    if (patch.insuranceContext !== undefined && locked.has('insuranceContext')) {
      throw new BadRequestException('insuranceContext is locked by research protocol');
    }
    if (patch.rentalContext !== undefined && locked.has('rentalContext')) {
      throw new BadRequestException('rentalContext is locked by research protocol');
    }
  }

  private normalizeMobilityContext(
    mobilityContext?: ExplorationInput['mobilityContext'],
  ): ExplorationInput['mobilityContext'] {
    return {
      ...mobilityContext,
      vehicleType: mobilityContext?.vehicleType ?? DEFAULT_EXPLORATION_VEHICLE_TYPE,
    };
  }
}
