const Notificacao = {
  // Notificações simples (mantidas)
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

  // Sistema de progresso multi-arquivo
  multiProgress: {
    container: null,
    files: [],
    totalSize: 0,
    uploadedSize: 0,
    startTime: 0,
    activeUploads: 0,
    completedFiles: 0,
    updateInterval: null,

    init() {
      if (this.container) return;
      
      this.container = document.createElement('div');
      this.container.className = 'multi-progress-container';
      this.container.id = 'multiProgress';
      this.container.innerHTML = `
        <div class="multi-progress-header">
          <div class="multi-progress-title">
            <h4>
              <i class="ph ph-cloud-arrow-up"></i>
              Enviando Arquivos
            </h4>
            <span class="subtitle">Uploads simultâneos</span>
          </div>
          <div class="multi-progress-stats">
            <div class="multi-progress-percentage" id="globalPercentage">0%</div>
            <div class="multi-progress-speed" id="globalSpeed">
              <i class="ph ph-gauge"></i> 0 Mbps
            </div>
          </div>
        </div>

        <div class="multi-progress-global">
          <div class="global-bar-container">
            <div class="global-bar-fill" id="globalBar" style="width: 0%"></div>
          </div>
          <div class="global-info">
            <span><i class="ph ph-files"></i> <span id="fileCount">0/0</span></span>
            <span><i class="ph ph-hard-drive"></i> <span id="sizeInfo">0MB/0MB</span></span>
            <span><i class="ph ph-timer"></i> <span id="timeInfo">0:00</span></span>
          </div>
        </div>

        <div class="multi-progress-files" id="filesList"></div>

        <div class="multi-progress-footer">
          <div class="footer-info">
            <i class="ph ph-info"></i>
            <span id="footerText">Preparando uploads...</span>
          </div>
          <div class="footer-actions">
            <button class="footer-btn close" onclick="Notificacao.multiProgress.hide()">
              <i class="ph ph-x"></i> Fechar
            </button>
          </div>
        </div>
      `;
      
      document.body.appendChild(this.container);
    },

    show(files) {
      this.init();
      
      // Reset
      this.files = files;
      this.totalSize = files.reduce((sum, f) => sum + (f.file?.size || f.size || 0), 0);
      this.uploadedSize = 0;
      this.startTime = Date.now();
      this.activeUploads = 0;
      this.completedFiles = 0;
      
      // Criar cards
      const filesList = document.getElementById('filesList');
      filesList.innerHTML = files.map((file, index) => this.createFileCard(file, index)).join('');
      
      // Mostrar
      this.container.classList.add('show');
      
      // Atualizar periodicamente
      if (this.updateInterval) clearInterval(this.updateInterval);
      this.updateInterval = setInterval(() => this.updateGlobal(), 200);
    },

    hide() {
      if (this.container) {
        this.container.classList.remove('show');
      }
      if (this.updateInterval) {
        clearInterval(this.updateInterval);
        this.updateInterval = null;
      }
    },

    createFileCard(file, index) {
      const fileName = file.file?.name || file.name || `Arquivo ${index + 1}`;
      const fileSize = file.file?.size || file.size || 0;
      const type = file.file?.type || file.type || '';
      
      let icon = 'ph-file';
      if (type.startsWith('image/')) icon = 'ph-image';
      else if (type.startsWith('video/')) icon = 'ph-video-camera';
      
      return `
        <div class="file-progress-card pending" id="file-${index}" data-index="${index}">
          <div class="file-card-header">
            <div class="file-icon">
              <i class="ph ${icon}"></i>
            </div>
            <div class="file-card-info">
              <div class="file-card-name" title="${fileName}">${this.truncateFileName(fileName)}</div>
              <div class="file-card-meta">
                <span>${this.formatSize(fileSize)}</span>
              </div>
            </div>
            <div class="file-card-status pending">
              <i class="ph ph-clock"></i> Aguardando
            </div>
          </div>
          <div class="file-card-progress">
            <div class="file-progress-bar">
              <div class="file-progress-fill" style="width: 0%"></div>
            </div>
            <div class="file-progress-details">
              <span>0%</span>
              <span>—</span>
            </div>
          </div>
        </div>
      `;
    },

    updateFileCard(index, progress, speed, status, message = null) {
      const card = document.getElementById(`file-${index}`);
      if (!card) return;

      card.className = `file-progress-card ${status}`;
      
      const statusBadge = card.querySelector('.file-card-status');
      const progressFill = card.querySelector('.file-progress-fill');
      const progressDetails = card.querySelector('.file-progress-details');
      
      progressFill.style.width = `${Math.min(progress, 100)}%`;
      
      if (status === 'uploading') {
        statusBadge.innerHTML = '<i class="ph ph-upload"></i> Enviando';
        statusBadge.className = 'file-card-status uploading';
        progressDetails.innerHTML = `
          <span>${Math.round(progress)}%</span>
          <span>${this.formatSpeed(speed)}</span>
        `;
      } else if (status === 'processing') {
        statusBadge.innerHTML = '<i class="ph ph-spinner"></i> Processando';
        statusBadge.className = 'file-card-status uploading';
        progressDetails.innerHTML = `
          <span>${message || 'Gerando thumbnail...'}</span>
          <span></span>
        `;
      } else if (status === 'completed') {
        statusBadge.innerHTML = '<i class="ph ph-check"></i> Concluído';
        statusBadge.className = 'file-card-status completed';
        progressDetails.innerHTML = `
          <span>100%</span>
          <span><i class="ph ph-check-circle"></i></span>
        `;
      } else if (status === 'error') {
        statusBadge.innerHTML = '<i class="ph ph-x"></i> Erro';
        statusBadge.className = 'file-card-status error';
        progressDetails.innerHTML = `
          <span>${message || 'Falha no upload'}</span>
          <span></span>
        `;
      }
    },

    updateGlobal() {
      if (!this.container || !this.container.classList.contains('show')) return;
      
      const percentage = this.totalSize > 0 
        ? (this.uploadedSize / this.totalSize) * 100 
        : 0;
      
      const elapsed = Date.now() - this.startTime;
      const avgSpeed = elapsed > 0 ? (this.uploadedSize / (elapsed / 1000)) : 0;
      
      document.getElementById('globalPercentage').textContent = `${Math.round(percentage)}%`;
      document.getElementById('globalSpeed').innerHTML = `
        <i class="ph ph-gauge"></i> ${this.formatSpeed(avgSpeed)}
      `;
      document.getElementById('globalBar').style.width = `${Math.min(percentage, 100)}%`;
      document.getElementById('fileCount').textContent = 
        `${this.completedFiles}/${this.files.length}`;
      document.getElementById('sizeInfo').textContent = 
        `${this.formatSize(this.uploadedSize)}/${this.formatSize(this.totalSize)}`;
      document.getElementById('timeInfo').textContent = this.formatTime(elapsed);
      
      const footerText = document.getElementById('footerText');
      if (this.completedFiles === this.files.length && this.files.length > 0) {
        footerText.innerHTML = '<i class="ph ph-check-circle"></i> Todos os arquivos foram enviados!';
        this.container.classList.add('completed');
      } else if (this.activeUploads > 0) {
        footerText.textContent = `${this.activeUploads} ${this.activeUploads === 1 ? 'arquivo sendo enviado' : 'arquivos sendo enviados'}`;
      } else {
        footerText.textContent = 'Processando próximos arquivos...';
      }
    },

    setFileUploading(index) {
      this.activeUploads++;
      this.updateFileCard(index, 0, 0, 'uploading');
    },

    updateFileProgress(index, loaded, total, speed) {
      const progress = total > 0 ? (loaded / total) * 100 : 0;
      this.updateFileCard(index, progress, speed, 'uploading');
      
      // Atualizar progresso global
      this.uploadedSize = this.files
        .slice(0, index)
        .reduce((sum, f) => sum + (f.file?.size || f.size || 0), 0) + loaded;
      
      this.updateGlobal();
    },

    setFileProcessing(index, message) {
      this.updateFileCard(index, 100, 0, 'processing', message);
    },

    setFileCompleted(index) {
      this.updateFileCard(index, 100, 0, 'completed');
      this.completedFiles++;
      this.activeUploads--;
      
      this.uploadedSize = this.files
        .slice(0, index + 1)
        .reduce((sum, f) => sum + (f.file?.size || f.size || 0), 0);
      
      this.updateGlobal();
    },

    setFileError(index, errorMessage) {
      this.updateFileCard(index, 0, 0, 'error', errorMessage);
      this.activeUploads--;
      this.updateGlobal();
    },

    formatSize(bytes) {
      if (!bytes) return '0 B';
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    },

    formatSpeed(bytesPerSecond) {
      const mbps = (bytesPerSecond * 8) / 1000000;
      const kbps = (bytesPerSecond * 8) / 1000;
      if (mbps >= 1) return `${mbps.toFixed(2)} Mbps`;
      if (kbps >= 1) return `${kbps.toFixed(0)} Kbps`;
      return `${(bytesPerSecond * 8).toFixed(0)} bps`;
    },

    formatTime(ms) {
      if (ms < 1000) return `${ms}ms`;
      const secs = Math.floor(ms / 1000);
      const mins = Math.floor(secs / 60);
      const remainingSecs = secs % 60;
      return `${mins}:${remainingSecs.toString().padStart(2, '0')}`;
    },

    truncateFileName(fileName, maxLength = 35) {
      if (fileName.length <= maxLength) return fileName;
      const ext = fileName.split('.').pop();
      const name = fileName.substring(0, fileName.lastIndexOf('.'));
      const truncated = name.substring(0, maxLength - ext.length - 4) + '...';
      return truncated + '.' + ext;
    }
  },

  // Manter compatibilidade com código antigo
  showProgress(percentage, current, total, stats = null) {
    console.warn('[Notificacao] showProgress: Use multiProgress para melhor experiência');
  },

  showDetailedProgress(percentage, currentFile, totalFiles, stats) {
    console.warn('[Notificacao] showDetailedProgress: Use multiProgress para melhor experiência');
  },

  hideProgress() {
    this.multiProgress.hide();
  },

  formatSize(bytes) {
    return this.multiProgress.formatSize(bytes);
  },

  formatSpeed(bytesPerSecond) {
    return this.multiProgress.formatSpeed(bytesPerSecond);
  },

  formatTime(ms) {
    return this.multiProgress.formatTime(ms);
  }
};