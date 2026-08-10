/**
 * Context Assembly 纯函数核心。
 * CRE/Task → Context Contract → 分 Provider 装载 → AssembledTravelContext
 */

import { planMemoryNeeds } from '../planner/memory-need-planner';
import { buildMemoryContextPackage } from '../runtime/memory-context-builder';
import type { MemoryLedgerStore } from '../ledger/memory-ledger.store';
import type { DecisionEpisodeV1 } from '../episode/decision-episode.types';
import type { MemoryContextPackage } from '../types/memory-context-package.types';
import type { ContextAssemblyContractV1 } from './context-assembly.types';
import type {
  AssembledTravelContextV1,
  DecisionContractSliceV1,
  SelfDriveWorldSliceV1,
} from './assembled-context.types';

export type AssembleTravelContextInput = {
  task: string;
  tripId?: string | null;
  userId?: string | null;
  day?: number | null;
  creOperation?: string | null;
  messageHint?: string | null;
  countryCode?: string | null;
  travelMode?: string | null;
  /** 当前合同约束提示（来自 Trip/请求，不是 Memory） */
  contractConstraints?: string[];
  tripGoal?: string | null;
  riskGates?: string[];
  episodes?: DecisionEpisodeV1[];
  working?: MemoryContextPackage['working'];
  worldHints?: { driverFatigueHigh?: boolean };
  /** SHADOW = 装配供观测，不宣称已进 Solver */
  mode?: 'SHADOW' | 'CONSUME';
  ledger: MemoryLedgerStore;
};

export function buildContextAssemblyContract(
  input: Pick<
    AssembleTravelContextInput,
    'task' | 'tripId' | 'creOperation' | 'messageHint' | 'travelMode'
  >,
): ContextAssemblyContractV1 {
  const needPlan = planMemoryNeeds({
    task: input.task,
    tripId: input.tripId,
    creOperation: input.creOperation,
    messageHint: input.messageHint,
  });

  const providers: ContextAssemblyContractV1['providers'] = [
    'DECISION_CONTRACT',
    'MEMORY',
  ];
  if (
    input.travelMode === 'SELF_DRIVE' ||
    /SELF_DRIVE|自驾|F-ROAD|G318|冰岛|ICELAND/i.test(
      `${input.task} ${input.messageHint ?? ''}`,
    )
  ) {
    providers.unshift('SELF_DRIVE_WORLD');
    providers.unshift('WORLD');
  }
  providers.push('BOOKING', 'TEAM');

  return {
    schemaId: 'tripnara.context_assembly_contract@v1',
    version: 1,
    task: input.task,
    tripId: input.tripId ?? null,
    providers: Array.from(new Set(providers)),
    memoryContractTask: needPlan.task,
    deny: [
      'FULL_HISTORY_DUMP',
      'ALL_EPISODES',
      'MEMORY_AS_SOLE_BASIS',
      'SELF_DRIVE_AS_MEMORY',
      'CONTRACT_AS_MEMORY',
    ],
  };
}

function buildDecisionContractSlice(
  input: AssembleTravelContextInput,
): DecisionContractSliceV1 {
  const constraints = [...(input.contractConstraints ?? [])];
  return {
    schemaId: 'tripnara.decision_contract_slice@v1',
    tripGoal: input.tripGoal ?? null,
    constraints,
    riskGates: [...(input.riskGates ?? [])],
    source: constraints.length || input.tripGoal ? 'REQUEST_HINTS' : 'EMPTY',
  };
}

function buildSelfDriveWorldSlice(
  input: AssembleTravelContextInput,
): SelfDriveWorldSliceV1 {
  const keys = [
    'road_status',
    'vehicle_fit',
    'seasonal_rule',
    'route_constraint',
  ];
  return {
    schemaId: 'tripnara.self_drive_world_slice@v1',
    countryCode: input.countryCode ?? null,
    travelMode: input.travelMode ?? 'SELF_DRIVE',
    keys,
    notes: 'Phase2 light slice — full SelfDriveContext via Kernel Provider later',
    hasFullContext: false,
  };
}

/**
 * 装配 Decision Context（Memory 与 Contract / Self-drive 分槽）。
 */
export function assembleTravelContext(
  input: AssembleTravelContextInput,
): AssembledTravelContextV1 {
  const contract = buildContextAssemblyContract(input);
  const mode = input.mode ?? 'SHADOW';
  const includeMemory = contract.providers.includes('MEMORY');
  const includeContract = contract.providers.includes('DECISION_CONTRACT');
  const includeSelfDrive =
    contract.providers.includes('SELF_DRIVE_WORLD') ||
    contract.providers.includes('WORLD');
  const includeBooking = contract.providers.includes('BOOKING');
  const includeTeam = contract.providers.includes('TEAM');

  const memory = includeMemory
    ? buildMemoryContextPackage(input.ledger, {
        task: input.task,
        tripId: input.tripId,
        userId: input.userId,
        day: input.day,
        creOperation: input.creOperation,
        messageHint: input.messageHint,
        episodes: input.episodes,
        working: input.working,
        worldHints: input.worldHints,
      })
    : null;

  const decisionContract = includeContract
    ? buildDecisionContractSlice(input)
    : null;
  const selfDriveWorld = includeSelfDrive
    ? buildSelfDriveWorldSlice(input)
    : null;

  const slices = contract.providers.map((provider) => {
    if (provider === 'MEMORY') {
      return {
        provider,
        included: !!memory,
        keys: memory
          ? [
              'structured',
              'tripMemory',
              'relevantEpisodes',
              'memoryContext',
            ]
          : [],
        notes: memory?.decisionSafe ? 'decision_safe' : 'omitted_or_unsafe',
      };
    }
    if (provider === 'DECISION_CONTRACT') {
      return {
        provider,
        included: !!decisionContract,
        keys: decisionContract?.constraints ?? [],
        notes: decisionContract?.source,
      };
    }
    if (provider === 'SELF_DRIVE_WORLD' || provider === 'WORLD') {
      return {
        provider,
        included: !!selfDriveWorld,
        keys: selfDriveWorld?.keys ?? [],
        notes: selfDriveWorld?.notes,
      };
    }
    if (provider === 'BOOKING') {
      return {
        provider,
        included: includeBooking,
        keys: includeBooking ? ['booking_status'] : [],
        notes: 'stub_phase2',
      };
    }
    if (provider === 'TEAM') {
      return {
        provider,
        included: includeTeam,
        keys: includeTeam ? ['participants'] : [],
        notes: 'stub_phase2',
      };
    }
    return { provider, included: false, keys: [] };
  });

  return {
    schemaId: 'tripnara.assembled_decision_context@v1',
    version: 1,
    task: input.task,
    assembledAt: new Date().toISOString(),
    slices,
    memoryDecisionSafe: memory?.decisionSafe ?? true,
    contract,
    memory,
    decisionContract,
    selfDriveWorld,
    booking: includeBooking
      ? { included: true, keys: ['booking_status'] }
      : null,
    team: includeTeam ? { included: true, keys: ['participants'] } : null,
    shadowBaseline: {
      memoryOmitted: true,
      providersWithoutMemory: slices.filter((s) => s.provider !== 'MEMORY'),
    },
    mode,
  };
}
