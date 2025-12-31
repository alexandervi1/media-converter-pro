import { store } from '../store/store.js';
import { escapeHtml, getStatusText } from '../utils/formatters.js';

export class DownloadList {
    constructor(containerId, electronAPI) {
        this.container = document.getElementById(containerId);
        this.electronAPI = electronAPI;

        // Render inicial
        this.render(store.getState());

        // Suscribirse a cambios
        store.subscribe((state, prevState) => {
            if (state.downloads !== prevState.downloads) {
                this.render(state);
            }
        });

        // Event delegation para botones de eliminar
        this.container.addEventListener('click', (e) => {
            const deleteBtn = e.target.closest('.item-delete');
            if (deleteBtn) {
                const id = parseInt(deleteBtn.dataset.id);
                this.handleRemove(id);
            }

            const folderBtn = e.target.closest('.item-folder');
            if (folderBtn) {
                const filePath = folderBtn.dataset.filepath;
                if (filePath) this.electronAPI.openFolder(filePath);
            }
        });
    }

    async handleRemove(id) {
        try {
            await this.electronAPI.removeFromQueue(id);
        } catch (err) {
            console.error(err);
        }
    }

    render(state) {
        const list = this.container;
        const downloads = state.downloads;
        const emptyState = document.getElementById('empty-state');
        const countBadge = document.getElementById('download-count');
        const tabBadge = document.getElementById('tab-downloads-badge');

        // Update counts
        if (countBadge) countBadge.textContent = downloads.length > 0 ? downloads.length : '';
        if (tabBadge) {
            const activeCount = downloads.filter(d => d.status === 'downloading' || d.status === 'converting').length;
            tabBadge.textContent = activeCount > 0 ? activeCount : '';
            tabBadge.style.display = activeCount > 0 ? 'flex' : 'none';
        }

        // Show/hide empty state
        if (downloads.length === 0) {
            if (emptyState) emptyState.style.display = 'flex';
            list.innerHTML = '';
            if (emptyState) list.appendChild(emptyState); // Keep empty state inside
            return;
        }

        if (emptyState) emptyState.style.display = 'none';

        // Reconciliation simple (Actualizar existente o crear nuevo)
        // Por simplicidad en este paso, usaremos la lógica original de "upsert"

        // 1. Marcar todos como no visitados
        const currentIds = new Set(downloads.map(d => d.id));

        // 2. Eliminar los que ya no existen
        Array.from(list.children).forEach(el => {
            if (el.id === 'empty-state') return;
            if (!el.dataset.id || !currentIds.has(parseInt(el.dataset.id))) {
                el.remove();
            }
        });

        // 3. Actualizar o crear
        downloads.forEach(item => {
            let el = list.querySelector(`.download-item[data-id="${item.id}"]`);
            if (!el) {
                el = this.createItem(item);
                list.appendChild(el);
            } else {
                this.updateItem(el, item);
            }
        });
    }

    createItem(item) {
        const el = document.createElement('div');
        el.className = 'download-item';
        el.dataset.id = item.id;
        el.innerHTML = this.getItemHtml(item);
        return el;
    }

    updateItem(el, item) {
        // Solo actualizamos si cambiaron cosas relevantes
        // Una optimización real compararía campos, aquí re-generamos partes interiores
        const newHtml = this.getItemHtml(item);
        if (el.innerHTML !== newHtml) {
            // Optimización fina: update solo barra de progreso si es lo único que cambia
            // Pero por "Hardest to Easiest", vamos a ser robustos primero.
            // Para evitar parpadeo de imágenes, podríamos ser más selectivos, 
            // pero el browser es rápido.

            // Mejor: Reusar la lógica selectiva del app.js original para suavidad
            const icon = el.querySelector('.item-icon');
            const statusDiv = el.querySelector('.item-status');
            const titleEl = el.querySelector('.item-title');

            if (titleEl && titleEl.textContent !== item.title) {
                titleEl.textContent = item.title;
            }

            // Update status content (progress bar)
            const statusHtml = this.getStatusHtml(item);
            if (statusDiv && statusDiv.innerHTML !== statusHtml) {
                statusDiv.innerHTML = statusHtml;
            }

            // Update icon class/content
            this.updateIcon(icon, item);
        }
    }

    getItemHtml(item) {
        const canDelete = item.status !== 'downloading' && item.status !== 'converting';
        return `
            <div class="item-icon ${this.getIconClass(item.status)}">
                ${this.getIconSvg(item.status)}
            </div>
            <div class="item-info">
                <p class="item-title">${escapeHtml(item.title)}</p>
                <div class="item-status">
                    ${this.getStatusHtml(item)}
                </div>
            </div>
            ${item.status === 'completed' && item.filePath ? `
            <button class="item-folder" data-filepath="${escapeHtml(item.filePath)}" title="Abrir carpeta">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
            </button>
            ` : ''}
            <button class="item-delete" data-id="${item.id}" title="${(item.status === 'downloading' || item.status === 'converting') ? 'Cancelar' : 'Eliminar'}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        `;
    }

    getStatusHtml(item) {
        if (item.status === 'downloading' || item.status === 'converting') {
            return `
                <div class="progress-bar ${item.status}">
                    <div class="progress-fill" style="width: ${item.progress}%"></div>
                </div>
                <span class="progress-text">${item.progress}%</span>
            `;
        }
        return `<span class="status-text status-${item.status}">${getStatusText(item.status)}</span>`;
    }

    getIconClass(status) {
        if (status === 'completed') return 'completed';
        if (status === 'error') return 'error';
        if (status === 'downloading' || status === 'converting') return 'downloading';
        return '';
    }

    getIconSvg(status) {
        if (status === 'completed') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
        if (status === 'error') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
    }

    updateIcon(icon, item) {
        if (!icon) return;
        const newClass = `item-icon ${this.getIconClass(item.status)}`;
        if (icon.className !== newClass) icon.className = newClass;

        const newSvg = this.getIconSvg(item.status);
        if (icon.innerHTML !== newSvg) icon.innerHTML = newSvg;
    }
}
