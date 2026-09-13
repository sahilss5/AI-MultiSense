import React from 'react';

export interface Column<T> {
  header: string;
  accessor: (item: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  emptyMessage?: string;
  keyExtractor: (item: T) => string;
}

export function DataTable<T>({ columns, data, emptyMessage = 'No records found', keyExtractor }: DataTableProps<T>) {
  return (
    <div
      data-lenis-prevent
      className="table-wrapper w-full max-w-full min-w-0 overflow-x-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--card-shadow)] transition-colors"
    >
      <table className="w-full text-left text-xs font-sans text-[var(--text-primary)] border-collapse">
        <thead className="bg-[var(--bg-surface-secondary)] text-[11px] text-[var(--text-secondary)] font-sans font-medium border-b border-[var(--border-subtle)]">
          <tr>
            {columns.map((col, idx) => (
              <th
                key={idx}
                className={`px-4 py-3.5 font-semibold uppercase tracking-wider whitespace-nowrap ${col.className || ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)] font-sans">
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-[var(--text-muted)] italic font-sans">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((item) => (
              <tr key={keyExtractor(item)} className="hover:bg-[var(--bg-elevated)] transition-colors duration-150">
                {columns.map((col, idx) => (
                  <td key={idx} className={`px-4 py-3.5 whitespace-nowrap ${col.className || ''}`}>
                    {col.accessor(item)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
