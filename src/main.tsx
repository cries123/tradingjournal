import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AuthProvider } from './context/AuthContext'
import { EntitlementProvider } from './context/EntitlementContext'
import { SettingsProvider } from './context/SettingsContext'
import { installGlobalErrorReporting, reportErrorSilently } from './services/errorReporting'
import { installDomGuard } from './utils/domGuard'
import './index.css'
import App from './App.tsx'

// Before anything renders, so a crash during the first paint is still caught.
installGlobalErrorReporting()

/*
 * Before React holds a reference to a single DOM node.
 *
 * Chrome's page translation rewraps text nodes, which leaves React inserting siblings relative to
 * a node that is no longer where it left it — "Failed to execute 'insertBefore'", and the whole
 * page unmounts into the error boundary. Extensions that rewrite the page do the same thing.
 * Nothing in this app touches the DOM below <body>, so there is no bug here to fix; this makes
 * the two operations survive it instead.
 *
 * Reported once per session, so this stays visible as a real thing happening to real people
 * rather than becoming a silent repair nobody ever learns about.
 */
installDomGuard((operation) => {
  reportErrorSilently(
    new Error(`Recovered from an outside DOM change during ${operation} (page translation or an extension)`),
    'promise',
    'dom-guard',
  )
})

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
