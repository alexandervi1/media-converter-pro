export function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export function getStatusText(status) {
    const statusMap = {
        'pending': 'Pendiente',
        'downloading': 'Descargando...',
        'converting': 'Convirtiendo...',
        'completed': 'Completado',
        'error': 'Error'
    };
    return statusMap[status] || status;
}
