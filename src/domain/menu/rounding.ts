export function roundHalfUp(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.floor(value * factor + 0.5 + 1e-12) / factor;
}

export function portionsToCook(proportion: number, diners: number): number {
  const roundedToSix = roundHalfUp(proportion * diners, 6);
  if (roundedToSix <= 0) return 0;
  return Math.ceil(roundedToSix);
}
