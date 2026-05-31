// Точка входу React
import 'leaflet/dist/leaflet.css';
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  // Використовуємо StrictMode для виявлення потенційних проблем у додатку
  <StrictMode>
    <App />
  </StrictMode>,
)
