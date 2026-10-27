import { AuthError, MembershipError, toUserMessage } from '../api/errors'

import { useAuthStore } from './authStore'

/**
 * Applies auth/membership failures raised by background `useQuery` calls.
 *
 * Pickers display their own inline error copy, but an expired token found by a
 * list/refresh query must still move the app back to the signed-out state so
 * the top bar, banners, and the next request agree with each other. Codes
 * 100/101 clear the token; 102 keeps the session and marks membership expired.
 * Other query errors are already shown by the picker and are left untouched.
 */
export function handleQueryError(error: unknown): void {
  if (error instanceof AuthError) {
    useAuthStore.getState().handleAuthFailure()
    return
  }

  if (error instanceof MembershipError) {
    useAuthStore.getState().handleMembershipExpired(toUserMessage(error))
  }
}
