import { createContext, useContext, useState, type ReactNode } from 'react'

/* eslint-disable react-refresh/only-export-components */

interface SearchContextType {
  categoryFilter: string
  setCategoryFilter: (value: string) => void
}

const SearchContext = createContext<SearchContextType>({
  categoryFilter: '',
  setCategoryFilter: () => {},
})

export function SearchProvider({ children }: { children: ReactNode }) {
  const [categoryFilter, setCategoryFilter] = useState('')

  return (
    <SearchContext.Provider value={{ categoryFilter, setCategoryFilter }}>
      {children}
    </SearchContext.Provider>
  )
}

export function useSearchContext() {
  return useContext(SearchContext)
}
