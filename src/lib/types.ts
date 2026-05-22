export type Role = 'user' | 'admin' | 'super-admin'
export type DraftType = 'blog' | 'book'
export type PostStatus = 'draft' | 'pending' | 'published' | 'rejected'

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
  status?: PostStatus
  author_id: string | null
  category: string | null
  created_at: string
  updated_at: string | null
}

export interface PageView {
  id: string
  post_id: string | null
  viewed_at: string
}

export interface Book {
  id: string
  title: string
  description: string | null
  cover_image: string | null
  slug: string
  published: boolean
  author_id: string | null
  created_at: string
  updated_at: string | null
}

export interface BookFormat {
  id: string
  book_id: string | null
  type: 'ebook' | 'physical' | null
  price: number
  stock: number | null
  ebook_file_url: string | null
  active: boolean | null
  created_at: string
}

export interface BookChapter {
  id: string
  book_id: string
  chapter_number: number
  title: string
  content: string
  image_url: string | null
  audio_url: string | null
  created_at: string
  updated_at: string | null
}

export interface Draft {
  id: string
  user_id: string
  type: DraftType
  title: string
  content: string | null
  excerpt: string | null
  cover_image: string | null
  chapter_title: string | null
  chapter_number: number | null
  category: string | null
  source_id: string | null
  last_saved_at: string
  is_ready: boolean
  created_at: string
  updated_at: string
}
