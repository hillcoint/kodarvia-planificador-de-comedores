import type { MenuLine, MenuOption } from '../domain/menu/types';

export type UserRole = 'nutritionist' | 'operations' | 'admin';
export type MenuStatus = 'uncalculated' | 'calculated' | 'stale' | 'no-capacity';

export interface DiningRoom {
  id: string;
  name: string;
  diners: number;
  budget: number;
  serviceDays: number[];
  diabetesPercent: number;
  scheduleStart: string;
  scheduleEnd: string;
  active: boolean;
  updatedAt: string;
  updatedBy: string;
  version: number;
}

export interface RatingRecord {
  id: string;
  diningRoomId: string;
  optionId: string;
  value: number;
  date: string;
  userId: string;
}

export interface StoredMenu {
  id: string;
  diningRoomId: string;
  date: string;
  line: MenuLine;
  status: MenuStatus;
  computedAt?: string;
  sourceVersion: number;
  acceptancePerTime?: number;
  cost?: number;
  kcal?: number;
  carbs?: number;
  protein?: number;
  sodium?: number;
  allocations?: Array<{ optionId: string; proportion: number; portions: number }>;
  slack?: number;
}

export interface AppEvent {
  id: string;
  timestamp: string;
  userId: string;
  role: UserRole;
  entityType: 'diningRoom' | 'option' | 'rating' | 'menu' | 'settings' | 'conflict';
  entityId: string;
  field: string;
  previousValue: unknown;
  nextValue: unknown;
  groupId?: string;
  undone?: boolean;
}

export interface DailySnapshot {
  id: string;
  date: string;
  createdAt: string;
  state: {
    diningRooms: DiningRoom[];
    options: MenuOption[];
    settings: AppSettings;
  };
}

export interface AppSettings {
  id: 'settings';
  minKcal: number;
  maxKcal: number;
  minProtein: number;
  maxSodium: number;
  maxCarbsDiabetes: number;
  optionCap: number;
  optionCapThreshold: number;
  surveyWindowWeeks: number;
  centralCapacity: number;
  adminKey: string;
  version: number;
  updatedAt: string;
  updatedBy: string;
}

export interface AppUser {
  id: string;
  name: string;
  role: UserRole;
  active: boolean;
}

export interface DemoSeed {
  options: MenuOption[];
  diningRooms: DiningRoom[];
  ratings: RatingRecord[];
  menus: StoredMenu[];
  events: AppEvent[];
  snapshots: DailySnapshot[];
  settings: AppSettings[];
  users: AppUser[];
}
