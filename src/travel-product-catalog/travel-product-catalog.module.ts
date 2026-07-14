import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminTravelProductCatalogController } from './controllers/admin-travel-product-catalog.controller';
import { TravelProductsController } from './controllers/travel-products.controller';
import { TravelProductCatalogService } from './services/travel-product-catalog.service';

@Module({
  imports: [PrismaModule],
  controllers: [AdminTravelProductCatalogController, TravelProductsController],
  providers: [TravelProductCatalogService],
  exports: [TravelProductCatalogService],
})
export class TravelProductCatalogModule {}
