import { supabase } from './supabase'
import type { Profile } from './types'

export async function getCurrentSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}

export async function getProfileById(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email, role, avatar_url, created_at')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data as Profile | null
}

export async function isAdminSession(session: Awaited<ReturnType<typeof getCurrentSession>>) {
  if (!session?.user?.id || !session.user.email) {
    return false
  }

  const profile = await getProfileById(session.user.id)
  return Boolean(
    profile &&
      profile.email === session.user.email &&
      (profile.role === 'admin' || profile.role === 'super-admin'),
  )
}

export async function isSuperAdminSession(session: Awaited<ReturnType<typeof getCurrentSession>>) {
  if (!session?.user?.id || !session.user.email) {
    return false
  }

  const profile = await getProfileById(session.user.id)
  return Boolean(profile && profile.email === session.user.email && profile.role === 'super-admin')
}
