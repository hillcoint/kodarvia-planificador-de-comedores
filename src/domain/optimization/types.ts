export type ConstraintRelation = '<=' | '>=' | '=';
export type ObjectiveSense = 'max' | 'min';

export interface LinearConstraint {
  coefficients: number[];
  relation: ConstraintRelation;
  rhs: number;
  label?: string;
}

export interface LinearProgram {
  objective: number[];
  sense: ObjectiveSense;
  constraints: LinearConstraint[];
  variableNames?: string[];
}

export interface TableauSnapshot {
  phase: 1 | 2;
  step: number;
  objectiveValue: number;
  basis: string[];
  columns: string[];
  rows: number[][];
  rhs: number[];
  reducedCosts: number[];
}

export interface PivotTrace {
  phase: 1 | 2;
  step: number;
  entering: string;
  leaving: string;
  pivotRow: number;
  pivotColumn: number;
  pivotValue: number;
  before: TableauSnapshot;
  after: TableauSnapshot;
}

export interface SimplexTrace {
  initial: TableauSnapshot;
  pivots: PivotTrace[];
  final: TableauSnapshot;
}

export type SolverStatus = 'optimal' | 'infeasible' | 'unbounded';

export interface LinearProgramSolution {
  status: SolverStatus;
  objectiveValue: number | null;
  variables: Record<string, number>;
  vector: number[];
  alternateOptima: boolean;
  trace: SimplexTrace;
}
