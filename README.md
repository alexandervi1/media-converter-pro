# Media Converter Pro

<div align="center">

![Version](https://img.shields.io/badge/version-2.1.0-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Runtime](https://img.shields.io/badge/runtime-Bun%20%2F%20Node-black.svg)

**La herramienta definitiva para descargar música y videos**
YouTube + Spotify con Motor de Temas Personalizables en una sola app.

[Características](#características) • [Temas Visuales](#-sistema-de-temas-visuales-nuevo) • [Instalación](#instalación) • [Uso](#uso) • [Arquitectura](#arquitectura)

</div>

---

## Características

### 🎨 Sistema de Temas Visuales (Nuevo)
- **🌙 Dark Pro** - El diseño por defecto elegante y moderno.
- **🌃 Tokyo Night** - Inspirado en el cyberpunk y estética de noche en Tokio.
- **📻 AIMP Orange** - Estilo reproductor de audio industrial en tono naranja.
- **🎸 Retro 50s Diner** - Estética nostálgica de los años 50 (*Jukebox & Rockabilly*) con fuentes retro (*Righteous* & *Pacifico*) y botones con relieve.
- **🍔 Menú Hamburguesa & Tuerquita** - Drawer lateral deslizable con cambio de temas instantáneo y limpiador de caché.

### 🟢 Spotify Integration
- **Playlists Completas** - Descarga cientos de canciones con un solo clic.
- **Canciones Individuales** - Busca, descarga o cancela track por track.
- **Metadatos Automáticos** - Inserción automática de carátulas HQ, artista y título.

### 🎵 Descarga y Conversión de Audio
- **MP3 320kbps** - Audio en máxima calidad para la mejor fidelidad sonora.
- **Youtube Search Avanzado** - Buscador integrado con filtro de alta definición (Audio HQ / VEVO).

### 🎬 Descarga de Video
- **MP4 Full HD** - Formato MP4 con video e hilos de audio unificados sin pérdida.

### 📐 Diseño y Ventana Ampliada
- **Ventana Expandida** - Formato panorámico amplio (780x760) para administrar descargas cómodamente.
- **Alineación Armónica de Botones** - Botones de control, selectores de carpeta e información agrupados de forma limpia.

---

## Instalación

### Ejecutable (Windows)
1. Descarga el último ejecutable portable `Media Converter Pro-2.1.0-x64.exe` desde las **Releases de GitHub**.
2. Ejecuta y disfruta (no requiere instalación previa ni permisos especiales).

### Desarrollo Local (con Bun)
```bash
# Clonar el repositorio
git clone https://github.com/alexandervi1/media-converter-pro.git
cd media-converter-pro

# Instalar dependencias con Bun
bun install

# Compilar frontend e iniciar en desarrollo
bun run dev
```

### Build / Release
```bash
# Compilar ejecutable para Windows en /dist
bun run build:win
```

---

## Uso

1. **Pegar Link**:
   - **YouTube**: Enlaces de videos individuales o listas de reproducción.
   - **Spotify**: Enlaces de Playlists, Álbumes o Canciones.
2. **Seleccionar Formato**:
   - `🎵 MP3 320k` (Audio) o `🎬 MP4 Full HD` (Video).
3. **Cambiar Tema**:
   - Haz clic en el **Menú Hamburguesa** (arriba a la izquierda) o la **Tuerquita** (arriba a la derecha) para abrir el panel de temas.

---

## Arquitectura Modular

El proyecto sigue una arquitectura limpia **Controller-Service**:

```
src/
├── main/                     # Backend (Electron Main Process)
│   ├── index.js              # Entry point & IPC Setup
│   ├── window.js             # Configuración de Ventana (780x760)
│   ├── ipc/                  # Controllers (Manejo de llamadas IPC)
│   │   ├── youtube.js        # Controller principal de YouTube y Buscador
│   │   ├── spotify.js        # Controller de metadatos Spotify
│   │   └── files.js          # Controller de Archivos y Sistema
│   └── services/             # Business Logic (Agnóstico de UI)
│       ├── DownloadService.js # Motor de yt-dlp & FFmpeg
│       ├── QueueService.js    # Gestión de colas de descarga
│       └── SpotifyService.js  # Resolución Spotify a YouTube
├── preload/
│   └── index.js              # ContextBridge (API IPC Segura)
└── renderer/                 # Frontend
    ├── js/
    │   ├── app.js            # Lógica principal, Menú Hamburguesa & Temas
    │   ├── dom.js            # Mapa centralizado de elementos del DOM
    │   └── bundle.js         # Renderer bundle compilado con Esbuild
    └── css/
        └── styles.css        # Sistema de diseño con CSS Custom Properties (Temas)
```

---

## Tecnologías

- **Electron** - Runtime de escritorio.
- **Bun / Esbuild** - Empaquetado ultrarrápido de scripts y assets.
- **yt-dlp** - Motor de descarga multimedia core.
- **FFmpeg** - Procesamiento y conversión de audio/video.

---

## Licencia

MIT License - Ver [LICENSE](LICENSE)

---

<div align="center">
Hecho con ❤️ por Media Converter Team
</div>
