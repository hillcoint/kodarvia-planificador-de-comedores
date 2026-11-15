import { solveLinearProgram } from '../optimization/simplex';
import type { LinearConstraint, LinearProgram } from '../optimization/types';
import { portionsToCook, roundHalfUp } from './rounding';
import type {
  MenuOption,
  MenuPlanResult,
  MenuPlanningInput,
  MenuTime,
  NutritionLimits,
} from './types';

const TIMES: MenuTime[] = ['soup', 'main', 'side', 'water'];

const DEFAULT_LIMITS: NutritionLimits = {
  minKcal: 650,
  maxKcal: 850,
  minProtein: 30,
  maxSodium: 1500,
  maxCarbsDiabetes: 70,
};

function timeLabel(time: MenuTime): string {
  return ({ soup: 'sopa', main: 'plato fuerte', side: 'guarnición', water: 'agua' } as const)[time];
}

function coefficients(options: MenuOption[], selector: (option: MenuOption) => number): number[] {
  return options.map(selector);
}

function addNutritionConstraints(
  constraints: LinearConstraint[],
  options: MenuOption[],
  limits: NutritionLimits,
  includeBudget: boolean,
  budget: number,
  line: MenuPlanningInput['line'],
) {
  constraints.push(
    { coefficients: coefficients(options, (o) => o.kcal), relation: '>=', rhs: limits.minKcal, label: 'kcal-min' },
    { coefficients: coefficients(options, (o) => o.kcal), relation: '<=', rhs: limits.maxKcal, label: 'kcal-max' },
    { coefficients: coefficients(options, (o) => o.protein), relation: '>=', rhs: limits.minProtein, label: 'protein-min' },
    { coefficients: coefficients(options, (o) => o.sodium), relation: '<=', rhs: limits.maxSodium, label: 'sodium-max' },
  );

  if (line === 'diabetes') {
    constraints.push({
      coefficients: coefficients(options, (o) => o.carbs),
      relation: '<=',
      rhs: limits.maxCarbsDiabetes,
      label: 'carbs-max-diabetes',
    });
  }

  if (includeBudget) {
    constraints.push({
      coefficients: coefficients(options, (o) => o.cost),
      relation: '<=',
      rhs: budget,
      label: 'budget-max',
    });
  }
}

function validateTimes(options: MenuOption[], cap: number): string | null {
  for (const time of TIMES) {
    const count = options.filter((option) => option.time === time).length;
    if (count === 0) return `Falta al menos una opción de ${timeLabel(time)} para este comedor`;
    if (count === 1 && cap < 1) {
      return `Con una sola opción de ${timeLabel(time)} el tope de ${Math.round(cap * 100)} % no permite cubrir a todos`;
    }
  }
  return null;
}

function buildProgram(
  options: MenuOption[],
  input: MenuPlanningInput,
  limits: NutritionLimits,
  cap: number,
  includeBudget: boolean,
  objective: 'acceptance' | 'cost',
  fixedAcceptance?: number,
): LinearProgram {
  const constraints: LinearConstraint[] = [];

  for (const time of TIMES) {
    constraints.push({
      coefficients: options.map((option) => (option.time === time ? 1 : 0)),
      relation: '=',
      rhs: 1,
      label: `sum-${time}`,
    });
  }

  options.forEach((_, index) => {
    constraints.push({
      coefficients: options.map((__, column) => (column === index ? 1 : 0)),
      relation: '<=',
      rhs: cap,
      label: `cap-${options[index].id}`,
    });
  });

  addNutritionConstraints(constraints, options, limits, includeBudget, input.budget, input.line);

  if (fixedAcceptance !== undefined) {
    constraints.push({
      coefficients: coefficients(options, (o) => o.acceptance),
      relation: '=',
      rhs: fixedAcceptance,
      label: 'fixed-optimal-acceptance',
    });
  }

  return {
    objective: coefficients(options, objective === 'acceptance' ? (o) => o.acceptance : (o) => o.cost),
    sense: objective === 'acceptance' ? 'max' : 'min',
    constraints,
    variableNames: options.map((option) => option.id),
  };
}

function metrics(options: MenuOption[], vector: number[]) {
  const sum = (selector: (option: MenuOption) => number) =>
    options.reduce((total, option, index) => total + selector(option) * vector[index], 0);

  const acceptanceObjective = sum((option) => option.acceptance);
  return {
    kcal: sum((option) => option.kcal),
    carbs: sum((option) => option.carbs),
    protein: sum((option) => option.protein),
    sodium: sum((option) => option.sodium),
    cost: sum((option) => option.cost),
    acceptanceObjective,
    acceptancePerTime: acceptanceObjective / 4,
  };
}

function money(value: number): string {
  return `$${roundHalfUp(value, 2).toFixed(2).replace('.', ',')}`;
}

export function planMenu(input: MenuPlanningInput): MenuPlanResult {
  const limits = { ...DEFAULT_LIMITS, ...input.limits };
  const capThreshold = input.optionCapThreshold ?? 30;
  const configuredCap = input.optionCap ?? 0.6;
  const cap = input.diners >= capThreshold ? configuredCap : 1;
  const options = input.line === 'diabetes' ? input.options.filter((option) => !option.tags.includes('azúcar')) : input.options;

  const validationError = validateTimes(options, cap);
  if (validationError) {
    return { status: 'invalid-options', message: validationError, allocations: [] };
  }

  const primaryProgram = buildProgram(options, input, limits, cap, true, 'acceptance');
  const primary = solveLinearProgram(primaryProgram);

  if (primary.status !== 'optimal' || primary.objectiveValue === null) {
    const minimumCostProgram = buildProgram(options, input, limits, cap, false, 'cost');
    const minimumCost = solveLinearProgram(minimumCostProgram);

    if (minimumCost.status !== 'optimal' || minimumCost.objectiveValue === null) {
      return {
        status: 'nutrition-infeasible',
        message: 'Con estas opciones no hay bandeja que cumpla los requisitos nutricionales, aunque se aumente el presupuesto.',
        allocations: [],
        primaryTrace: primary.trace,
        minimumCostTrace: minimumCost.trace,
      };
    }

    const minCost = minimumCost.objectiveValue;
    return {
      status: 'budget-infeasible',
      message: `El presupuesto de ${money(input.budget)} por comensal no alcanza para cumplir los requisitos nutricionales. El mínimo posible es ${money(minCost)}.`,
      allocations: [],
      minimumPossibleCost: minCost,
      primaryTrace: primary.trace,
      minimumCostTrace: minimumCost.trace,
    };
  }

  const tieBreak = primary.alternateOptima
    ? solveLinearProgram(buildProgram(options, input, limits, cap, true, 'cost', primary.objectiveValue))
    : null;
  const chosen = tieBreak?.status === 'optimal' ? tieBreak : primary;
  const chosenVector = chosen.vector;
  const computedMetrics = metrics(options, chosenVector);
  const allocations = options.map((option, index) => ({
    option,
    proportion: chosenVector[index],
    portions: portionsToCook(chosenVector[index], input.diners),
  }));
  const totalPortions = allocations.reduce((sum, allocation) => sum + allocation.portions, 0);

  return {
    status: 'optimal',
    allocations,
    metrics: computedMetrics,
    totalPortions,
    slack: totalPortions - 4 * input.diners,
    hadAlternateOptima: primary.alternateOptima,
    primaryTrace: primary.trace,
    tieBreakTrace: tieBreak?.status === 'optimal' ? tieBreak.trace : undefined,
  };
}
