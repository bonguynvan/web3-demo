import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Web3Provider } from './components/Web3Provider'
import './i18n' // Initialize i18n before rendering
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Web3Provider>
      <App />
    </Web3Provider>
  </StrictMode>,
)
