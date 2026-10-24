# Media Converter Pro

<div align="center">

![Version](https://img.shields.io/badge/version-2.2.0-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20%2B%20Android-lightgrey.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Runtime](https://img.shields.io/badge/runtime-Bun%20%2F%20Node-black.svg)

**La herramienta definitiva para descargar música y videos**
YouTube + Spotify, con temas personalizables, arquitectura cliente-servidor y app Android.

[Características](#características) • [Arquitectura](#arquitectura) • [Instalación](#instalación) • [Usar desde el teléfono](#-usar-desde-el-teléfono) • [Desarrollo](#desarrollo-local)

</div>

---

## Características

### 📱 Nueva app Android (APK + PWA)
- **Arquitectura cliente-servidor**: el motor (yt-dlp + FFmpeg) corre en tu PC; el teléfono es el control remoto.
- **Emparejamiento por token**: ningún dispositivo de tu red puede controlar la app sin el token de 8 caracteres.
- **PWA instalable** y **APK nativo** (Capacitor) con la misma UI que el escritorio.
- **Compilación en la nube**: el APK se genera con GitHub Actions — no necesitas Android Studio.

### 🖥️ Escritorio más robusto
- **yt-dlp se auto-actualiza** cada 7 días (YouTube cambia y rompe yt-dlp con frecuencia).
- **Cookies del navegador** opcionales para sortear el bot-check de YouTube.
- **Metadatos ID3 corregidos**: títulos con espacios ahora se etiquetan bien, con carátula incluida.
- **Ventana única** (no se duplica la app) y render incremental de la cola (fluido en PCs modestas).

### 🟢 Spotify Integration
- Playlists completas, álbumes y canciones individuales, resueltos vía búsqueda inteligente en YouTube (prioriza VEVO/Topic).

### 🎵 Audio y 🎬 Video
- MP3 320kbps con metadatos y carátulas automáticas.
- MP4 Full HD con video + audio unificados sin pérdida.
- Buscador integrado con filtro de Música HQ.

### 🎨 4 Temas Visuales
Dark Pro · Tokyo Night · AIMP Orange · Retro 50s Diner — desde el menú hamburguesa.

---

## Arquitectura

```
src/
├── core/        # Lógica de negocio pura (SIN Electron): descargas, cola,
│   │            # Spotify, config, validadores
│   └── index.js #   AppCore: orquestación completa + eventos
├── server/      # API REST + SSE + estáticos (node:http puro, 0 dependencias)
│   └── standalone.js  # Servidor sin Electron (para VPS o modo headless)
├── desktop/     # Electron: shell fino que arranca el servidor local y carga la UI
└── web/         # UI única (escritorio + navegador + Android)
    ├── js/api.js     # Cliente HTTP/SSE con detección de entorno
    ├── manifest.webmanifest · sw.js   # PWA
    └── css/styles.css # Diseño responsive (bottom-nav en móvil)
android/         # Proyecto Capacitor (APK)
.github/workflows/android.yml  # CI: compila el APK
```

- **Escritorio**: Electron levanta el servidor en `127.0.0.1` y carga la misma UI web. El IPC casi desaparece (solo controles de ventana).
- **Teléfono**: activa "Acceso desde el teléfono" en el menú → la app escucha en tu red WiFi con token de emparejamiento.
- **REST + SSE**: la API y los eventos de la cola son idénticos para todos los clientes.

---

## Instalación

### Ejecutable (Windows)
1. Descarga el portable `Media Converter Pro-x.x.x-x64.exe` desde **Releases**.
2. Ejecuta — no requiere instalación. La primera vez descarga yt-dlp automáticamente.

### Desarrollo local (con Bun)
```bash
git clone https://github.com/alexandervi1/media-converter-pro.git
cd media-converter-pro
bun install
bun run dev        # escritorio con DevTools
bun run start      # escritorio normal
```

### Servidor standalone (sin Electron)
```bash
bun run server                          # 127.0.0.1:45690
node src/server/standalone.js --lan     # accesible en tu red (muestra URL + token)
```

### APK de Android
1. Haz push de un tag `android-vX.Y.Z` (o dispara el workflow manualmente).
2. En GitHub → pestaña **Actions** → ejecución completada → descarga el artifact `MediaConverterPro-APK`.
3. Copia el `.apk` al teléfono e instálalo (permite "orígenes desconocidos").

### PWA (sin APK)
Con el servidor en modo LAN, abre `http://IP-DE-TU-PC:45690` en el navegador del teléfono → "Agregar a pantalla de inicio".

---

## 📲 Usar desde el teléfono

1. En la **PC**: abre la app → menú hamburguesa → sección **Servidor** → activa *Acceso desde el teléfono*.
2. La app muestra la **dirección** (`http://192.168.x.x:45690`) y el **token**.
3. En el **teléfono** (APK o navegador): introduce ambos en la pantalla de conexión → **Conectar**.
4. Todo lo que descargues llega a la carpeta de la PC. La cola se sincroniza en tiempo real.

> La PC y el teléfono deben estar en la misma red WiFi. Si tu red usa aislamiento de clientes (AP isolation), conecta el teléfono a otra red o desactívalo en el router.

---

## Comandos

| Comando | Descripción |
|---|---|
| `bun run dev` | Escritorio en modo desarrollo |
| `bun run server` | Servidor standalone local |
| `bun run build:win` | Portable .exe para Windows |
| `bun run lint` / `format` | Calidad de código |
| `bun scripts/smoke-test.js` | Test integral core + servidor (16 checks) |

---

## Licencia

MIT — ver [LICENSE](LICENSE).
