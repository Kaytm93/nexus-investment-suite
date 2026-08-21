import React from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { WatchlistProvider } from './context/WatchlistContext'
import Header from './components/Header'
import Home from './pages/Home'
import Auth from './pages/Auth'
import Screener from './pages/Screener'
import Analysis from './pages/Analysis'
import Portfolio from './pages/Portfolio'
import Settings from './pages/Settings'
import Chat from './pages/Chat'

// ─── Error Boundary ───────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[NEXUS] Unhandled render error:', error, info?.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div
          className="rounded-2xl p-8 max-w-md w-full text-center"
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: 'rgba(255,77,109,0.1)', border: '1px solid rgba(255,77,109,0.2)' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <h2 className="text-base font-semibold mb-2" style={{ color: 'var(--text)' }}>
            Etwas ist schiefgelaufen
          </h2>
          <p className="text-sm mb-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Diese Seite konnte nicht geladen werden. Das Problem wurde in der Konsole protokolliert.
          </p>
          {this.state.error?.message && (
            <p className="text-xs font-mono mb-5 px-3 py-2 rounded-lg" style={{ background: 'rgba(255,77,109,0.07)', color: 'var(--danger)' }}>
              {this.state.error.message}
            </p>
          )}
          <div className="flex gap-2 justify-center">
            <button
              className="btn-secondary text-xs"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Erneut versuchen
            </button>
            <button
              className="btn-primary text-xs"
              onClick={() => { window.location.href = '/' }}
            >
              Zur Startseite
            </button>
          </div>
        </div>
      </div>
    )
  }
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Laden…</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />
  }

  return children
}

function Layout({ children }) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      <div className="grain-overlay" />
      <Header />
      <main className="flex-1">
        {children}
      </main>
      <footer className="border-t py-5 mt-12 no-print" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span>© 2025 NEXUS Investment Suite. Keine Anlageberatung — alle Analysen dienen nur zu Informationszwecken.</span>
            <span className="font-mono">v1.0.0</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={
        <ErrorBoundary>
          <Layout>
            <Home />
          </Layout>
        </ErrorBoundary>
      } />
      <Route path="/auth" element={
        <ErrorBoundary>
          <Layout>
            <Auth />
          </Layout>
        </ErrorBoundary>
      } />
      <Route path="/screener" element={
        <ProtectedRoute>
          <ErrorBoundary>
            <Layout>
              <Screener />
            </Layout>
          </ErrorBoundary>
        </ProtectedRoute>
      } />
      <Route path="/analyse" element={
        <ProtectedRoute>
          <ErrorBoundary>
            <Layout>
              <Analysis />
            </Layout>
          </ErrorBoundary>
        </ProtectedRoute>
      } />
      <Route path="/portfolio" element={
        <ProtectedRoute>
          <ErrorBoundary>
            <Layout>
              <Portfolio />
            </Layout>
          </ErrorBoundary>
        </ProtectedRoute>
      } />
      <Route path="/settings" element={
        <ProtectedRoute>
          <ErrorBoundary>
            <Layout>
              <Settings />
            </Layout>
          </ErrorBoundary>
        </ProtectedRoute>
      } />
      <Route path="/chat" element={
        <ProtectedRoute>
          <ErrorBoundary>
            <Layout>
              <Chat />
            </Layout>
          </ErrorBoundary>
        </ProtectedRoute>
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <WatchlistProvider>
          <AppRoutes />
        </WatchlistProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
