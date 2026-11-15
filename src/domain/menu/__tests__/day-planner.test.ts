import { describe, expect, it } from 'vitest';
import { generateDemoSeed } from '../../../data/seed';
import { planDay } from '../day-planner';

describe('full day planning', () => {
  it('plans the seed workload within the requested computation budget', () => {
    const seed = generateDemoSeed();
    const result = planDay({
      date: '2026-11-13',
      diningRooms: seed.diningRooms,
      options: seed.options,
      ratings: seed.ratings,
      settings: seed.settings[0],
    });

    expect(result.rooms).toHaveLength(14);
    expect(result.usedCapacity).toBeLessThanOrEqual(3200);
    expect(result.remainingCapacity).toBe(3200 - result.usedCapacity);
    const instrumented = process.argv.includes('--coverage');
    expect(result.acceptanceElapsedMs).toBeLessThan(instrumented ? 2500 : 1000);
    expect(result.elapsedMs).toBeLessThan(instrumented ? 6000 : 2000);
    expect(result.rooms.filter((room) => room.status === 'calculated').length).toBeGreaterThan(0);
  });

  it('marks a room as no-capacity and keeps considering later rooms', () => {
    const seed = generateDemoSeed();
    const settings = { ...seed.settings[0], centralCapacity: 300 };
    const result = planDay({
      date: '2026-11-13',
      diningRooms: seed.diningRooms,
      options: seed.options,
      ratings: seed.ratings,
      settings,
    });
    expect(result.rooms.some((room) => room.status === 'no-capacity')).toBe(true);
    expect(result.usedCapacity).toBeLessThanOrEqual(300);
  });
});
