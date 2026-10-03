// These accounts are created only in the temporary QA database, never in the application database.
export const QA_MANAGER = {
  name: 'Gestão de teste',
  email: 'gestao@qa.medicare.local',
  password: 'MediCare-QA-Gestao!2026',
  role: 'manager',
  sectorId: null,
  mustChangePassword: false,
} as const;
export const QA_SECTOR = {
  name: 'Triagem de teste',
  email: 'triagem@qa.medicare.local',
  password: 'MediCare-QA-Triagem!2026',
  role: 'sector-admin',
  sectorId: 'triagem',
  mustChangePassword: false,
} as const;
