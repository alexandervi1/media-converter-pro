# Media Converter Pro

<div align="center">

![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

**Descarga música y videos de YouTube en segundos**

[Características](#características) • [Instalación](#instalación) • [Uso](#uso) • [Arquitectura](#arquitectura)

</div>

---

## Características

### 🎵 Descarga de Audio
- **Audio (AAC)** - M4A rápido, excelente calidad
- **MP3** - 320kbps, compatible con todo
- 4 conexiones paralelas para máxima velocidad

### 🎬 Descarga de Video
- **MP4** - 1080p / 720p / 480p con audio
- Selector de calidad integrado
- Merge automático de video + audio

### 🔍 Búsqueda Integrada
- Busca directamente en la app
- Previsualización con thumbnail
- Descarga con un click

### 🎨 Interfaz Premium
- Diseño glassmorphism moderno
- Tutorial interactivo para nuevos usuarios
- Atajos de teclado (Ctrl+V, Escape)

---

## Instalación

### Ejecutable (Recomendado)
```bash
# Ejecuta directamente desde dist/
dist/Media Converter Pro-2.0.0-x64.exe
```

### Desde Código Fuente
```bash
git clone <repo>
cd media-converter-pro
npm install
npm start
```

### Build
```bash
npm run build  # Genera ejecutable en dist/
```

---

## Uso

1. **Pega** URL de YouTube (📋 o Ctrl+V)
2. **Selecciona** formato: Audio | MP3 | Video
3. **Click** en Descargar

| Atajo | Acción |
|-------|--------|
| `Ctrl+V` | Pegar URL |
| `Escape` | Limpiar |

---

## Arquitectura

```
src/
├── config/
│   └── constants.js         # Constantes centralizadas
├── main/                     # Backend (Electron)
│   ├── index.js              # Entry point
│   ├── window.js             # Ventana principal
│   ├── ipc/
│   │   ├── youtube.js        # Descargas YouTube
│   │   ├── converter.js      # Conversión FFmpeg
│   │   └── files.js          # Sistema de archivos
│   └── utils/
│       ├── logger.js         # Logging
│       └── validators.js     # Validación URL
├── preload/
│   └── index.js              # API segura (contextBridge)
└── renderer/                 # Frontend
    ├── index.html
    ├── css/styles.css
    └── js/
        ├── app.js            # Aplicación principal
        ├── state.js          # Estado centralizado
        ├── dom.js            # Referencias DOM
        ├── components/
        │   └── toast.js      # Notificaciones
        └── utils/
            └── validators.js # Validación
```

### Principios Clean Code Aplicados
- **SRP** - Cada módulo una responsabilidad
- **DRY** - Funciones en módulos reutilizables
- **Seguridad** - Sin eval(), contextIsolation activo
- **JSDoc** - Documentación en funciones principales

---

## Tecnologías

| Tecnología | Uso |
|------------|-----|
| Electron 28 | Framework desktop |
| yt-dlp | Motor de descarga |
| FFmpeg | Conversión audio/video |
| fluent-ffmpeg | Wrapper Node.js |

---

## Licencia

MIT License - Ver [LICENSE](LICENSE)

---

<div align="center">
Hecho con ❤️ por Media Converter Team
</div>
