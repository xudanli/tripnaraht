import { Injectable } from '@nestjs/common';
import { MoneyDnaService } from './money-dna.service';
import {
  buildStructurePresets,
  resolveDefaultStructurePercentages,
} from '../utils/structure-presets.util';

@Injectable()
export class BudgetStructurePresetService {
  constructor(private readonly moneyDnaService: MoneyDnaService) {}

  async getPresetsForUser(userId: string) {
    const moneyDna = await this.moneyDnaService.getProfile(userId);
    return buildStructurePresets(moneyDna);
  }

  async resolveSuggestedStructure(userId: string) {
    const moneyDna = await this.moneyDnaService.getProfile(userId);
    const resolved = resolveDefaultStructurePercentages(moneyDna);
    return {
      mode: 'percent' as const,
      ...resolved,
    };
  }
}
