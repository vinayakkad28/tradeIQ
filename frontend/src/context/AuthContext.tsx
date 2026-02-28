'use client'
import {
  createContext, useContext, useState, useEffect,
  useCallback, ReactNode,
} from 'react'
import { authAPI, userAPI } from '@/lib/api'

export interface User {
  id: string
  email: string
  full_name: string
  plan: 'free' | 'trader' | 'pro'
  onboarding_done: boolean
  created_at: string
}

interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, fullName: string) => Promise<void>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

function setTokens(access: string, refresh: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('access_token', access)
    localStorage.setItem('refresh_token', refresh)
  }
}

function clearTokens() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    try {
      const res = await userAPI.me()
      setUser(res.data.user ?? res.data)
    } catch {
      setUser(null)
      clearTokens()
    }
  }, [])

  // On mount: check if we have a stored token and fetch the user
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
    if (!token) {
      setIsLoading(false)
      return
    }
    refreshUser().finally(() => setIsLoading(false))
  }, [refreshUser])

  const login = useCallback(async (email: string, password: string) => {
    const res = await authAPI.login(email, password)
    const { tokens, user: u } = res.data
    setTokens(tokens.access_token, tokens.refresh_token)
    setUser(u)
  }, [])

  const register = useCallback(async (email: string, password: string, fullName: string) => {
    const res = await authAPI.register(email, password, fullName)
    const { tokens, user: u } = res.data
    setTokens(tokens.access_token, tokens.refresh_token)
    setUser(u)
  }, [])

  const logout = useCallback(async () => {
    const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('refresh_token') : null
    if (refreshToken) {
      try {
        await authAPI.logout(refreshToken)
      } catch {
        // Ignore — clear locally regardless
      }
    }
    clearTokens()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAuthenticated: !!user,
      login,
      register,
      logout,
      refreshUser,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
