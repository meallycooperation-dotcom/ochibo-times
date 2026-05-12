export type Role = 'user' | 'admin'

export interface Profile {
  id: string
  name: string
  email: string
  role: Role
  avatar_url: string | null
  created_at?: string
}

export interface BlogPost {
  id: string
  title: string
  content: string
  excerpt: string | null
  featured_image: string | null
  slug: string
  published: boolean
  author_id: string | null
  created_at: string
  updated_at: string | null
}

export interface PageView {
  id: string
  post_id: string | null
  viewed_at: string
}
