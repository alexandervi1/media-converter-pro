export class ToastComponent {
    constructor() {
        this.el = document.getElementById('toast');
        this.messageEl = document.getElementById('toast-message');

        // Exponer globalmente para convivir con codigo anterior
        window.showToast = this.show.bind(this);
    }

    show(message, type = 'success') {
        if (!this.el || !this.messageEl) {
            console.log(`[Toast ${type}] ${message}`);
            return;
        }

        this.messageEl.textContent = message;
        this.el.className = `toast ${type} show`;

        if (this.timeout) clearTimeout(this.timeout);

        this.timeout = setTimeout(() => {
            this.el.classList.remove('show');
        }, 3000);
    }
}
