import { createFileRoute } from '@tanstack/react-router';
import { ManyarApp } from '../components/manyar/App';

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'Manyar — Planificador de comedores empresariales' },
      { name: 'description', content: 'Planificador de menús con programación lineal, encuestas y hoja de producción.' },
    ],
  }),
  component: ManyarApp,
});
