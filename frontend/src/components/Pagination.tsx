interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, total, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between text-sm text-text-secondary pt-4">
      <span>{total} total · page {page} of {totalPages}</span>
      <div className="flex gap-2">
        <button
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="px-3 py-1 rounded border border-border disabled:opacity-40 hover:bg-surface-overlay"
        >
          Prev
        </button>
        <button
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="px-3 py-1 rounded border border-border disabled:opacity-40 hover:bg-surface-overlay"
        >
          Next
        </button>
      </div>
    </div>
  );
}
