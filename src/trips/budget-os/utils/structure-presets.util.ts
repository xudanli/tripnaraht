import type {
  CategoryPercentages,
  SpendingPersona,
} from '../types/trip-budget-os.types';
import type { MoneyDnaProfile } from '../types/value-feedback.types';

export interface StructurePresetDefinition {
  id: string;
  label: string;
  spendingPersona: SpendingPersona;
  percentages: CategoryPercentages;
}

export interface BudgetStructurePresetItem extends StructurePresetDefinition {
  recommended?: boolean;
  source: 'money_dna' | 'canonical';
}

export const PERSONA_PRESET_LABELS: Record<SpendingPersona, string> = {
  experience: '体验型',
  quality: '品质型',
  frugal: '节俭型',
  efficiency: '效率型',
  balanced: '均衡型',
};

/** Canonical L2 percentage templates per spending persona (PRD §4.2.4 / §6.2) */
export const CANONICAL_STRUCTURE_PRESETS: StructurePresetDefinition[] = [
  {
    id: 'experience',
    label: PERSONA_PRESET_LABELS.experience,
    spendingPersona: 'experience',
    percentages: {
      transportation: 20,
      accommodation: 10,
      experience: 50,
      food: 15,
      other: 5,
    },
  },
  {
    id: 'quality',
    label: PERSONA_PRESET_LABELS.quality,
    spendingPersona: 'quality',
    percentages: {
      transportation: 20,
      accommodation: 40,
      experience: 25,
      food: 10,
      other: 5,
    },
  },
  {
    id: 'frugal',
    label: PERSONA_PRESET_LABELS.frugal,
    spendingPersona: 'frugal',
    percentages: {
      transportation: 35,
      accommodation: 10,
      experience: 15,
      food: 25,
      other: 15,
    },
  },
  {
    id: 'efficiency',
    label: PERSONA_PRESET_LABELS.efficiency,
    spendingPersona: 'efficiency',
    percentages: {
      transportation: 40,
      accommodation: 20,
      experience: 15,
      food: 20,
      other: 5,
    },
  },
  {
    id: 'balanced',
    label: PERSONA_PRESET_LABELS.balanced,
    spendingPersona: 'balanced',
    percentages: {
      transportation: 25,
      accommodation: 25,
      experience: 25,
      food: 20,
      other: 5,
    },
  },
];

export function buildPersonalizedPercentages(
  moneyDna: MoneyDnaProfile,
): CategoryPercentages {
  const foodPct = 20;
  const otherPct = 5;
  const allocatable = 100 - foodPct - otherPct;
  const sum =
    moneyDna.experienceSensitivity +
    moneyDna.accommodationSensitivity +
    moneyDna.efficiencySensitivity;
  const weights =
    sum > 0
      ? {
          experience: moneyDna.experienceSensitivity / sum,
          accommodation: moneyDna.accommodationSensitivity / sum,
          transportation: moneyDna.efficiencySensitivity / sum,
        }
      : { experience: 1 / 3, accommodation: 1 / 3, transportation: 1 / 3 };

  const frugalityScale = 1 - moneyDna.frugalityIndex * 0.15;
  const experience = roundPct(weights.experience * allocatable * frugalityScale);
  const accommodation = roundPct(weights.accommodation * allocatable * frugalityScale);
  let transportation = roundPct(weights.transportation * allocatable * frugalityScale);
  const used = experience + accommodation + transportation + foodPct + otherPct;
  transportation += 100 - used;

  return {
    transportation,
    accommodation,
    experience,
    food: foodPct,
    other: otherPct,
  };
}

export function resolveDefaultStructurePercentages(
  moneyDna: MoneyDnaProfile | null,
): { percentages: CategoryPercentages; spendingPersona: SpendingPersona; source: 'money_dna' | 'canonical' } {
  if (!moneyDna || moneyDna.confidence < 0.2) {
    const balanced = CANONICAL_STRUCTURE_PRESETS.find((p) => p.id === 'balanced')!;
    return {
      percentages: balanced.percentages,
      spendingPersona: 'balanced',
      source: 'canonical',
    };
  }

  if (moneyDna.tripCount >= 2 && moneyDna.confidence >= 0.35) {
    return {
      percentages: buildPersonalizedPercentages(moneyDna),
      spendingPersona: moneyDna.dominantPersona,
      source: 'money_dna',
    };
  }

  const canonical = CANONICAL_STRUCTURE_PRESETS.find(
    (p) => p.spendingPersona === moneyDna.dominantPersona,
  ) ?? CANONICAL_STRUCTURE_PRESETS.find((p) => p.id === 'balanced')!;

  return {
    percentages: canonical.percentages,
    spendingPersona: canonical.spendingPersona,
    source: 'money_dna',
  };
}

export function buildStructurePresets(
  moneyDna: MoneyDnaProfile | null,
): {
  recommendedPersona: SpendingPersona;
  presets: BudgetStructurePresetItem[];
} {
  const { percentages, spendingPersona, source } = resolveDefaultStructurePercentages(moneyDna);
  const presets: BudgetStructurePresetItem[] = [];

  if (moneyDna && source === 'money_dna' && moneyDna.tripCount >= 2) {
    presets.push({
      id: 'personalized',
      label: '我的 Money DNA',
      spendingPersona: moneyDna.dominantPersona,
      percentages,
      recommended: true,
      source: 'money_dna',
    });
  }

  for (const preset of CANONICAL_STRUCTURE_PRESETS) {
    const isRecommended =
      preset.spendingPersona === spendingPersona &&
      !presets.some((p) => p.recommended);
    presets.push({
      ...preset,
      recommended: isRecommended,
      source: 'canonical',
    });
  }

  if (!presets.some((p) => p.recommended)) {
    const balancedIdx = presets.findIndex((p) => p.id === 'balanced');
    if (balancedIdx >= 0) {
      presets[balancedIdx] = { ...presets[balancedIdx], recommended: true };
    }
  }

  return {
    recommendedPersona: spendingPersona,
    presets,
  };
}

function roundPct(value: number): number {
  return Math.round(value);
}
