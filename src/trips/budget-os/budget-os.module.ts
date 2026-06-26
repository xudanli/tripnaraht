import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ItineraryItemsModule } from '../../itinerary-items/itinerary-items.module';
import { TripBudgetOsController } from './controllers/trip-budget-os.controller';
import { MoneyDnaController } from './controllers/money-dna.controller';
import { TravelProfileController } from './controllers/travel-profile.controller';
import { BudgetStructureService } from './services/budget-structure.service';
import { TripBudgetIntentService } from './services/trip-budget-intent.service';
import { TripBudgetProfileService } from './services/trip-budget-profile.service';
import { TravelWalletService } from './services/travel-wallet.service';
import { TripValueFeedbackService } from './services/trip-value-feedback.service';
import { MoneyDnaService } from './services/money-dna.service';
import { TripBudgetAccessService } from './services/trip-budget-access.service';
import { BudgetDecisionLogService } from './services/budget-decision-log.service';
import { BudgetStructurePresetService } from './services/budget-structure-preset.service';
import { TravelProfileService } from './services/travel-profile.service';

@Module({
  imports: [PrismaModule, forwardRef(() => ItineraryItemsModule)],
  controllers: [TripBudgetOsController, MoneyDnaController, TravelProfileController],
  providers: [
    TripBudgetIntentService,
    BudgetStructureService,
    TripBudgetProfileService,
    TravelWalletService,
    TripValueFeedbackService,
    MoneyDnaService,
    TripBudgetAccessService,
    BudgetDecisionLogService,
    BudgetStructurePresetService,
    TravelProfileService,
  ],
  exports: [
    TripBudgetIntentService,
    BudgetStructureService,
    TripBudgetProfileService,
    TravelWalletService,
    TripValueFeedbackService,
    MoneyDnaService,
    TripBudgetAccessService,
    BudgetDecisionLogService,
    BudgetStructurePresetService,
    TravelProfileService,
  ],
})
export class TripBudgetOsModule {}
