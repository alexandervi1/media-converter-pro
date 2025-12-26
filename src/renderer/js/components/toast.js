'use strict';

/**
 * Componente Toast para notificaciones
 * @module renderer/components/toast
 */

let toastTimeout = null;

/**
 * Muestra un toast de notificación
 * @param {string} message - Mensaje a mostrar
 * @param {string} type - Tipo: 'success' | 'error' | 'warning'
 * @param {number} duration - Duración en ms (default: 3000)
 */
function showToast(message, type = 'success', duration = 3000) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');

    if (!toast || !toastMessage) return;

    // Limpiar timeout anterior
    if (toastTimeout) {
        clearTimeout(toastTimeout);
    }

    // Actualizar contenido y estilo
    toastMessage.textContent = message;
    toast.className = `toast show ${type}`;

    // Auto-ocultar después de la duración
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

/**
 * Oculta el toast inmediatamente
 */
function hideToast() {
    const toast = document.getElementById('toast');
    if (toast) {
        toast.classList.remove('show');
    }
    if (toastTimeout) {
        clearTimeout(toastTimeout);
        toastTimeout = null;
    }
}

// Exportar
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { showToast, hideToast };
} else {
    window.showToast = showToast;
    window.hideToast = hideToast;
}
