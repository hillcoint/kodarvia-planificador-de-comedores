import type {
  ConstraintRelation,
  LinearConstraint,
  LinearProgram,
  LinearProgramSolution,
  SimplexTrace,
  TableauSnapshot,
} from './types';

export const SIMPLEX_TOLERANCE = 1e-9;

type ColumnKind = 'decision' | 'slack' | 'surplus' | 'artificial';

interface WorkingTableau {
  rows: number[][];
  rhs: number[];
  basis: number[];
  names: string[];
  kinds: ColumnKind[];
  originalCount: number;
}

interface RunResult {
  status: 'optimal' | 'unbounded';
  objectiveValue: number;
}

function clean(value: number, tolerance: number): number {
  if (Math.abs(value) <= tolerance) return 0;
  return value;
}

function flipRelation(relation: ConstraintRelation): ConstraintRelation {
  if (relation === '<=') return '>=';
  if (relation === '>=') return '<=';
  return '=';
}

function normalizeConstraint(constraint: LinearConstraint): LinearConstraint {
  if (constraint.rhs >= 0) return constraint;
  return {
    ...constraint,
    coefficients: constraint.coefficients.map((value) => -value),
    relation: flipRelation(constraint.relation),
    rhs: -constraint.rhs,
  };
}

function appendColumn(tableau: WorkingTableau, name: string, kind: ColumnKind): number {
  const index = tableau.names.length;
  tableau.names.push(name);
  tableau.kinds.push(kind);
  for (const row of tableau.rows) row.push(0);
  return index;
}

function buildTableau(program: LinearProgram): WorkingTableau {
  const originalCount = program.objective.length;
  const names = program.variableNames ?? program.objective.map((_, index) => `x${index + 1}`);
  if (names.length !== originalCount) {
    throw new Error('variableNames must match objective length');
  }

  for (const constraint of program.constraints) {
    if (constraint.coefficients.length !== originalCount) {
      throw new Error('All constraints must match objective length');
    }
  }

  const tableau: WorkingTableau = {
    rows: [],
    rhs: [],
    basis: [],
    names: [...names],
    kinds: Array.from({ length: originalCount }, () => 'decision' as const),
    originalCount,
  };

  program.constraints.map(normalizeConstraint).forEach((constraint, rowIndex) => {
    const row = [...constraint.coefficients];
    while (row.length < tableau.names.length) row.push(0);
    tableau.rows.push(row);
    tableau.rhs.push(constraint.rhs);

    if (constraint.relation === '<=') {
      const slack = appendColumn(tableau, `s${rowIndex + 1}`, 'slack');
      tableau.rows[rowIndex][slack] = 1;
      tableau.basis.push(slack);
      return;
    }

    if (constraint.relation === '>=') {
      const surplus = appendColumn(tableau, `u${rowIndex + 1}`, 'surplus');
      tableau.rows[rowIndex][surplus] = -1;
      const artificial = appendColumn(tableau, `a${rowIndex + 1}`, 'artificial');
      tableau.rows[rowIndex][artificial] = 1;
      tableau.basis.push(artificial);
      return;
    }

    const artificial = appendColumn(tableau, `a${rowIndex + 1}`, 'artificial');
    tableau.rows[rowIndex][artificial] = 1;
    tableau.basis.push(artificial);
  });

  return tableau;
}

function calculateReducedCosts(tableau: WorkingTableau, objective: number[]): number[] {
  const reduced = objective.slice();
  for (let i = 0; i < tableau.rows.length; i += 1) {
    const basicCost = objective[tableau.basis[i]] ?? 0;
    if (basicCost === 0) continue;
    for (let j = 0; j < reduced.length; j += 1) {
      reduced[j] -= basicCost * tableau.rows[i][j];
    }
  }
  return reduced;
}

function calculateObjectiveValue(tableau: WorkingTableau, objective: number[]): number {
  let value = 0;
  for (let i = 0; i < tableau.rows.length; i += 1) {
    value += (objective[tableau.basis[i]] ?? 0) * tableau.rhs[i];
  }
  return value;
}

function snapshot(
  tableau: WorkingTableau,
  objective: number[],
  phase: 1 | 2,
  step: number,
  tolerance: number,
): TableauSnapshot {
  return {
    phase,
    step,
    objectiveValue: clean(calculateObjectiveValue(tableau, objective), tolerance),
    basis: tableau.basis.map((index) => tableau.names[index]),
    columns: [...tableau.names],
    rows: tableau.rows.map((row) => row.map((value) => clean(value, tolerance))),
    rhs: tableau.rhs.map((value) => clean(value, tolerance)),
    reducedCosts: calculateReducedCosts(tableau, objective).map((value) => clean(value, tolerance)),
  };
}

