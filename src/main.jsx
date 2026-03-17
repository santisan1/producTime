import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import TransformerDashboard from './App.jsx' // O como se llame tu archivo

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <TransformerDashboard />
  </StrictMode>,
)