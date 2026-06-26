import { PROJECT_ROLES, ProjectRole } from '../constants/identity-governance.constants';

export function mapCollaboratorRoleToProjectRoles(collaboratorRole: string): ProjectRole[] {
  const normalized = collaboratorRole.trim().toUpperCase();
  if (normalized === 'OWNER') {
    return ['organizer', 'payer'];
  }
  if (normalized === 'LEADER') {
    return ['organizer'];
  }
  return ['participant'];
}

export function isKnownProjectRole(role: string): role is ProjectRole {
  return (PROJECT_ROLES as readonly string[]).includes(role);
}
