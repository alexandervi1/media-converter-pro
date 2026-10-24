# Guía de desarrollo - Media Converter Pro v2.2

## 1. Qué es

App de escritorio (Electron) + web/PWA + Android (Capacitor) para descargar
audio/video de YouTube y playlists de Spotify. El motor de descargas
(yt-dlp + FFmpeg) corre SIEMPRE en la PC; los demás clientes son interfaces.

## 2. Arquitectura (v2.2 — cliente-servidor unificada)

```
src/
  core/     → AppCore (index.js): cola, descargas, Spotify, settings.
              Servicios: DownloadService, QueueService, SpotifyService.
              SIN dependencias de Electron (rutas inyectadas).
  server/   → node:http puro: REST /api/*, SSE /api/events, estáticos de web/.
              Token de emparejamiento para clientes LAN (loopback exento).
              standalone.js: servidor sin Electron (--lan --port --data-dir).
  desktop/  → Electron: single-instance, arranca core+server en 127.0.0.1,
              carga la UI web. IPC mínimo (ventana, diálogo carpeta, LAN).
  web/      → UI única: js/api.js (fetch + EventSource), app.js, PWA
              (manifest, sw.js), responsive móvil (bottom nav).
android/    → Proyecto Capacitor (webDir=src/web, cleartext LAN).
.github/    → Workflow que compila el APK (tag android-*).
```

**Regla de oro**: la lógica nueva va en `core/` (sin Electron). Si necesita
capacidad nativa (diálogos, shell), se inyecta como hook desde `desktop/`
(patrón `onSelectFolder`) o se expone como capability vía `/api/health`.

## 3. Flujo de una descarga

1. Cliente → `POST /api/queue/add` → AppCore.addToQueue (valida URL, agrega,
   dispara metadata en background).
2. Cliente → `POST /api/queue/start` → processQueueLoop (secuencial).
3. Audio: `downloadBestAudio` con template `%(ext)s` + `--print
   after_move:filepath` → conversión ffmpeg (temp) → renombrado con título
   limpio → metadatos ID3 + portada → mover a `<carpeta>/mp3|mp4/`.
4. Eventos `queue-update` (throttle 250ms) via SSE a todos los clientes.
5. Spotify: sin URL — item con searchQuery "artista - canción audio" resuelto
   por búsqueda con ranking VEVO/Topic.

## 4. Verificación

- `bun scripts/smoke-test.js` — 16 checks: core, auth token LAN, SSE,
  estáticos, descarga real, conversión, metadatos.
- Arranque escritorio: `bun run start` (log muestra puerto local).
- Flujo móvil: `node src/server/standalone.js --lan` + navegador del teléfono
  (pantalla de conexión → token → app completa).
- APK: push tag `android-*` → GitHub Actions → artifact.

## 5. Puntos delicados conocidos

- **Bot-check de YouTube** ("Sign in to confirm you're not a bot"): según IP.
  Mitigación: menú → Conexión → cookies del navegador (cookies de sesión real).
  yt-dlp se auto-actualiza semanalmente (`.last_update` en bin/).
- **applyMediaMetadata** usa spawn directo de ffmpeg: el tokenizador de
  fluent-ffmpeg rompía títulos con espacios. No volver a fluent-ffmpeg ahí.
- **Windows EPERM en temp**: el `yt-dlp -U` en background bloquea el binario
  unos segundos; limpiezas de bin/ deben ser best-effort.
- **Throttle de cola**: los eventos van leading+trailing 250ms; el render del
  renderer es incremental (mapa id→elemento). Mantener así.

## 6. Comandos

### Instalar Bun (Windows)

```powershell
winget install Oven-sh.Bun
```

Más info: https://bun.sh — Bun también puede instalarse en macOS/Linux con
`curl -fsSL https://bun.sh/install | bash`. Node 18+ funciona como alternativa
para el core/servidor (Electron siempre usa su Node embebido).

### Comandos del proyecto

```bash
bun install
bun run dev            # escritorio + DevTools
bun run start          # escritorio
bun run server         # standalone 127.0.0.1:45690
bun run bundle:renderer  # solo rebuild de web/js/bundle.js
bun run build:win      # portable .exe
bun run lint           # eslint (src + scripts)
bun scripts/smoke-test.js
```

### Organización del repo

```
design/iconos/   # iconos fuente (Android/Apple/MS/favicon) usados para
                 # generar los de PWA (src/web/icons) y Android (mipmap)
build/           # recursos de electron-builder
scripts/         # smoke test
```


## 7. Pendientes sugeridos

- Probar un build portable completo (`bun run build:win`) tras el refactor.
- Firmar el APK (keystore en Secrets de GitHub) para distribución.
- Considerar IndexedDB para historial persistente de descargas.
