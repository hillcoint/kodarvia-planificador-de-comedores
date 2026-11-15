import type { SimplexTrace } from '../optimization/types';

export type MenuTime = 'soup' | 'main' | 'side' | 'water';
export type MenuLine = 'general' | 'diabetes';

export interface MenuOption {
  id: string;
  name: string;
  time: MenuTime;
  kcal: number;
  carbs: number;
  protein: number;
  sodium: number;
  cost: number;
  acceptance: number;
  tags: string[];
}

export interface NutritionLimits {
  minKcal: number;
  maxKcal: number;
  minProtein: number;
  maxSodium: number;
  maxCarbsDiabetes: number;
}

export interface MenuPlanningInput {
  options: MenuOption[];
  diners: number;
  budget: number;
  line: MenuLine;
  limits?: Partial<NutritionLimits>;
  optionCap?: number;
  optionCapThreshold?: number;
}

export interface MenuMetrics {
  kcal: number;
  carbs: number;
  protein: number;
  sodium: number;
  cost: number;
  acceptanceObjective: number;
  acceptancePerTime: number;
}

export interface MenuAllocation {
  option: MenuOption;
  proportion: number;
  portions: number;
}

export type MenuPlanStatus = 'optimal' | 'budget-infeasible' | 'nutrition-infeasible' | 'invalid-options';

export interface MenuPlanResult {
  status: MenuPlanStatus;
  message?: string;
  allocations: MenuAllocation[];
  metrics?: MenuMetrics;
  totalPortions?: number;
  slack?: number;
  minimumPossibleCost?: number;
  hadAlternateOptima?: boolean;
  primaryTrace?: SimplexTrace;
  tieBreakTrace?: SimplexTrace;
  minimumCostTrace?: SimplexTrace;
}
