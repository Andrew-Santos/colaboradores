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
    
    fill.style.transition = percentage > 0 ? 'width 0.3s ease' : 'none';
    fill.style.width = `${Math.max(percentage, 1)}%`;
    
    percentText.textContent = `${Math.round(percentage)}%`;
    
    if (percentage === 0 || percentage < 1) {
      filesText.innerHTML = 'Preparando upload...';
      if (statsText) statsText.textContent = '';
    } else if (percentage >= 100) {
      filesText.innerHTML = '<i class="ph ph-check-circle"></i> Concluído! ' + total + ' arquivo(s)';
      if (statsText) statsText.textContent = '';
    } else {
      filesText.textContent = `Enviando arquivo ${current} de ${total}`;
      
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

  // Nova função para progresso detalhado do Drive
  showDetailedProgress(percentage, currentFile, totalFiles, stats) {
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
    
    // Atualizar barra
    fill.style.transition = percentage > 0 ? 'width 0.3s ease' : 'none';
    fill.style.width = `${Math.min(Math.max(percentage, 0), 100)}%`;
    
    // Atualizar porcentagem
    percentText.textContent = `${Math.round(percentage)}%`;
    
    // Atualizar texto do arquivo
    if (percentage === 0 || !stats.currentFileName) {
      filesText.innerHTML = '<i class="ph ph-spinner"></i> Preparando uploads...';
    } else if (percentage >= 100) {
      filesText.innerHTML = '<i class="ph ph-check-circle"></i> Todos os arquivos enviados!';
    } else {
      const fileIcon = stats.currentFileName.includes('✓') 
        ? '<i class="ph ph-check-circle"></i>' 
        : '<i class="ph ph-upload"></i>';
      
      filesText.innerHTML = `
        ${fileIcon} 
        <span class="current-file-name">${this.truncateFileName(stats.currentFileName, 30)}</span>
        <span class="file-counter">(${currentFile}/${totalFiles})</span>
      `;
    }
    
    // Atualizar estatísticas detalhadas
    if (statsText) {
      if (percentage === 0) {
        statsText.innerHTML = 'Inicializando...';
      } else if (percentage >= 100) {
        const totalTime = Date.now() - stats.startTime;
        const avgSpeed = stats.totalBytes / (totalTime / 1000);
        statsText.innerHTML = `
          <span><i class="ph ph-check"></i> ${this.formatSize(stats.totalBytes)} enviados</span>
          <span><i class="ph ph-gauge"></i> ${this.formatSpeed(avgSpeed)}</span>
          <span><i class="ph ph-timer"></i> ${this.formatTime(totalTime)}</span>
        `;
      } else {
        const parts = [];
        
        // Tamanho enviado / total
        if (stats.uploadedSize && stats.totalSize) {
          parts.push(`<span><i class="ph ph-hard-drive"></i> ${stats.uploadedSize}/${stats.totalSize}</span>`);
        }
        
        // Velocidade atual
        if (stats.speed) {
          parts.push(`<span><i class="ph ph-gauge"></i> ${stats.speed}</span>`);
        }
        
        // Tempo decorrido
        if (stats.elapsed) {
          parts.push(`<span><i class="ph ph-timer"></i> ${stats.elapsed}</span>`);
        }
        
        // Tempo estimado restante
        if (stats.eta && stats.eta !== '—') {
          parts.push(`<span><i class="ph ph-hourglass"></i> ${stats.eta} restante</span>`);
        }
        
        statsText.innerHTML = parts.join('');
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

    this._clickListener = () => {
      this.hideProgress();
      document.removeEventListener('click', this._clickListener);
      document.removeEventListener('touchstart', this._clickListener);
      this._clickListener = null;
    };

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

  formatSpeed(bytesPerSecond) {
    const mbps = (bytesPerSecond * 8) / 1000000;
    const kbps = (bytesPerSecond * 8) / 1000;
    if (mbps >= 1) return `${mbps.toFixed(2)} Mbps`;
    return `${kbps.toFixed(0)} Kbps`;
  },

  formatTime(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(0)}s`;
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  },

  truncateFileName(fileName, maxLength) {
    if (fileName.length <= maxLength) return fileName;
    const ext = fileName.split('.').pop();
    const name = fileName.substring(0, fileName.lastIndexOf('.'));
    const truncated = name.substring(0, maxLength - ext.length - 4) + '...';
    return truncated + '.' + ext;
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