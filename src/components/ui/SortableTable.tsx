import React, { Children, cloneElement, isValidElement, useMemo, useState } from 'react';

type SortDirection = 'asc' | 'desc';
export type TableSort = { column: number; direction: SortDirection } | null;
type TableElement = React.ReactElement<{ children?: React.ReactNode; [key: string]: unknown }>;

function textContent(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join(' ');
  if (isValidElement<{ children?: React.ReactNode; amount?: number }>(node)) {
    if (node.props.children !== undefined) return textContent(node.props.children);
    if (typeof node.props.amount === 'number') return String(node.props.amount);
  }
  return '';
}

function compareCells(left: string, right: string): number {
  const a = left.trim();
  const b = right.trim();
  const numericA = Number(a.replace(/[₹,\s%]/g, ''));
  const numericB = Number(b.replace(/[₹,\s%]/g, ''));
  if (a && b && Number.isFinite(numericA) && Number.isFinite(numericB)) return numericA - numericB;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function flattenFragments(nodes: React.ReactNode): React.ReactNode[] {
  return Children.toArray(nodes).flatMap(node => {
    if (isValidElement(node) && node.type === React.Fragment) {
      return flattenFragments((node.props as { children?: React.ReactNode }).children);
    }
    return [node];
  });
}

function sortableHeaders(
  node: React.ReactNode,
  column: number,
  activeColumn: number | null,
  direction: SortDirection,
  onSort: (column: number) => void
): React.ReactNode {
  if (!isValidElement<{ children?: React.ReactNode }>(node)) return node;
  if (node.type === 'th') {
    const heading = textContent(node.props.children);
    const sortable = heading.trim().length > 0 && !/^(actions|#)$/i.test(heading.trim());
    const active = activeColumn === column;
    return cloneElement(node as TableElement, {
      'aria-sort': active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none',
      children: sortable ? (
        <button
          type="button"
          className="inline-flex items-center gap-1 text-inherit hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
          onClick={() => onSort(column)}
          title={`Sort by ${heading}`}
        >
          {node.props.children}
          <span aria-hidden="true" className="text-[10px]">{active ? (direction === 'asc' ? '▲' : '▼') : '↕'}</span>
        </button>
      ) : node.props.children,
    });
  }
  return cloneElement(node as TableElement, {
    children: Children.map(node.props.children, child => sortableHeaders(child, column, activeColumn, direction, onSort)),
  });
}

function sortedRows(
  node: React.ReactNode,
  activeColumn: number | null,
  direction: SortDirection
): React.ReactNode {
  if (!isValidElement<{ children?: React.ReactNode }>(node)) return node;
  if (node.type === 'tbody' && activeColumn !== null) {
    const rows = flattenFragments(node.props.children).filter(isValidElement);
    const sorted = [...rows].sort((left, right) => {
      const leftCells = flattenFragments((left.props as { children?: React.ReactNode }).children);
      const rightCells = flattenFragments((right.props as { children?: React.ReactNode }).children);
      const result = compareCells(
        textContent((leftCells[activeColumn] as TableElement | undefined)?.props.children),
        textContent((rightCells[activeColumn] as TableElement | undefined)?.props.children)
      );
      return direction === 'asc' ? result : -result;
    });
    return cloneElement(node as TableElement, { children: sorted });
  }
  return cloneElement(node as TableElement, {
    children: Children.map(node.props.children, child => sortedRows(child, activeColumn, direction)),
  });
}

export function SortableTable({
  children,
  sort: controlledSort,
  onSortChange,
  ...props
}: React.TableHTMLAttributes<HTMLTableElement> & {
  sort?: TableSort;
  onSortChange?: (sort: TableSort) => void;
}) {
  const [internalSort, setInternalSort] = useState<TableSort>(null);
  const sort = controlledSort === undefined ? internalSort : controlledSort;
  const tableChildren = useMemo(() => Children.map(children, child => {
    if (!isValidElement<{ children?: React.ReactNode }>(child)) return child;
    if (child.type === 'thead') {
      let column = 0;
      return cloneElement(child as TableElement, {
        children: Children.map(child.props.children, row => {
          if (!isValidElement<{ children?: React.ReactNode }>(row)) return row;
          return cloneElement(row as TableElement, {
            children: Children.map(row.props.children, cell => {
              const currentColumn = column++;
              return sortableHeaders(cell, currentColumn, sort?.column ?? null, sort?.direction ?? 'asc', selected => {
                const nextSort: TableSort = {
                  column: selected,
                  direction: sort?.column === selected && sort?.direction === 'asc' ? 'desc' : 'asc',
                };
                if (onSortChange) onSortChange(nextSort);
                else setInternalSort(nextSort);
              });
            }),
          });
        }),
      });
    }
    return sortedRows(
      child,
      controlledSort === undefined ? sort?.column ?? null : null,
      sort?.direction ?? 'asc'
    );
  }), [children, controlledSort, onSortChange, sort]);

  return <table {...props}>{tableChildren}</table>;
}
