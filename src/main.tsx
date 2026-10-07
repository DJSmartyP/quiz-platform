import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    if (import.meta.env.DEV) {
      // A previously installed PWA worker can serve stale Vite modules and CSS
      // during local layout checks, even after a source edit and page reload.
      void navigator.serviceWorker.getRegistrations().then(registrations =>
        Promise.all(registrations.filter(registration => registration.scope.startsWith(location.origin)).map(registration => registration.unregister())),
      )
    } else {
      void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
    }
  })
}
