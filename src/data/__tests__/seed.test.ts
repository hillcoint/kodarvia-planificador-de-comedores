import { describe, expect, it } from 'vitest';
import { generateDemoSeed } from '../seed';

describe('deterministic demo seed', () => {
  it('generates the complete requested demo volume', () => {
    const seed = generateDemoSeed();
    expect(seed.diningRooms).toHaveLength(14);
    expect(seed.diningRooms.some((room) => room.diners === 23)).toBe(true);
    expect(seed.options).toHaveLength(60);
    expect(seed.ratings).toHaveLength(45000);
    expect(seed.menus).toHaveLength(3600);
    expect(seed.events).toHaveLength(3000);
    expect(seed.settings[0].centralCapacity).toBe(3200);
  });

  it('is reproducible with seed 5537', () => {
    const a = generateDemoSeed();
    const b = generateDemoSeed();
    expect(a.diningRooms).toEqual(b.diningRooms);
    expect(a.options).toEqual(b.options);
    expect(a.ratings.slice(0, 20)).toEqual(b.ratings.slice(0, 20));
  });
});
