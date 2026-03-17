import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'

// 1. La clave en texto plano (sin vueltas)
const PASSWORD_SECRETA = "TTE123";

const renderApp = () => {
  const rootElement = document.getElementById('root');
  if (rootElement) {
    createRoot(rootElement).render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  }
};

const bouncer = () => {
  // En tu compu no te pide nada
  if (window.location.hostname === 'localhost') return renderApp();

  // Si ya pusiste la clave en esta sesión, pasás de largo
  if (sessionStorage.getItem('auth_access') === 'true') return renderApp();

  const userPass = prompt("Ingresá la clave de acceso:");

  // Comparamos directo el texto
  if (userPass && userPass.trim() === PASSWORD_SECRETA) {
    sessionStorage.setItem('auth_access', 'true');
    renderApp();
  } else if (userPass === null) {
    // Si toca "Cancelar"
    document.body.innerHTML = "<h1 style='color:white;text-align:center;margin-top:20%'>Acceso Denegado</h1>";
  } else {
    // Si le pifia
    alert("Clave incorrecta.");
    window.location.reload();
  }
};

bouncer();