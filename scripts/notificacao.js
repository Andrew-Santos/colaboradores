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

  showProgress(percentage, current, total, stats = null) {
    const container = document.getElementById('progress-container');
    const fill = document.getElementById('progress-bar-fill');
    const percentText = document.getElementById('progress-percentage');
    const filesText = document.getElementById('progress-files');
    const statsText = document.getElementById('progress-stats');

    if (!container || !fill || !percentText || !filesText) {
      console.warn('[Notificacao] Elementos de progresso não encontrados');
      return;
    }

    container.classList.add('show');
    container.classList.remove('completed', 'error');
    
    // Garantir que a barra apareça imediatamente, mesmo com 0%
    fill.style.transition = percentage > 0 ? 'width 0.3s ease' : 'none';
    fill.style.width = `${Math.max(percentage, 1)}%`;
    
    percentText.textContent = `${Math.round(percentage)}%`;
    
    // Mostrar mensagem apropriada baseada no progresso
    if (percentage === 0 || percentage < 1) {
      filesText.innerHTML = 'Preparando upload...';
      if (statsText) statsText.textContent = '';
    } else if (percentage >= 100) {
      filesText.innerHTML = '<i class="ph ph-check-circle"></i> Concluído! ' + total + ' arquivo(s)';
      if (statsText) statsText.textContent = '';
    } else {
      filesText.textContent = `Enviando arquivo ${current} de ${total}`;
      
      // Exibir estatísticas detalhadas se fornecidas
      if (statsText && stats) {
        const parts = [];
        
        if (stats.loaded && stats.total) {
          parts.push(`${this.formatSize(stats.loaded)}/${this.formatSize(stats.total)}`);
        }
        
        if (stats.speed) {
          parts.push(`<i class="ph ph-gauge"></i> ${stats.speed}`);
        }
        
        if (stats.elapsed) {
          parts.push(`<i class="ph ph-timer"></i> ${stats.elapsed}`);
        }
        
        if (stats.eta) {
          parts.push(`<i class="ph ph-hourglass"></i> ${stats.eta}`);
        }
        
        statsText.innerHTML = parts.join(' • ');
      }
    }
  },

  showCompletionAlert(success, message, details = null) {
    const container = document.getElementById('progress-container');
    const fill = document.getElementById('progress-bar-fill');
    const percentText = document.getElementById('progress-percentage');
    const filesText = document.getElementById('progress-files');
    const statsText = document.getElementById('progress-stats');

    if (!container) return;

    // Remover listener anterior se existir
    if (this._clickListener) {
      document.removeEventListener('click', this._clickListener);
      document.removeEventListener('touchstart', this._clickListener);
    }

    container.classList.add('show');
    container.classList.remove('completed', 'error');
    
    if (success) {
      container.classList.add('completed');
      fill.style.width = '100%';
      percentText.innerHTML = '<i class="ph-fill ph-check-circle"></i>';
      filesText.innerHTML = '<i class="ph ph-check-circle"></i> ' + message;
      if (statsText) statsText.innerHTML = details || 'Toque na tela para continuar';
    } else {
      container.classList.add('error');
      fill.style.width = '0%';
      percentText.innerHTML = '<i class="ph-fill ph-x-circle"></i>';
      filesText.innerHTML = '<i class="ph ph-x-circle"></i> ' + message;
      if (statsText) statsText.innerHTML = details || 'Toque na tela para continuar';
    }

    // Listener para fechar ao clicar/tocar em qualquer lugar
    this._clickListener = () => {
      this.hideProgress();
      document.removeEventListener('click', this._clickListener);
      document.removeEventListener('touchstart', this._clickListener);
      this._clickListener = null;
    };

    // Pequeno delay para evitar fechar imediatamente
    setTimeout(() => {
      document.addEventListener('click', this._clickListener);
      document.addEventListener('touchstart', this._clickListener);
    }, 300);
  },

  formatSize(bytes) {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
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