function pivot(tableau: WorkingTableau, pivotRow: number, pivotColumn: number, tolerance: number): number {
  const value = tableau.rows[pivotRow][pivotColumn];
  if (Math.abs(value) <= tolerance) throw new Error('Cannot pivot on a zero element');

  for (let j = 0; j < tableau.names.length; j += 1) {
    tableau.rows[pivotRow][j] /= value;
  }
  tableau.rhs[pivotRow] /= value;

  for (let i = 0; i < tableau.rows.length; i += 1) {
    if (i === pivotRow) continue;
    const factor = tableau.rows[i][pivotColumn];
    if (Math.abs(factor) <= tolerance) {
      tableau.rows[i][pivotColumn] = 0;
      continue;
    }
    for (let j = 0; j < tableau.names.length; j += 1) {
      tableau.rows[i][j] -= factor * tableau.rows[pivotRow][j];
      tableau.rows[i][j] = clean(tableau.rows[i][j], tolerance);
    }
    tableau.rhs[i] -= factor * tableau.rhs[pivotRow];
    tableau.rhs[i] = clean(tableau.rhs[i], tolerance);
  }

  tableau.basis[pivotRow] = pivotColumn;
  return value;
}

function runSimplex(
  tableau: WorkingTableau,
  objective: number[],
  phase: 1 | 2,
  trace: SimplexTrace,
  tolerance: number,
): RunResult {
  let step = trace.pivots.length;

  while (true) {
    const reduced = calculateReducedCosts(tableau, objective);
    let entering = -1;

    // Bland: choose the lowest-index non-basic variable with positive reduced cost.
    for (let j = 0; j < reduced.length; j += 1) {
      if (tableau.basis.includes(j)) continue;
      if (reduced[j] > tolerance) {
        entering = j;
        break;
      }
    }

    if (entering === -1) {
      return {
        status: 'optimal',
        objectiveValue: calculateObjectiveValue(tableau, objective),
      };
    }

    let leavingRow = -1;
    let bestRatio = Number.POSITIVE_INFINITY;
    let bestBasisIndex = Number.POSITIVE_INFINITY;

    for (let i = 0; i < tableau.rows.length; i += 1) {
      const coefficient = tableau.rows[i][entering];
      if (coefficient <= tolerance) continue;
      const ratio = tableau.rhs[i] / coefficient;
      if (ratio < -tolerance) continue;

      if (
        ratio < bestRatio - tolerance ||
        (Math.abs(ratio - bestRatio) <= tolerance && tableau.basis[i] < bestBasisIndex)
      ) {
        bestRatio = ratio;
        bestBasisIndex = tableau.basis[i];
        leavingRow = i;
      }
    }

    if (leavingRow === -1) {
      return {
        status: 'unbounded',
        objectiveValue: calculateObjectiveValue(tableau, objective),
      };
    }

    const before = snapshot(tableau, objective, phase, step, tolerance);
    const leaving = tableau.names[tableau.basis[leavingRow]];
    const enteringName = tableau.names[entering];
    const pivotValue = tableau.rows[leavingRow][entering];
    pivot(tableau, leavingRow, entering, tolerance);
    step += 1;
    const after = snapshot(tableau, objective, phase, step, tolerance);

    trace.pivots.push({
      phase,
      step,
      entering: enteringName,
      leaving,
      pivotRow: leavingRow,
      pivotColumn: entering,
      pivotValue,
      before,
      after,
    });
  }
}

