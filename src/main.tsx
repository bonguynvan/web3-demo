import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Web3Provider } from './components/Web3Provider'
import { installErrorReporter } from './lib/errorReporter'
import './i18n' // Initialize i18n before rendering
import './index.css'
import App from './App.tsx'

// Install runtime error capture before the React tree mounts so the
// reporter sees init-time exceptions too.
installErrorReporter()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Web3Provider>
      <App />
    </Web3Provider>
  </StrictMode>,
)
