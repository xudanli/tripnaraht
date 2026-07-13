import { PROJECT_ROLES, ProjectRole } from '../constants/identity-governance.constants';

export function mapCollaboratorRoleToProjectRoles(collaboratorRole: string): ProjectRole[] {
  const normalized = collaboratorRole.trim().toUpperCase();
  if (normalized === 'OWNER' || normalized === 'ADVISOR') {
    return ['organizer', 'payer'];
  }
  if (normalized === 'LEADER' || normalized === 'FINAL_CONFIRMER') {
    return ['organizer'];
  }
  if (normalized === 'PAYER') {
    return ['payer'];
  }
  if (normalized === 'PRIMARY_CONTACT') {
    return ['participant'];
  }
  return ['participant'];
}

export function isKnownProjectRole(role: string): role is ProjectRole {
  return (PROJECT_ROLES as readonly string[]).includes(role);
}
