import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import CryptoJS from 'crypto-js'
import App from './App.jsx'
import './index.css'

const SECRET_HASH = "831677c77f0d0143890252579294273f5507119f964a5728a47468132334812f";

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
  // En localhost pasamos directo
  if (window.location.hostname === 'localhost') return renderApp();

  // Si ya estamos autorizados
  if (sessionStorage.getItem('auth_token') === SECRET_HASH) return renderApp();

  const userPass = prompt("Ingresá la clave (TTE123):");

  if (userPass) {
    const cleanPass = userPass.trim();
    // Forzamos el formato HEX para que coincida con el SECRET_HASH
    const userHash = CryptoJS.SHA256(cleanPass).toString(CryptoJS.enc.Hex);

    if (userHash === SECRET_HASH) {
      sessionStorage.setItem('auth_token', userHash);
      renderApp();
    } else {
      alert("Clave incorrecta.");
      window.location.reload();
    }
  } else {
    document.body.innerHTML = "<h1 style='color:white;text-align:center;margin-top:20%'>Acceso Denegado</h1>";
  }
};

bouncer();