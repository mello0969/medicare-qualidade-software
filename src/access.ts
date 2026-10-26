import type { UserRole } from './api';

export const ROLE_LABELS: Record<UserRole, string> = {
  manager: 'Super Admin',
  'sector-admin': 'Admin de Setor',
  management: 'Gestão',
  ombudsman: 'Ouvidoria',
  viewer: 'Visualizador',
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  manager: 'Acesso total aos setores, às perguntas, às contas e às configurações.',
  'sector-admin': 'Acompanha os resultados e administra as perguntas do próprio setor.',
  management: 'Consulta as respostas e os indicadores de todos os setores, sem dados de contato.',
  ombudsman: 'Acompanha os indicadores e trata os pedidos de contato autorizados.',
  viewer: 'Consulta somente os indicadores agregados, sem respostas individuais ou contatos.',
};

export function canManageContacts(role?: UserRole) {
  return role === 'manager' || role === 'ombudsman';
}
