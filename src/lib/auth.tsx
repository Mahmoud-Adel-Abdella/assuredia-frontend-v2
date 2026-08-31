import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { apiLogin, apiMe, clearToken, getToken, setToken, type AuthUser } from "./api"

/**
 * Authentication state for the dashboard.
 *
 * - `login`/`setSession`/`logout` are the only ways state transitions.
 * - On mount, a stored token is validated against the real
 *   GET /dashboard-api/auth/me (the backend's /verify delegates to /me,
 *   so only /me is used). Any failure clears the token and returns to
 *   the login screen — no redirect loop.
 */
export type AuthStatus = "restoring" | "authenticated" | "unauthenticated"

type AuthContextValue = {
  status: AuthStatus
  user: AuthUser | null
  login: (email: string, password: string) => Promise<AuthUser>
  /** Adopt a session obtained outside the login form (e.g. the onboarding status check). */
  setSession: (user: AuthUser, token: string) => void
  logout: () => void
}

const AuthCtx = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(() => (getToken() ? "restoring" : "unauthenticated"))
  const [user, setUser] = useState<AuthUser | null>(null)

  useEffect(() => {
    if (!getToken()) return
    let cancelled = false
    apiMe()
      .then((restored) => {
        if (cancelled) return
        setUser(restored)
        setStatus("authenticated")
      })
      .catch(() => {
        if (cancelled) return
        clearToken()
        setUser(null)
        setStatus("unauthenticated")
      })
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const { user: authed, token } = await apiLogin(email, password)
    setToken(token)
    setUser(authed)
    setStatus("authenticated")
    return authed
  }, [])

  const setSession = useCallback((authed: AuthUser, token: string) => {
    setToken(token)
    setUser(authed)
    setStatus("authenticated")
  }, [])

  const logout = useCallback(() => {
    clearToken()
    setUser(null)
    setStatus("unauthenticated")
  }, [])

  const value = useMemo(
    () => ({ status, user, login, setSession, logout }),
    [status, user, login, setSession, logout],
  )

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>")
  return ctx
}
