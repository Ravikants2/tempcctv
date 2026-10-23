interface TablePaginationProps {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}

export function TablePagination({ page, pageSize, totalItems, onPageChange }: TablePaginationProps) {
  const pageCount = Math.ceil(totalItems / pageSize);
  if (totalItems === 0) return null;

  const firstItem = (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, totalItems);

  return (
    <nav className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2 text-xs text-gray-600" aria-label="Table pagination">
      <span>Showing {firstItem}–{lastItem} of {totalItems}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded border px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          Previous
        </button>
        <span>Page {page} of {pageCount}</span>
        <button
          type="button"
          className="rounded border px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          aria-label="Next page"
        >
          Next
        </button>
      </div>
    </nav>
  );
}
