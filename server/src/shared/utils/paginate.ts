/**
 * Pagination Utility Functions
 *
 * Every list endpoint in Nebula uses one of two consistent pagination patterns.
 * No ad-hoc implementations allowed — all list responses return the same shapes.
 *
 * Cursor-based — for time-ordered, real-time lists:
 *   Orders, transactions, notifications, audit logs, top-up history.
 *   Client sends ?cursor=base64value&limit=20, receives nextCursor + hasMore.
 *
 * Page-based — for admin management lists:
 *   Users, brokers, stocks, applications.
 *   Client sends ?page=1&limit=20, receives totalPages + totalCount.
 */

/** Standard cursor-based pagination response */
export interface CursorPaginationMeta {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

/** Standard page-based pagination response */
export interface PagePaginationMeta {
  page: number;
  totalPages: number;
  totalCount: number;
  limit: number;
}

/** Wrapper for cursor-paginated API responses */
export interface CursorPaginatedResponse<T> {
  data: T[];
  pagination: CursorPaginationMeta;
}

/** Wrapper for page-paginated API responses */
export interface PagePaginatedResponse<T> {
  data: T[];
  pagination: PagePaginationMeta;
}

/**
 * Encodes a cursor value to base64 for opaque client transmission.
 * The client should never inspect or construct cursors — they are opaque tokens.
 */
export function encodeCursor(value: string): string {
  return Buffer.from(value, 'utf-8').toString('base64');
}

/**
 * Decodes a base64 cursor back to its original value.
 * Returns null if the cursor is invalid — the endpoint returns the first page.
 */
export function decodeCursor(cursor: string): string | null {
  try {
    return Buffer.from(cursor, 'base64').toString('utf-8');
  } catch {
    return null;
  }
}

/**
 * Builds a cursor-based pagination response.
 *
 * @param data - The array of items (fetched with limit + 1 to determine hasMore)
 * @param limit - The requested page size
 * @param getCursor - Function that extracts the cursor string from an item (e.g. item.id or item.createdAt)
 */
export function buildCursorResponse<T>(
  data: T[],
  limit: number,
  getCursor: (item: T) => string,
): CursorPaginatedResponse<T> {
  const hasMore = data.length > limit;
  const items = hasMore ? data.slice(0, limit) : data;
  const nextCursor = hasMore && items.length > 0
    ? encodeCursor(getCursor(items[items.length - 1]))
    : null;

  return {
    data: items,
    pagination: { nextCursor, hasMore, limit },
  };
}

/**
 * Builds a page-based pagination response.
 *
 * @param data - The array of items for the current page
 * @param totalCount - Total number of items across all pages
 * @param page - Current page number (1-indexed)
 * @param limit - Items per page
 */
export function buildPageResponse<T>(
  data: T[],
  totalCount: number,
  page: number,
  limit: number,
): PagePaginatedResponse<T> {
  return {
    data,
    pagination: {
      page,
      totalPages: Math.ceil(totalCount / limit),
      totalCount,
      limit,
    },
  };
}