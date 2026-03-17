export default function middleware(req) {
    // 1. Obtenemos la "llave" de la puerta
    const auth = req.headers.get('authorization');

    // 2. Tu usuario y contraseña (poné los que quieras)
    const user = 'admin';
    const pass = 'tte123'; // Cambiala!

    // 3. Creamos el código secreto que el navegador espera
    const secret = btoa(`${user}:${pass}`);

    // 4. Si el usuario NO puso la clave correcta...
    if (auth !== `Basic ${secret}`) {
        // ...le mostramos el cartelito para que la ponga
        return new Response('Acceso restringido', {
            status: 401,
            headers: { 'WWW-Authenticate': 'Basic realm="Entrada Privada"' },
        });
    }

    // 5. Si la puso bien, lo dejamos pasar automáticamente
}

// Esto es para que proteja TODO el sitio
export const config = {
    matcher: '/:path*',
};