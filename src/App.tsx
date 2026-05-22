import './App.css'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AudioProvider } from './context/AudioContext'
import { CartProvider } from './context/CartContext'
import { SiteLayout } from './components/SiteLayout'
import { BookPage } from './pages/BookPage'
import { CartPage } from './pages/CartPage'
import { CheckoutLocationPage } from './pages/CheckoutLocationPage'
import { DashboardPage } from './pages/DashboardPage'
import { DonatePage } from './pages/DonatePage'
import { BookAudioPage } from './pages/BookAudioPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { MerchandisePage } from './pages/MerchandisePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PostPage } from './pages/PostPage'
import { ProductDetailPage } from './pages/ProductDetailPage'
import { ProfilePage } from './pages/ProfilePage'
import { SignupPage } from './pages/SignupPage'
import { SearchProvider } from './context/SearchContext'

export default function App() {
  return (
    <AudioProvider>
      <CartProvider>
        <BrowserRouter>
          <SearchProvider>
            <Routes>
              <Route element={<SiteLayout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/donate" element={<DonatePage />} />
                <Route path="/merchandise" element={<MerchandisePage />} />
                <Route path="/merchandise/:id" element={<ProductDetailPage />} />
                <Route path="/cart" element={<CartPage />} />
                <Route path="/checkout/location" element={<CheckoutLocationPage />} />
                <Route path="/post/:slug" element={<PostPage />} />
                <Route path="/book/:slug/audio" element={<BookAudioPage />} />
                <Route path="/book/:slug" element={<BookPage />} />
                <Route path="/profile" element={<ProfilePage />} />
              </Route>

              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </SearchProvider>
        </BrowserRouter>
      </CartProvider>
    </AudioProvider>
  )
}
