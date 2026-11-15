import type { MenuOption } from './types';

export const TEST_MENU_OPTIONS: MenuOption[] = [
  { id: 'S1', name: 'Sopa de fideo', time: 'soup', kcal: 180, carbs: 28, protein: 5, sodium: 620, cost: 9.5, acceptance: 4.6, tags: [] },
  { id: 'S2', name: 'Crema de calabaza', time: 'soup', kcal: 150, carbs: 14, protein: 4, sodium: 380, cost: 11, acceptance: 3.9, tags: ['lácteo'] },
  { id: 'S3', name: 'Consomé de pollo con verduras', time: 'soup', kcal: 110, carbs: 8, protein: 9, sodium: 450, cost: 12.5, acceptance: 4.1, tags: [] },
  { id: 'F1', name: 'Pollo en mole', time: 'main', kcal: 420, carbs: 22, protein: 34, sodium: 780, cost: 38, acceptance: 4.8, tags: [] },
  { id: 'F2', name: 'Bistec a la mexicana', time: 'main', kcal: 380, carbs: 10, protein: 32, sodium: 520, cost: 44, acceptance: 4.4, tags: [] },
  { id: 'F3', name: 'Pescado a la veracruzana', time: 'main', kcal: 300, carbs: 8, protein: 30, sodium: 600, cost: 47, acceptance: 3.8, tags: ['pescado'] },
  { id: 'F4', name: 'Tortitas de papa con queso', time: 'main', kcal: 360, carbs: 38, protein: 12, sodium: 410, cost: 22, acceptance: 3.6, tags: ['lácteo'] },
  { id: 'G1', name: 'Arroz rojo', time: 'side', kcal: 200, carbs: 40, protein: 4, sodium: 310, cost: 6, acceptance: 4.3, tags: [] },
  { id: 'G2', name: 'Frijoles de la olla', time: 'side', kcal: 150, carbs: 26, protein: 9, sodium: 280, cost: 5, acceptance: 4.5, tags: [] },
  { id: 'G3', name: 'Ensalada de nopales', time: 'side', kcal: 40, carbs: 6, protein: 2, sodium: 210, cost: 7.5, acceptance: 3.4, tags: [] },
  { id: 'A1', name: 'Agua de jamaica con azúcar', time: 'water', kcal: 90, carbs: 23, protein: 0, sodium: 5, cost: 3, acceptance: 4.7, tags: ['azúcar'] },
  { id: 'A2', name: 'Agua de pepino con limón sin azúcar', time: 'water', kcal: 10, carbs: 2, protein: 0, sodium: 5, cost: 3.5, acceptance: 3.5, tags: [] },
];
