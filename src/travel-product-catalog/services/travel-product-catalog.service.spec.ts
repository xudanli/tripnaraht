import { Test } from '@nestjs/testing';
import { TravelProductCatalogService } from '../services/travel-product-catalog.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('TravelProductCatalogService.getTaxonomy', () => {
  it('returns 8 product types and iceland seeds', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TravelProductCatalogService,
        { provide: PrismaService, useValue: {} },
      ],
    }).compile();
    const svc = moduleRef.get(TravelProductCatalogService);
    const tax = svc.getTaxonomy();
    expect(tax.productTypes).toHaveLength(8);
    expect(tax.subtypes.some((s) => s.code === 'GLACIER_HIKING')).toBe(true);
  });
});
