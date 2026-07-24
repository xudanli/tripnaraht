import { Injectable, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { toInputJsonValue } from '../../trips/budget-os/utils/prisma-json.util';
import type {
  EmergencyContactDto,
  EmergencyContactsResponseDto,
  PutEmergencyContactsRequestDto,
} from '../dto/emergency-contacts.dto';
import { EMERGENCY_CONTACTS_PREFERENCES_KEY } from '../dto/emergency-contacts.dto';

const MAX_CONTACTS = 10;

@Injectable()
export class MobileEmergencyContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async getContacts(userId: string): Promise<EmergencyContactsResponseDto> {
    const profile = await this.prisma.userProfile.findUnique({ where: { userId } });
    const preferences = (profile?.preferences as Record<string, unknown> | null) ?? {};
    const other = (preferences.other as Record<string, unknown> | undefined) ?? {};
    const raw = other[EMERGENCY_CONTACTS_PREFERENCES_KEY];
    const contacts = Array.isArray(raw) ? sanitizeContacts(raw) : [];

    return {
      contacts,
      updatedAt: profile?.updatedAt?.toISOString(),
    };
  }

  async putContacts(
    userId: string,
    body: PutEmergencyContactsRequestDto,
  ): Promise<EmergencyContactsResponseDto> {
    if (!Array.isArray(body.contacts)) {
      throw new BadRequestException('contacts 必须是数组');
    }
    if (body.contacts.length > MAX_CONTACTS) {
      throw new BadRequestException(`最多 ${MAX_CONTACTS} 位紧急联系人`);
    }

    const contacts: EmergencyContactDto[] = body.contacts.map((c) => {
      const name = c.name?.trim();
      const phone = c.phone?.trim();
      if (!name) throw new BadRequestException('联系人 name 不能为空');
      if (!phone) throw new BadRequestException('联系人 phone 不能为空');

      return {
        id: c.id?.trim() || `ec_${randomUUID().slice(0, 8)}`,
        name,
        phone,
        relationship: c.relationship?.trim() || 'other',
        notifyOnSOS: c.notifyOnSOS !== false,
        authorized: c.authorized !== false,
      };
    });

    const existing = await this.prisma.userProfile.findUnique({ where: { userId } });
    const preferences = ((existing?.preferences as Record<string, unknown> | null) ?? {}) as Record<
      string,
      unknown
    >;
    const other = ((preferences.other as Record<string, unknown> | undefined) ?? {}) as Record<
      string,
      unknown
    >;

    const nextPreferences = {
      ...preferences,
      other: {
        ...other,
        [EMERGENCY_CONTACTS_PREFERENCES_KEY]: contacts,
      },
    };

    const profile = await this.prisma.userProfile.upsert({
      where: { userId },
      update: {
        preferences: toInputJsonValue(nextPreferences),
        updatedAt: new Date(),
      },
      create: {
        userId,
        preferences: toInputJsonValue(nextPreferences),
        updatedAt: new Date(),
      },
    });

    return {
      contacts,
      updatedAt: profile.updatedAt.toISOString(),
    };
  }

  /** SOS 触发时读取 notifyOnSOS=true 的联系人 */
  async listNotifyOnSosContacts(userId: string): Promise<EmergencyContactDto[]> {
    const { contacts } = await this.getContacts(userId);
    return contacts.filter((c) => c.notifyOnSOS);
  }
}

function sanitizeContacts(raw: unknown[]): EmergencyContactDto[] {
  return raw
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const row = item as Record<string, unknown>;
      return {
        id: String(row.id ?? `ec_${randomUUID().slice(0, 8)}`),
        name: String(row.name ?? '').trim(),
        phone: String(row.phone ?? '').trim(),
        relationship: String(row.relationship ?? 'other'),
        notifyOnSOS: row.notifyOnSOS !== false,
        authorized: row.authorized !== false,
      };
    })
    .filter((c) => c.name && c.phone);
}
