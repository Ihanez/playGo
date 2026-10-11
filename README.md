# CineJuntos: Fase 2

**Estado: la Fase 1 fue probada por el usuario; la Fase 2 está escrita pero NO ejecutada ni compilada.** Verifícala con los pasos de abajo.

## Requisitos
Node.js 20+ y npm 9+.

## Instalar y probar
```
npm install
npm test
```
`npm test` ejecuta las pruebas de salas, límite de dos usuarios, reconexión y sincronización (vitest).

## Ejecutar en local
Terminal 1: `npm run dev:server` (puerto 4000)
Terminal 2: `npm run dev:web` (puerto 3000)

Variables de entorno: ver `.env.example`. Copia las de servidor a `apps/server/.env` (exporta `PORT` y `ALLOWED_ORIGINS` en tu shell, el servidor no carga .env solo) y las de web a `apps/web/.env.local`.

## Probar con dos navegadores
1. Abre http://localhost:3000 y pulsa **Crear sala**.
2. Copia la URL completa (incluye `#...`) y ábrela en otra ventana o navegador distinto.
3. Entra con un nombre en cada una; elige el **mismo archivo de video** en ambas.
4. Cuando diga "Ambos tienen el mismo archivo", usa play, pausa y seek en cualquiera.
5. Una tercera ventana con el mismo enlace debe ser rechazada.

## Pendiente (Fases 3 y 4)
Buffering coordinado, biblioteca del servidor, hash completo opcional, despliegue.

## Fase 2: compartir pantalla
Pestaña **Compartir pantalla** en la sala: uno comparte (pantalla, ventana o pestaña) y el otro la ve. Solo uno comparte a la vez.
Probar: dos ventanas en Chrome o Edge de escritorio, entra con ambas, en una pulsa *Compartir pantalla*, elige una pestaña con «compartir audio» marcado.
- Calidad: tres perfiles (720p30, 1080p30, 1080p60) con límite de bitrate; en los de menor perfil prima mantener los FPS. Se muestran resolución, FPS, kbps, RTT y paquetes perdidos.
- **TURN:** con solo STUN, WebRTC falla en redes restrictivas (datos móviles, algunas redes de empresa o universidad). Configura `TURN_URLS` y `TURN_SECRET` (coturn con `use-auth-secret`) en el servidor. El relay consume ancho de banda.
- Audio: solo Chrome/Edge de escritorio; el audio del sistema completo solo en Windows; de pestaña, en cualquier sistema. Firefox y Safari no capturan audio.
- Celulares: pueden ver, pero no compartir. Contenido con DRM (Netflix, etc.) sale negro: no es un fallo de la app.
- El navegador exige HTTPS (o localhost) para `getDisplayMedia`.
