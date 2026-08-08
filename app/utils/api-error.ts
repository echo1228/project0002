import type { ApiErrorBody } from '../../shared/types'

export function apiErrorMessage(error: unknown, fallback = '操作失败，请稍后重试'): string {
  const value = error as { data?: ApiErrorBody, message?: string }
  return value?.data?.data?.message
    || value?.data?.statusMessage
    || value?.message
    || fallback
}

export function apiStatusCode(error: unknown): number | undefined {
  const value = error as { statusCode?: number, response?: { status?: number } }
  return value.statusCode || value.response?.status
}
