import { Test } from '@nestjs/testing';
import { HarnessModule } from '../harness.module';
import { HarnessStepContractRegistryService } from './harness-step-contract.registry';
import { HarnessStepName } from '../contracts/harness-step.types';

describe('HarnessStepContractRegistryService', () => {
  it('注册所有 HarnessStepName 步骤', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HarnessModule],
    }).compile();
    const reg = moduleRef.get(HarnessStepContractRegistryService);
    const steps = reg.listRegisteredSteps();
    for (const name of Object.values(HarnessStepName)) {
      expect(steps).toContain(name);
      expect(reg.getContract(name)).toBeDefined();
    }
  });
});
