import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import CryptoJS from 'crypto-js' // Importamos la librería
import App from './App.jsx'
import './index.css'


const SECRET_HASH = "831677c77f0d0143890252579294273f5507119f964a5728a47468132334812f";

const renderApp = () => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
};

// 2. Lógica del Bouncer
const bouncer = () => {
  // Si estás trabajando en tu compu (localhost), no te pide nada
  if (window.location.hostname === 'localhost') {
    return renderApp();
  }

  // Si ya pusiste la clave antes, te deja pasar
  if (sessionStorage.getItem('auth_token') === SECRET_HASH) {
    return renderApp();
  }

  // Si no, te pide la clave
  const userPass = prompt("Acceso restringido. Ingresá la clave:");

  if (userPass) {
    const userHash = CryptoJS.SHA256(userPass).toString();
    if (userHash === SECRET_HASH) {
      sessionStorage.setItem('auth_token', userHash);
      renderApp();
    } else {
      alert("Clave incorrecta.");
      window.location.reload(); // Recarga para volver a preguntar
    }
  } else {
    document.body.innerHTML = "<h1 style='color:white;text-align:center;margin-top:20%'>Acceso Denegado</h1>";
  }
};

bouncer();