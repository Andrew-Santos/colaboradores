const Notificacao = {
  show(message, type = 'info') {
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();

    const icons = {
      success: 'ph ph-check-circle',
      error: 'ph ph-x-circle',
      warning: 'ph ph-warning',
      info: 'ph ph-info'
    };

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
      <i class="${icons[type] || icons.info}"></i>
      <span>${message}</span>
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'slideIn 0.4s ease reverse';
      setTimeout(() => notification.remove(), 400);
    }, 4000);
  },

  showProgress(percentage, current, total) {
    const container = document.getElementById('progress-container');
    const fill = document.getElementById('progress-bar-fill');
    const percentText = document.getElementById('progress-percentage');
    const filesText = document.getElementById('progress-files');

    if (!container || !fill || !percentText || !filesText) {
      console.warn('[Notificacao] Elementos de progresso não encontrados');
      return;
    }

    container.classList.add('show');
    
    // Garantir que a barra apareça imediatamente, mesmo com 0%
    fill.style.transition = percentage > 0 ? 'width 0.3s ease' : 'none';
    fill.style.width = `${Math.max(percentage, 1)}%`; // Mínimo 1% para mostrar algo
    
    percentText.textContent = `${Math.round(percentage)}%`;
    
    // Mostrar mensagem apropriada baseada no progresso
    if (percentage === 0 || percentage < 1) {
      filesText.textContent = 'Preparando upload...';
    } else if (percentage >= 100) {
      filesText.textContent = `✓ Concluído! ${total} arquivo(s)`;
    } else {
      filesText.textContent = `Enviando arquivo ${current} de ${total}`;
    }

    // NÃO esconder automaticamente - deixar o código principal controlar
  },

  updateProgressMessage(message) {
    const filesText = document.getElementById('progress-files');
    if (filesText) {
      filesText.textContent = message;
    }
  },

  hideProgress() {
    const container = document.getElementById('progress-container');
    if (container) {
      container.classList.remove('show');
    }
  }
};