function removeArtificialColumns(tableau: WorkingTableau, tolerance: number): boolean {
  // Pivot artificial basic variables out whenever possible. Otherwise remove redundant zero rows.
  for (let i = tableau.rows.length - 1; i >= 0; i -= 1) {
    const basisIndex = tableau.basis[i];
    if (tableau.kinds[basisIndex] !== 'artificial') continue;

    let replacement = -1;
    for (let j = 0; j < tableau.names.length; j += 1) {
      if (tableau.kinds[j] === 'artificial') continue;
      if (Math.abs(tableau.rows[i][j]) > tolerance) {
        replacement = j;
        break;
      }
    }

    if (replacement !== -1) {
      pivot(tableau, i, replacement, tolerance);
      continue;
    }

    if (Math.abs(tableau.rhs[i]) > tolerance) return false;
    tableau.rows.splice(i, 1);
    tableau.rhs.splice(i, 1);
    tableau.basis.splice(i, 1);
  }

  const keep = tableau.kinds.map((kind, index) => ({ kind, index })).filter(({ kind }) => kind !== 'artificial');
  const indexMap = new Map<number, number>();
  keep.forEach(({ index }, newIndex) => indexMap.set(index, newIndex));

  tableau.rows = tableau.rows.map((row) => keep.map(({ index }) => row[index]));
  tableau.names = keep.map(({ index }) => tableau.names[index]);
  tableau.kinds = keep.map(({ kind }) => kind);
  tableau.basis = tableau.basis.map((index) => {
    const remapped = indexMap.get(index);
    if (remapped === undefined) throw new Error('Artificial variable remained in basis');
    return remapped;
  });

  return true;
}

function solutionVector(tableau: WorkingTableau, tolerance: number): number[] {
  const vector = Array.from({ length: tableau.originalCount }, () => 0);
  for (let i = 0; i < tableau.basis.length; i += 1) {
    const index = tableau.basis[i];
    if (index < tableau.originalCount) vector[index] = clean(tableau.rhs[i], tolerance);
  }
  return vector;
}

function hasAlternateOptima(tableau: WorkingTableau, objective: number[], tolerance: number): boolean {
  const reduced = calculateReducedCosts(tableau, objective);
  for (let j = 0; j < tableau.names.length; j += 1) {
    if (tableau.basis.includes(j)) continue;
    if (Math.abs(reduced[j]) > tolerance) continue;
    // A zero reduced-cost non-basic column that can enter identifies an alternate optimal basis.
    // It may be a decision variable or a slack/surplus variable representing movement along
    // an optimal face of the original feasible region.
    if (tableau.rows.some((row) => row[j] > tolerance)) return true;
  }
  return false;
}

export function solveLinearProgram(program: LinearProgram, tolerance = SIMPLEX_TOLERANCE): LinearProgramSolution {
  const tableau = buildTableau(program);
  const phase1Objective = tableau.kinds.map((kind) => (kind === 'artificial' ? -1 : 0));
  const trace: SimplexTrace = {
    initial: snapshot(tableau, phase1Objective, 1, 0, tolerance),
    pivots: [],
    final: snapshot(tableau, phase1Objective, 1, 0, tolerance),
  };

  const phase1 = runSimplex(tableau, phase1Objective, 1, trace, tolerance);
  if (phase1.status === 'unbounded') {
    trace.final = snapshot(tableau, phase1Objective, 1, trace.pivots.length, tolerance);
    return {
      status: 'infeasible',
      objectiveValue: null,
      variables: {},
      vector: [],
      alternateOptima: false,
      trace,
    };
  }

  if (phase1.objectiveValue < -tolerance || !removeArtificialColumns(tableau, tolerance)) {
    trace.final = snapshot(tableau, phase1Objective, 1, trace.pivots.length, tolerance);
    return {
      status: 'infeasible',
      objectiveValue: null,
      variables: {},
      vector: [],
      alternateOptima: false,
      trace,
    };
  }

  const multiplier = program.sense === 'max' ? 1 : -1;
  const phase2Objective = tableau.names.map((_, index) =>
    index < program.objective.length ? multiplier * program.objective[index] : 0,
  );

  const phase2 = runSimplex(tableau, phase2Objective, 2, trace, tolerance);
  if (phase2.status === 'unbounded') {
    trace.final = snapshot(tableau, phase2Objective, 2, trace.pivots.length, tolerance);
    return {
      status: 'unbounded',
      objectiveValue: null,
      variables: {},
      vector: [],
      alternateOptima: false,
      trace,
    };
  }

  const vector = solutionVector(tableau, tolerance);
  const names = program.variableNames ?? program.objective.map((_, index) => `x${index + 1}`);
  const variables = Object.fromEntries(names.map((name, index) => [name, vector[index]]));
  const rawObjective = program.objective.reduce((sum, coefficient, index) => sum + coefficient * vector[index], 0);
  const alternateOptima = hasAlternateOptima(tableau, phase2Objective, tolerance);

  trace.final = snapshot(tableau, phase2Objective, 2, trace.pivots.length, tolerance);

  return {
    status: 'optimal',
    objectiveValue: clean(rawObjective, tolerance),
    variables,
    vector,
    alternateOptima,
    trace,
  };
}
