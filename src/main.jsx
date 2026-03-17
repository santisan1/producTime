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
  if (window.location.hostname === 'localhost') return renderApp();

  const sessionAuth = sessionStorage.getItem('auth_token');
  if (sessionAuth === SECRET_HASH) return renderApp();

  const userPass = prompt("Ingresá la clave (TTE123):");

  if (userPass) {
    // .trim() borra espacios accidentales al principio o final
    const cleanPass = userPass.trim();
    const userHash = CryptoJS.SHA256(cleanPass).toString();

    if (userHash === SECRET_HASH) {
      sessionStorage.setItem('auth_token', userHash);
      renderApp();
    } else {
      alert("Clave incorrecta. ¡Ojo con las mayúsculas!");
      window.location.reload();
    }
  } else {
    document.body.innerHTML = "<h1 style='color:white;text-align:center;margin-top:20%'>Acceso Denegado</h1>";
  }
};
bouncer();