# Guía de desarrollo - Media Converter Pro

## 1. Estado actual del proyecto

Media Converter Pro sigue siendo una aplicación de escritorio basada en Electron para:
- descargar audio y video desde YouTube,
- descargar contenido desde Spotify,
- convertir archivos locales entre formatos de forma simple.

En la sesión reciente se consolidó el flujo principal con una interfaz más clara y con el comportamiento de salida corregido para las descargas.

### Cambios recientes importantes
- Se migró el flujo de desarrollo y ejecución a Bun.
- La UI quedó simplificada a dos opciones visibles: MP3 y MP4.
- Se eliminó la lógica de selección por flechas o menús adicionales.
- Se corrigió el destino final de las descargas MP4 para que entren en la carpeta correcta dentro de la ruta elegida por el usuario.
- El bundle del renderer se valida correctamente con Bun.

---

## 2. Tecnologías principales

- Node.js 18+
- Bun 1.x
- Electron 28
- FFmpeg + fluent-ffmpeg
- yt-dlp para descarga de media
- esbuild para generar el bundle del renderer
- electron-builder para empaquetar la app

---

## 3. Estructura del proyecto

```text
src/
  config/             # constantes y configuración compartida
  main/               # proceso principal de Electron
    index.js          # entrada de la app y registro de IPC
    window.js         # creación/gestión de la ventana principal
    ipc/              # controladores IPC
    services/         # lógica de negocio y operaciones externas
    utils/            # helpers de configuración, logging y validación
  preload/            # bridge seguro entre main y renderer
  renderer/           # interfaz de usuario
    index.html
    css/styles.css
    js/
      app.js          # lógica principal de la UI
      components/     # componentes visuales
      store/          # almacenamiento local del estado
      utils/          # utilidades de UI
```

---

## 4. Flujo de ejecución actual

### Inicio de la app
1. El proceso principal inicia en [src/main/index.js](src/main/index.js).
2. Registra los handlers IPC para YouTube, Spotify, archivos y conversión.
3. Crea la ventana principal con [src/main/window.js](src/main/window.js).
4. El renderer carga la interfaz desde [src/renderer/index.html](src/renderer/index.html).

### Comunicación entre capas
- El renderer accede a la API expuesta por [src/preload/index.js](src/preload/index.js).
- Los handlers IPC se registran en [src/main/ipc](src/main/ipc).
- Los servicios reutilizables viven en [src/main/services](src/main/services).

---

## 5. Módulos clave

### Proceso principal
- [src/main/index.js](src/main/index.js)
  - punto de entrada de Electron
  - configura FFmpeg globalmente
  - inicializa los handlers IPC

- [src/main/window.js](src/main/window.js)
  - configura la ventana principal y su comportamiento

### IPC y controladores
- [src/main/ipc/youtube.js](src/main/ipc/youtube.js)
  - maneja cola de descargas, metadata, búsqueda y configuración
  - orquesta el procesamiento de items en cola
  - define la carpeta final de salida según el formato

- [src/main/ipc/spotify.js](src/main/ipc/spotify.js)
  - parsea playlists de Spotify y las añade a la cola global

- [src/main/ipc/converter.js](src/main/ipc/converter.js)
  - convierte archivos locales usando FFmpeg

- [src/main/ipc/files.js](src/main/ipc/files.js)
  - selección de archivos y apertura de carpetas

### Servicios
- [src/main/services/DownloadService.js](src/main/services/DownloadService.js)
  - encapsula yt-dlp y FFmpeg
  - descarga audio/video y prepara salidas temporales

- [src/main/services/QueueService.js](src/main/services/QueueService.js)
  - gestiona el estado de los items en la cola

- [src/main/services/SpotifyService.js](src/main/services/SpotifyService.js)
  - obtiene metadata y canciones desde URLs de Spotify

### Renderer
- [src/renderer/js/app.js](src/renderer/js/app.js)
  - lógica principal de la UI
  - selección de formato, descarga, búsqueda y Spotify

- [src/renderer/index.html](src/renderer/index.html)
  - estructura de la interfaz principal
  - contiene los botones actuales para MP3 y MP4

---

## 6. Flujo de descarga actual

El recorrido típico para una descarga es:

1. El renderer llama a la API de Electron para añadir un item a la cola.
2. El handler IPC en [src/main/ipc/youtube.js](src/main/ipc/youtube.js) prepara el item y lo procesa.
3. Si aplica, se usa [src/main/services/DownloadService.js](src/main/services/DownloadService.js) para descargar o convertir.
4. El archivo final se mueve a la carpeta de destino según el formato seleccionado.
5. El estado se refleja en la UI a través de eventos IPC.

### Comportamiento esperado hoy
- Si el usuario elige MP3, el archivo debe terminar en la subcarpeta mp3.
- Si el usuario elige MP4, el archivo debe terminar en la subcarpeta mp4.

---

## 7. Comandos de desarrollo

### Instalar dependencias
```bash
bun install
```

### Ejecutar en desarrollo
```bash
bun run start
```

### Ejecutar en modo desarrollo con entorno explícito
```bash
bun run dev
```

### Construir el bundle del renderer
```bash
bun run bundle:renderer
```

### Construir la app
```bash
bun run build
```

### Build específico para Windows
```bash
bun run build:win
```

### Lint
```bash
bun run lint
```

### Formatear código
```bash
bun run format
```

---

## 8. Estado de validación reciente

### Verificado
- El build del renderer funciona correctamente con Bun.
- No hay errores de sintaxis reportados en [src/renderer/js/app.js](src/renderer/js/app.js).
- La app compila correctamente para el bundle del renderer.

### Pendiente de validar en la siguiente sesión
- Probar una descarga real completa desde la app.
- Confirmar que un MP3 termine en la carpeta mp3 y un MP4 en la carpeta mp4.
- Revisar el aviso de accesibilidad en [src/renderer/index.html](src/renderer/index.html).

---

## 9. Puntos de entrada recomendados para trabajar

Si vas a seguir desarrollando la app, estos archivos son los mejores puntos de entrada:

1. [src/renderer/js/app.js](src/renderer/js/app.js)
   - lógica de UI y selección de formato

2. [src/main/ipc/youtube.js](src/main/ipc/youtube.js)
   - flujo central de descargas y destino final de archivos

3. [src/main/services/DownloadService.js](src/main/services/DownloadService.js)
   - descarga, conversión y manejo de archivos temporales

4. [src/main/services/SpotifyService.js](src/main/services/SpotifyService.js)
   - integración con Spotify

5. [src/main/ipc/converter.js](src/main/ipc/converter.js)
   - conversión local de archivos

---

## 10. Próximo plan para la siguiente sesión

- probar una descarga real end-to-end,
- confirmar la ruta final de salida para MP3 y MP4,
- revisar si la UI necesita más pulido visual o accesibilidad,
- considerar si se quiere agregar más opciones o refactorizar la cola.

## 11. Nota rápida para quien continúe

Si algo falla en la descarga, revisar primero:
- [src/main/ipc/youtube.js](src/main/ipc/youtube.js) para la ruta final del archivo,
- [src/main/services/DownloadService.js](src/main/services/DownloadService.js) para los pasos de descarga y conversión,
- y [src/renderer/js/app.js](src/renderer/js/app.js) para el formato seleccionado por la UI.
