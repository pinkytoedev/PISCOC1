import { ChevronLeft, ChevronRight } from "lucide-react";

const MAX_PAGE_BUTTONS = 5;

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

interface DesktopPaginationProps extends PaginationProps {
  totalItems: number;
  pageSize: number;
}

/** Window of page numbers centred on the current page, clamped at both ends. */
function pageWindow(currentPage: number, totalPages: number): number[] {
  const count = Math.min(MAX_PAGE_BUTTONS, totalPages);
  return Array.from({ length: count }, (_, index) => {
    if (totalPages <= MAX_PAGE_BUTTONS || currentPage <= 3) return index + 1;
    if (currentPage >= totalPages - 2) return totalPages - 4 + index;
    return currentPage - 2 + index;
  });
}

export function ArticleTablePagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}: DesktopPaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
      <div className="flex sm:flex-1 sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-gray-700">
            Showing <span className="font-medium">{(currentPage - 1) * pageSize + 1}</span> to{" "}
            <span className="font-medium">{Math.min(currentPage * pageSize, totalItems)}</span> of{" "}
            <span className="font-medium">{totalItems}</span> articles
          </p>
        </div>
        <div className="ml-4">
          <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className={`relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 ${
                currentPage === 1 ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50 focus:z-20"
              }`}
            >
              <span className="sr-only">Previous</span>
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>

            {pageWindow(currentPage, totalPages).map((pageNumber) => (
              <button
                key={pageNumber}
                onClick={() => onPageChange(pageNumber)}
                aria-current={currentPage === pageNumber ? "page" : undefined}
                className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                  currentPage === pageNumber
                    ? "z-10 bg-primary text-white focus:z-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    : "text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20"
                }`}
              >
                {pageNumber}
              </button>
            ))}

            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className={`relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 ${
                currentPage === totalPages ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50 focus:z-20"
              }`}
            >
              <span className="sr-only">Next</span>
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </nav>
        </div>
      </div>
    </div>
  );
}

export function ArticleCardPagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6 mt-4 rounded-lg shadow">
      <div className="flex flex-1 justify-between items-center">
        <div>
          <p className="text-sm text-gray-700">
            Page <span className="font-medium">{currentPage}</span> of{" "}
            <span className="font-medium">{totalPages}</span>
          </p>
        </div>
        <div className="flex space-x-2">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className={`relative inline-flex items-center rounded-md px-3 py-2 text-sm font-semibold ${
              currentPage === 1
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-white text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
            }`}
          >
            Previous
          </button>
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className={`relative inline-flex items-center rounded-md px-3 py-2 text-sm font-semibold ${
              currentPage === totalPages
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-white text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
            }`}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
