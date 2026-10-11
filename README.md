# CineJuntos: Fase 1

**Estado: código escrito pero NO ejecutado ni compilado.** Verifícalo con los pasos de abajo.

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

## Pendiente (Fases 2 a 4)
Buffering coordinado, WebRTC, biblioteca del servidor, hash completo opcional, despliegue.
