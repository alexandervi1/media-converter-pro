import { store } from '../store/store.js';
import { escapeHtml } from '../utils/formatters.js';

export class SearchComponent {
    constructor(electronAPI) {
        this.electronAPI = electronAPI;

        // Elements
        this.input = document.getElementById('search-input');
        this.btnSearch = document.getElementById('btn-search');
        this.resultsList = document.getElementById('results-list');
        this.emptyState = document.getElementById('search-empty');
        this.resultsContainer = document.getElementById('search-results');

        // Bindings
        this.initListeners();

        // Subscribe to store
        store.subscribe((state, prevState) => {
            if (state.searchResults !== prevState.searchResults) {
                this.render(state.searchResults);
            }
        });
    }

    initListeners() {
        this.btnSearch?.addEventListener('click', () => this.handleSearch());
        this.input?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSearch();
        });

        // Delegation for results
        this.resultsList?.addEventListener('click', (e) => {
            const playBtn = e.target.closest('.result-btn.play');
            const downloadBtn = e.target.closest('.result-btn.download');
            const item = e.target.closest('.result-item');

            if (!item) return;

            const url = item.dataset.url;
            const title = item.dataset.title;

            if (playBtn && url) {
                this.electronAPI.openExternal?.(url) || window.open(url, '_blank');
            } else if (downloadBtn && url) {
                this.triggerDownload(url, title);
            }
        });

        // Toolbar buttons (Format)
        document
            .getElementById('search-btn-mp3')
            ?.addEventListener('click', () => this.setFormat('mp3'));
        document
            .getElementById('search-btn-m4a')
            ?.addEventListener('click', () => this.setFormat('m4a'));
        document
            .getElementById('search-btn-video')
            ?.addEventListener('click', () => this.setFormat('mp4'));
    }

    async handleSearch() {
        const query = this.input?.value.trim();
        if (!query || query.length < 2) {
            this.showToast('Escribe al menos 2 caracteres', 'error');
            return;
        }

        // Loading state
        if (this.emptyState) {
            this.emptyState.innerHTML = '<p>Buscando...</p>';
            this.emptyState.classList.remove('hidden');
        }
        if (this.resultsList) this.resultsList.innerHTML = '';

        try {
            const result = await this.electronAPI.searchYouTube(query, 10);

            if (result.success) {
                store.setState({ searchResults: result.results || [] });
                this.showToast(`${result.results.length} resultados`, 'success');
            } else {
                store.setState({ searchResults: [] });
                this.showEmpty();
            }
        } catch (err) {
            console.error(err);
            this.showToast('Error al buscar', 'error');
            this.showEmpty();
        }
    }

    render(results) {
        if (!this.resultsList) return;

        if (!results || results.length === 0) {
            this.showEmpty();
            return;
        }

        this.emptyState?.classList.add('hidden');

        this.resultsList.innerHTML = results
            .map(
                (item) => `
            <div class="result-item" data-url="${escapeHtml(item.url)}" data-title="${escapeHtml(item.title)}">
                <img class="result-thumb" src="${item.thumbnail}" alt="">
                <div class="result-info">
                    <div class="result-title">${escapeHtml(item.title)}</div>
                    <div class="result-meta">
                        <span>${item.channel || ''}</span>
                        <span>•</span>
                        <span>${item.durationStr || item.duration || ''}</span>
                    </div>
                </div>
                <div class="result-actions">
                    <button class="result-btn play" title="Reproducir en YouTube">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polygon points="5 3 19 12 5 21 5 3"/>
                        </svg>
                    </button>
                    <button class="result-btn download" title="Descargar">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                    </button>
                </div>
            </div>
        `
            )
            .join('');
    }

    showEmpty() {
        if (this.emptyState) {
            this.emptyState.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="15" y1="9" x2="9" y2="15"/>
                    <line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
                <p>No se encontraron resultados</p>
            `;
            this.emptyState.classList.remove('hidden');
        }
    }

    triggerDownload(url, title) {
        // Switch tab to URL logic is handled by app navigation mostly, but we can trigger state change
        // For now, let's keep it simple: Just trigger the download logic via Store or Event.
        // We'll dispatch a custom event that app.js listens to, OR manipulate store.

        // Let's use a global custom event for "request-download" to decouple
        const event = new CustomEvent('request-download', {
            detail: { url, title }
        });
        document.dispatchEvent(event);
    }

    setFormat(format) {
        store.setState({ selectedFormat: format });

        // Update local buttons visual state
        document.getElementById('search-btn-mp3')?.classList.toggle('active', format === 'mp3');
        document.getElementById('search-btn-m4a')?.classList.toggle('active', format === 'm4a');
        document.getElementById('search-btn-video')?.classList.toggle('active', format === 'mp4');

        // Also save settings
        this.electronAPI.saveSettings({ format });
    }

    // Helper for toast (should be a separate service later)
    showToast(msg, type) {
        // Fallback to global if exists, or dispatch event
        if (window.showToast) window.showToast(msg, type);
    }
}
