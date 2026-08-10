# Media Converter Pro

<div align="center">

![Version](https://img.shields.io/badge/version-2.1.0-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

**La herramienta definitiva para descargar música y videos**
YouTube + Spotify en una sola app.

[Características](#características) • [Instalación](#instalación) • [Uso](#uso) • [Arquitectura](#arquitectura)

</div>

---

## Características

### 🟢 Spotify Integration (Nuevo)
- **Playlists Completas** - Descarga cientos de canciones con un click.
- **Canciones Individuales** - Busca, descarga o cancela track por track.
- **Alta Calidad** - Metadatos automáticos (Carátula, Artista, Álbum).

### 🎵 Descarga de Audio
- **Audio (AAC)** - M4A optimizado para velocidad.
- **MP3** - 320kbps constante para máxima compatibilidad.
- **Youtube Search** - Buscador integrado sin salir de la app.

### 🎬 Descarga de Video
- **MP4** - Calidad seleccionable (1080p / 720p / 480p).
- **Merge Automático** - Video y audio se combinan sin pérdida.

### 🎨 Experiencia Premium
- **Gestión de Descargas** - Pausa, cancela y abre carpetas desde la app.
- **Diseño Moderno** - Interfaz Glassmorphism fluida y reactiva.
- **Tutorial Interactivo** - Guía paso a paso para nuevos usuarios.

---

## Instalación

### Ejecutable (Windows)
1. Descarga el último instalador o ejecutable portable desde `dist/`.
2. Ejecuta y disfruta. (Requiere conexión a internet para descargar `yt-dlp` en el primer uso).

### Desarrollo
```bash
# Copiar repositorio
git clone <repo>
cd media-converter-pro

# Instalar Bun (si no lo tienes)
winget install Oven-sh.Bun

# Instalar dependencias
bun install

# Iniciar en modo desarrollo
bun run start
```

### Build
```bash
bun run build  # Genera ejecutable en dist/
```

---

## Uso

1. **Pegar Link**:
   - YouTube: Videos o Playlists.
   - Spotify: Playlist, Álbum o Canción.
2. **Seleccionar Formato**:
   - Audio (M4A), MP3 o Video (MP4).
3. **Descargar**:
   - Gestiona todo desde la pestaña **Descargas**.

| Atajo | Acción |
|-------|--------|
| `Ctrl+V` | Pegar URL (YouTube/Spotify) |
| `Escape` | Limpiar input |

---

## Arquitectura (Refactored)

El proyecto sigue una arquitectura **Controller-Service** modularizada:

```
src/
├── main/                     # Backend (Electron Main Process)
│   ├── index.js              # Entry point & IPC Setup
│   ├── ipc/                  # Controllers (Manejo de IPC)
│   │   ├── youtube.js        # Controller principal
│   │   ├── spotify.js        # Controller Spotify
│   │   └── files.js          # Controller Archivos
│   └── services/             # Business Logic (Agnóstico de Electron)
│       ├── DownloadService.js # Wrapper yt-dlp & ffmpeg
│       ├── QueueService.js    # Gestión de estado de cola
│       └── SpotifyService.js  # API Spotify & Parsing
├── preload/
│   └── index.js              # ContextBridge (API Segura)
└── renderer/                 # Frontend (Vanilla JS + Components)
    ├── js/
    │   ├── app.js            # Router & State
    │   ├── components/       # Componentes UI
    │   │   ├── DownloadList.js
    │   │   ├── SpotifyComponent.js
    │   │   └── ToastComponent.js
    └── css/                  # Estilos (CSS Variables + Flexbox)
```

---

## Tecnologías

- **Electron** - Runtime de escritorio.
- **yt-dlp** - Motor de descarga core (actualizado automáticamente).
- **FFmpeg** - Procesamiento multimedia.
- **Spotify-dl logic** - Resolución de metadatos de Spotify a YouTube.

---

## Licencia

MIT License - Ver [LICENSE](LICENSE)

---

<div align="center">
Hecho con ❤️ por Media Converter Team
</div>
