import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AuthProvider } from './context/AuthContext'
import { EntitlementProvider } from './context/EntitlementContext'
import { SettingsProvider } from './context/SettingsContext'
import { installGlobalErrorReporting } from './services/errorReporting'
import './index.css'
import App from './App.tsx'

// Before anything renders, so a crash during the first paint is still caught.
installGlobalErrorReporting()

const rootEl = document.getElementById('root')!
const isApp = window.location.pathname.startsWith('/app')
rootEl.classList.add(isApp ? 'route-app' : 'route-public')

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <EntitlementProvider>
          <SettingsProvider>
            <App />
          </SettingsProvider>
        </EntitlementProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
)
