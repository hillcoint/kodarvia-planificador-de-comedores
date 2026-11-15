import { useMemo, useState, type ReactNode } from 'react';

export function VirtualRows<T>(props: {
  items: T[];
  rowHeight?: number;
  height?: number;
  overscan?: number;
  renderRow: (item: T, index: number) => ReactNode;
  empty?: ReactNode;
}) {
  const { items, renderRow, rowHeight = 52, height = 480, overscan = 8 } = props;
  const [scrollTop, setScrollTop] = useState(0);
  const range = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const visible = Math.ceil(height / rowHeight) + overscan * 2;
    const end = Math.min(items.length, start + visible);
    return { start, end };
  }, [scrollTop, rowHeight, height, overscan, items.length]);

  if (items.length === 0) return <>{props.empty ?? null}</>;

  return (
    <div
      className="overflow-auto rounded-xl border border-stone-200 bg-white"
      style={{ height }}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div style={{ height: items.length * rowHeight, position: 'relative' }}>
        {items.slice(range.start, range.end).map((item, offset) => {
          const index = range.start + offset;
          return (
            <div
              key={index}
              style={{
                position: 'absolute',
                top: index * rowHeight,
                left: 0,
                right: 0,
                height: rowHeight,
              }}
            >
              {renderRow(item, index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
