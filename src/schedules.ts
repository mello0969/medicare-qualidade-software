import type { SectorId } from './domain.ts';

export type ScheduleShift = 'manha' | 'tarde' | 'noite';
export type ScheduleEntry = {
  sectorId: SectorId;
  date: string;
  shift: ScheduleShift;
  team: string;
  version: number;
};

export function validAttendanceDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T12:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
