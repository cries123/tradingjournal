import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AuthProvider } from './context/AuthContext'
import { SettingsProvider } from './context/SettingsContext'
import './index.css'
import App from './App.tsx'

const rootEl = document.getElementById('root')!
const isApp = window.location.pathname.startsWith('/app')
rootEl.classList.add(isApp ? 'route-app' : 'route-public')

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <SettingsProvider>
          <App />
        </SettingsProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
