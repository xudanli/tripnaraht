// src/countries/countries.module.ts
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminStrictAuthGuard } from '../admin/guards/admin-strict-auth.guard';
import { CountriesController } from './countries.controller';
import { CountriesAdminLegacyController } from './countries-admin-legacy.controller';
import { CountriesAdminService } from './countries-admin.service';
import { CountriesService } from './countries.service';
import { CountryKnowledgeService } from './services/country-knowledge.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [CountriesAdminLegacyController, CountriesController],
  providers: [
    CountriesService,
    CountriesAdminService,
    CountryKnowledgeService,
    AdminStrictAuthGuard,
  ],
  exports: [CountriesService, CountriesAdminService, CountryKnowledgeService],
})
export class CountriesModule {}

