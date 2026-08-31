import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Apply the saved theme (default: dark) before first paint to avoid a flash.
const storedTheme = localStorage.getItem('theme')
document.documentElement.classList.toggle('dark', storedTheme !== 'light')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
