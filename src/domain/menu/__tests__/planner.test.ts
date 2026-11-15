import { describe, expect, it } from 'vitest';
import { TEST_MENU_OPTIONS } from '../fixtures';
import { planMenu } from '../planner';

function allocation(result: ReturnType<typeof planMenu>, id: string) {
  return result.allocations.find((item) => item.option.id === id);
}

describe('Manyar menu planner - mandatory briefing cases', () => {
  it('case 1: general line matches the exact expected optimum', () => {
    const result = planMenu({ options: TEST_MENU_OPTIONS, diners: 180, budget: 75, line: 'general' });

    expect(result.status).toBe('optimal');
    expect(allocation(result, 'S1')?.proportion).toBeCloseTo(0.6, 9);
    expect(allocation(result, 'S3')?.proportion).toBeCloseTo(0.4, 9);
    expect(allocation(result, 'F1')?.proportion).toBeCloseTo(0.503846153846, 9);
    expect(allocation(result, 'F2')?.proportion).toBeCloseTo(0.496153846154, 9);
    expect(allocation(result, 'G1')?.proportion).toBeCloseTo(0.4, 9);
    expect(allocation(result, 'G2')?.proportion).toBeCloseTo(0.6, 9);
    expect(allocation(result, 'A1')?.proportion).toBeCloseTo(0.6, 9);
    expect(allocation(result, 'A2')?.proportion).toBeCloseTo(0.4, 9);

    expect(result.metrics?.acceptancePerTime).toBeCloseTo(4.410384615, 9);
    expect(result.metrics?.cost).toBeCloseTo(60.276923077, 9);
    expect(result.metrics?.kcal).toBeCloseTo(780.153846154, 9);
    expect(result.metrics?.carbs).toBeCloseTo(82.246153846, 9);
    expect(result.metrics?.protein).toBeCloseTo(46.607692308, 9);
    expect(result.metrics?.sodium).toBeCloseTo(1500, 8);

    expect(allocation(result, 'S1')?.portions).toBe(108);
    expect(allocation(result, 'S3')?.portions).toBe(72);
    expect(allocation(result, 'F1')?.portions).toBe(91);
    expect(allocation(result, 'F2')?.portions).toBe(90);
    expect(allocation(result, 'G1')?.portions).toBe(72);
    expect(allocation(result, 'G2')?.portions).toBe(108);
    expect(allocation(result, 'A1')?.portions).toBe(108);
    expect(allocation(result, 'A2')?.portions).toBe(72);
    expect(result.totalPortions).toBe(721);
    expect(result.slack).toBe(1);
  });

  it('case 2: budget trap reports the exact minimum possible cost', () => {
    const result = planMenu({ options: TEST_MENU_OPTIONS, diners: 180, budget: 45, line: 'general' });

    expect(result.status).toBe('budget-infeasible');
    expect(result.minimumPossibleCost).toBeCloseTo(47.1, 9);
    expect(result.message).toBe(
      'El presupuesto de $45,00 por comensal no alcanza para cumplir los requisitos nutricionales. El mínimo posible es $47,10.',
    );
    expect(result.allocations).toHaveLength(0);
  });

  it('case 3: alternate optimum is detected and tie-broken by minimum cost', () => {
    const options = TEST_MENU_OPTIONS.map((option) =>
      option.id === 'S3' ? { ...option, acceptance: 4.6 } : option,
    );
    const result = planMenu({ options, diners: 180, budget: 75, line: 'general' });

    expect(result.status).toBe('optimal');
    expect(result.hadAlternateOptima).toBe(true);
    expect(allocation(result, 'S1')?.proportion).toBeCloseTo(0.452941176471, 9);
    expect(allocation(result, 'S3')?.proportion).toBeCloseTo(0.547058823529, 9);
    expect(allocation(result, 'F1')?.proportion).toBeCloseTo(0.6, 9);
    expect(allocation(result, 'F2')?.proportion).toBeCloseTo(0.4, 9);
    expect(allocation(result, 'G1')?.proportion).toBeCloseTo(0.4, 9);
    expect(allocation(result, 'G2')?.proportion).toBeCloseTo(0.6, 9);
    expect(allocation(result, 'A1')?.proportion).toBeCloseTo(0.6, 9);
    expect(allocation(result, 'A2')?.proportion).toBeCloseTo(0.4, 9);
    expect(result.metrics?.acceptancePerTime).toBeCloseTo(4.47, 9);
    expect(result.metrics?.cost).toBeCloseTo(60.141176471, 9);
    expect(result.metrics?.kcal).toBeCloseTo(773.705882353, 9);
    expect(result.metrics?.carbs).toBeCloseTo(80.458823529, 9);
    expect(result.metrics?.protein).toBeCloseTo(47.388235294, 9);
    expect(result.metrics?.sodium).toBeCloseTo(1500, 8);
    expect(result.totalPortions).toBe(721);
    expect(result.slack).toBe(1);
  });

  it('case 4: diabetes line with 23 diners uses cap 1 and excludes sugar', () => {
    const result = planMenu({ options: TEST_MENU_OPTIONS, diners: 23, budget: 75, line: 'diabetes' });

    expect(result.status).toBe('optimal');
    expect(allocation(result, 'A1')).toBeUndefined();
    expect(allocation(result, 'S1')?.proportion).toBeCloseTo(1, 9);
    expect(allocation(result, 'F1')?.proportion).toBeCloseTo(0.288461538462, 9);
    expect(allocation(result, 'F2')?.proportion).toBeCloseTo(0.711538461538, 9);
    expect(allocation(result, 'G2')?.proportion).toBeCloseTo(1, 9);
    expect(allocation(result, 'A2')?.proportion).toBeCloseTo(1, 9);
    expect(result.metrics?.acceptancePerTime).toBeCloseTo(4.278846154, 9);
    expect(result.metrics?.cost).toBeCloseTo(60.269230769, 9);
    expect(result.metrics?.kcal).toBeCloseTo(731.538461538, 9);
    expect(result.metrics?.carbs).toBeCloseTo(69.461538462, 9);
    expect(result.metrics?.protein).toBeCloseTo(46.576923077, 9);
    expect(result.metrics?.sodium).toBeCloseTo(1500, 8);
    expect(allocation(result, 'S1')?.portions).toBe(23);
    expect(allocation(result, 'F1')?.portions).toBe(7);
    expect(allocation(result, 'F2')?.portions).toBe(17);
    expect(allocation(result, 'G2')?.portions).toBe(23);
    expect(allocation(result, 'A2')?.portions).toBe(23);
    expect(result.totalPortions).toBe(93);
    expect(result.slack).toBe(1);
  });
});

describe('Manyar menu planner - edge cases', () => {
  it('does not run the model if a menu time has no available option', () => {
    const options = TEST_MENU_OPTIONS.filter((option) => option.time !== 'water');
    const result = planMenu({ options, diners: 180, budget: 75, line: 'general' });
    expect(result.status).toBe('invalid-options');
    expect(result.message).toBe('Falta al menos una opción de agua para este comedor');
  });

  it('applies the 0.6 cap to exactly 30 diners', () => {
    const result = planMenu({ options: TEST_MENU_OPTIONS, diners: 30, budget: 75, line: 'general' });
    expect(result.status).toBe('optimal');
    expect(Math.max(...result.allocations.map((item) => item.proportion))).toBeLessThanOrEqual(0.6 + 1e-9);
  });

  it('explains why one option cannot cover a time under the 60% cap', () => {
    const options = TEST_MENU_OPTIONS.filter((option) => option.time !== 'soup' || option.id === 'S1');
    const result = planMenu({ options, diners: 30, budget: 75, line: 'general' });
    expect(result.status).toBe('invalid-options');
    expect(result.message).toBe('Con una sola opción de sopa el tope de 60 % no permite cubrir a todos');
  });
});
