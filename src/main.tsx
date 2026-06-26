import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './context/AuthContext'
import './index.css'
import App from './App.tsx'

const rootEl = document.getElementById('root')!
const isApp = window.location.pathname.startsWith('/app')
rootEl.classList.add(isApp ? 'route-app' : 'route-public')

createRoot(rootEl).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
)
