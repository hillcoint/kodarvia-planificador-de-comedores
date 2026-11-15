import type { SimplexTrace, TableauSnapshot } from '../../domain/optimization/types';
import { number } from '../../lib/format';

function Snapshot({ value }: { value: TableauSnapshot }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200 bg-stone-50 p-3">
      <div className="mb-2 flex flex-wrap gap-3 text-xs text-stone-600">
        <span>Fase {value.phase}</span>
        <span>Paso {value.step}</span>
        <span>Objetivo {number(value.objectiveValue, 6)}</span>
      </div>
      <table className="min-w-max text-xs tabular-nums">
        <thead>
          <tr>
            <th className="px-2 py-1 text-left">Base</th>
            {value.columns.map((column) => <th key={column} className="px-2 py-1 text-right">{column}</th>)}
            <th className="px-2 py-1 text-right">RHS</th>
          </tr>
        </thead>
        <tbody>
          {value.rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-t border-stone-200">
              <td className="px-2 py-1 font-medium">{value.basis[rowIndex] ?? '—'}</td>
              {row.map((cell, index) => <td key={index} className="px-2 py-1 text-right">{number(cell, 5)}</td>)}
              <td className="px-2 py-1 text-right font-semibold">{number(value.rhs[rowIndex], 5)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SimplexTraceView({ trace, title }: { trace?: SimplexTrace; title: string }) {
  if (!trace) return null;
  return (
    <details className="rounded-xl border border-stone-200 bg-white p-4">
      <summary className="cursor-pointer font-semibold text-stone-900">{title}</summary>
      <div className="mt-4 space-y-4">
        <div>
          <h4 className="mb-2 text-sm font-semibold">Tabla inicial</h4>
          <Snapshot value={trace.initial} />
        </div>
        {trace.pivots.map((pivot) => (
          <div key={`${pivot.phase}-${pivot.step}`} className="rounded-lg border border-stone-200 p-3">
            <p className="mb-2 text-sm">
              <strong>Fase {pivot.phase}, pivote {pivot.step}:</strong> entra {pivot.entering}, sale {pivot.leaving},
              elemento pivote {number(pivot.pivotValue, 6)}.
            </p>
            <Snapshot value={pivot.after} />
          </div>
        ))}
        <div>
          <h4 className="mb-2 text-sm font-semibold">Tabla final</h4>
          <Snapshot value={trace.final} />
        </div>
      </div>
    </details>
  );
}
