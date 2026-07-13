/** 紧急联系人 — GET/PUT /api/mobile/users/me/emergency-contacts */

export const EMERGENCY_CONTACT_RELATIONSHIPS = [
  'spouse',
  'parent',
  'child',
  'sibling',
  'friend',
  'colleague',
  'other',
] as const;

export type EmergencyContactRelationship = (typeof EMERGENCY_CONTACT_RELATIONSHIPS)[number];

export interface EmergencyContactDto {
  id: string;
  name: string;
  phone: string;
  relationship: EmergencyContactRelationship | string;
  notifyOnSOS: boolean;
  authorized: boolean;
}

export interface EmergencyContactsResponseDto {
  contacts: EmergencyContactDto[];
  updatedAt?: string;
}

export interface PutEmergencyContactsRequestDto {
  contacts: Array<{
    id?: string;
    name: string;
    phone: string;
    relationship?: EmergencyContactRelationship | string;
    notifyOnSOS?: boolean;
    authorized?: boolean;
  }>;
}

export const EMERGENCY_CONTACTS_PREFERENCES_KEY = 'emergencyContacts';
