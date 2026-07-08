import { Module } from '@nestjs/common';
import { DestinationPackLoaderService } from './loader/destination-pack-loader.service';
import { DestinationPackOverlayResolverService } from './loader/destination-pack-overlay-resolver.service';

@Module({
  providers: [DestinationPackLoaderService, DestinationPackOverlayResolverService],
  exports: [DestinationPackLoaderService, DestinationPackOverlayResolverService],
})
export class DestinationPackModule {}

export {
  executePackRuleConstraint,
  applyPackEvaluationToAssertionEnvelope,
} from './rules/pack-rule-constraint.executor';
export { runPackCertification, validateCountryPackRules } from './certification/pack-certification.harness';
