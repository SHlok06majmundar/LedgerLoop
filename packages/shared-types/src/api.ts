export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccess<T, M = PaginationMeta | null> {
  success: true;
  message: string;
  data: T;
  meta: M;
}

export interface ApiError {
  success: false;
  message: string;
  errorCode: string;
  details: unknown;
}

export type ApiResponse<T, M = PaginationMeta | null> = ApiSuccess<T, M> | ApiError;
