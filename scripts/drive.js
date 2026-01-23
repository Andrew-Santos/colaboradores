const Drive = {
  clients: [],
  clientsStorage: {},
  selectedClient: null,
  files: [],
  selectedItems: new Set(),
  viewMode: 'compact',
  sortBy: 'name',
  sortOrder: 'asc',
  lastSelectedItem: null,
  lastTapTime: 0,
  lastTapItem: null,
  
  MAX_CONCURRENT_UPLOADS: 10,
  THUMBNAIL_SIZE: 150,
  CHUNK_SIZE: 50 * 1024 * 1024,
  MAX_RETRIES: 3,
  RETRY_DELAY: 2000,
  
  uploadQueue: [],
  activeUploads: 0,
  uploadStats: {
    totalFiles: 0,
    completedFiles: 0,
    totalBytes: 0,
    uploadedBytes: 0,
    startTime: 0,
    speeds: []
  },

  async init() {
    VANTA.WAVES({
      el: "#bg", 
      mouseControls: true, 
      touchControls: true, 
      gyroControls: false,
      minHeight: 200, 
      minWidth: 200, 
      scale: 1, 
      scaleMobile: 1, 
      color: 0x000000,
      shininess: 25, 
      waveHeight: 25, 
      waveSpeed: 1.05, 
      zoom: 1.20
    });

    const autoLoginResult = await Auth.autoLogin();
    if (autoLoginResult.success) {
      Auth.showCorrectScreen();
      await this.loadClients();
      Notificacao.show('Bem-vindo ao Drive Criativa!', 'success');
    } else {
      Auth.showCorrectScreen();
    }

    this.setupEventListeners();
  },

  setupEventListeners() {
    // Login
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;
      Notificacao.show('Fazendo login...', 'info');
      const result = await Auth.login(email, password);
      if (result.success) {
        Auth.showCorrectScreen();
        await this.loadClients();
        Notificacao.show('Login realizado!', 'success');
      } else {
        Notificacao.show(result.error || 'Login falhou', 'error');
      }
    });

    // Logout
    document.getElementById('btn-logout').addEventListener('click', async () => {
      await Auth.logout();
      Auth.showCorrectScreen();
      Notificacao.show('Logout realizado', 'info');
    });

    // Upload
    document.getElementById('btn-upload').addEventListener('click', () => {
      document.getElementById('file-input').click();
    });

    document.getElementById('file-input').addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.uploadFiles(Array.from(e.target.files));
        e.target.value = '';
      }
    });

    // View Controls
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const mode = e.currentTarget.dataset.view;
        this.changeViewMode(mode);
      });
    });

    // Selection Actions
    const deselectBtn = document.getElementById('btn-deselect');
    if (deselectBtn) deselectBtn.addEventListener('click', () => this.clearSelection());
    
    const deleteBtn = document.getElementById('btn-delete-selected');
    if (deleteBtn) deleteBtn.addEventListener('click', () => this.deleteSelected());
    
    const downloadBtn = document.getElementById('btn-download-selected');
    if (downloadBtn) downloadBtn.addEventListener('click', () => this.downloadSelected());

    // Preview Modal
    document.getElementById('modal-close-preview').addEventListener('click', () => {
      document.getElementById('modal-preview').classList.remove('show');
      const container = document.getElementById('preview-container');
      const video = container.querySelector('video');
      if (video) video.pause();
      container.innerHTML = '';
    });

    // Keyboard Events
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const previewModal = document.getElementById('modal-preview');
        if (previewModal.classList.contains('show')) {
          const video = document.getElementById('preview-container').querySelector('video');
          if (video) video.pause();
        }
        previewModal.classList.remove('show');
        document.getElementById('preview-container').innerHTML = '';
        this.clearSelection();
      }
    });

    // Drag & Drop
    const driveContent = document.getElementById('drive-content');
    driveContent.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (this.selectedClient && e.dataTransfer.types.includes('Files')) {
        driveContent.classList.add('dragover');
      }
    });
    driveContent.addEventListener('dragleave', () => driveContent.classList.remove('dragover'));
    driveContent.addEventListener('drop', (e) => {
      e.preventDefault();
      driveContent.classList.remove('dragover');
      if (this.selectedClient && e.dataTransfer.files.length > 0) {
        this.uploadFiles(Array.from(e.dataTransfer.files));
      }
    });

    // Item interactions
    document.addEventListener('click', (e) => this.handleItemClick(e));
    document.addEventListener('dblclick', (e) => this.handleItemDoubleClick(e));
    document.addEventListener('touchend', (e) => this.handleTouchEnd(e));
    this.setupLongPress();
  },

  setupLongPress() {
    let longPressTimer = null;
    document.addEventListener('touchstart', (e) => {
      const item = e.target.closest('.file-item, .file-list-item');
      if (item) {
        longPressTimer = setTimeout(() => {
          this.handleLongPress(item);
        }, 500);
      }
    }, { passive: true });
    document.addEventListener('touchend', () => clearTimeout(longPressTimer));
    document.addEventListener('touchmove', () => clearTimeout(longPressTimer), { passive: true });
  },

  handleLongPress(item) {
    const id = item.dataset.id;
    const key = `file-${id}`;
    if (navigator.vibrate) navigator.vibrate(50);
    if (!this.selectedItems.has(key)) {
      this.selectedItems.add(key);
      this.lastSelectedItem = key;
      this.updateSelectionUI();
    }
    this.showActionsModal(id);
  },

  showActionsModal(id) {
    const existingModal = document.getElementById('actions-modal');
    if (existingModal) existingModal.remove();

    const item = this.files.find(f => String(f.id) === String(id));
    if (!item) return;

    const modal = document.createElement('div');
    modal.id = 'actions-modal';
    modal.className = 'actions-modal-overlay';
    modal.innerHTML = `
      <div class="actions-modal">
        <div class="actions-modal-header">
          <span class="actions-modal-title">${item.name}</span>
          <button class="actions-modal-close"><i class="ph ph-x"></i></button>
        </div>
        <div class="actions-modal-body">
          <button class="actions-modal-btn" data-action="open">
            <i class="ph ph-eye"></i> Abrir
          </button>
          <button class="actions-modal-btn" data-action="download">
            <i class="ph ph-download-simple"></i> Baixar
          </button>
          <button class="actions-modal-btn danger" data-action="delete">
            <i class="ph ph-trash"></i> Excluir
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('show'), 10);

    const closeModal = () => {
      modal.classList.remove('show');
      setTimeout(() => modal.remove(), 200);
    };

    modal.querySelector('.actions-modal-close').addEventListener('click', closeModal);
    modal.querySelectorAll('.actions-modal-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        closeModal();
        setTimeout(() => {
          if (action === 'open') this.previewFile(id);
          else if (action === 'download') this.downloadFile(id);
          else if (action === 'delete') this.confirmDelete(id);
        }, 200);
      });
    });
  },

  handleTouchEnd(e) {
    const item = e.target.closest('.file-item, .file-list-item');
    if (!item) return;
    const now = Date.now();
    const id = item.dataset.id;
    if (this.lastTapItem === id && (now - this.lastTapTime) < 300) {
      e.preventDefault();
      this.previewFile(id);
      this.lastTapTime = 0;
      this.lastTapItem = null;
    } else {
      this.lastTapTime = now;
      this.lastTapItem = id;
    }
  },

  handleItemClick(e) {
    const item = e.target.closest('.file-item, .file-list-item');
    if (!item) {
        if (e.target.id === 'drive-content') this.clearSelection();
        return;
    }

    const id = item.dataset.id;
    const key = `file-${id}`;

    if (e.ctrlKey || e.metaKey) {
      this.selectedItems.has(key) ? this.selectedItems.delete(key) : this.selectedItems.add(key);
    } else {
      this.selectedItems.clear();
      this.selectedItems.add(key);
    }
    this.lastSelectedItem = key;
    this.updateSelectionUI();
  },

  handleItemDoubleClick(e) {
    const item = e.target.closest('.file-item, .file-list-item');
    if (item) this.previewFile(item.dataset.id);
  },

  async loadClients() {
    try {
      const result = await window.supabaseAPI.getClients();
      if (!result.success) throw new Error(result.error);
      this.clients = result.data || [];
      await this.loadClientsStorage();
      this.renderClientList();
    } catch (error) {
      console.error('[Drive] Erro ao carregar clientes:', error);
      Notificacao.show('Erro ao carregar clientes', 'error');
    }
  },

  async loadClientsStorage() {
    try {
      const result = await window.driveAPI.getClientsStorageUsage();
      if (result.success && result.data) {
        this.clientsStorage = {};
        result.data.forEach(item => {
          this.clientsStorage[item.id_client] = item.total_size_kb || 0;
        });
      }
    } catch (error) {
      console.error('[Drive] Erro ao carregar armazenamento:', error);
    }
  },

  formatStorageSize(kb) {
    if (!kb || kb === 0) return '0 KB';
    if (kb < 1024) return `${Math.round(kb)} KB`;
    if (kb < 1024 * 1024) return `${(kb / 1024).toFixed(1)} MB`;
    return `${(kb / (1024 * 1024)).toFixed(2)} GB`;
  },

  renderClientList() {
    const container = document.getElementById('client-list');
    container.innerHTML = this.clients.map(c => {
      const storageKb = this.clientsStorage[c.id] || 0;
      const percentage = Math.min((storageKb / (5 * 1024 * 1024)) * 100, 100);
      return `
        <div class="client-item" data-id="${c.id}">
          <img src="${c.profile_photo || 'https://via.placeholder.com/40'}" class="client-item-avatar">
          <div class="client-item-info">
            <div class="client-item-name">@${c.users}</div>
            <div class="client-item-storage">
              <span>${this.formatStorageSize(storageKb)}</span>
              <div class="storage-bar"><div class="storage-bar-fill" style="width: ${percentage}%"></div></div>
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.client-item').forEach(el => {
      el.addEventListener('click', () => this.selectClient(el.dataset.id));
    });
  },

  async selectClient(clientId) {
    document.querySelectorAll('.client-item').forEach(el => el.classList.remove('active'));
    document.querySelector(`.client-item[data-id="${clientId}"]`)?.classList.add('active');
    this.selectedClient = this.clients.find(c => String(c.id) === String(clientId));
    this.clearSelection();
    document.getElementById('drive-toolbar').style.display = 'flex';
    
    // Simplificado: Sem breadcrumbs, apenas título do cliente
    const breadcrumb = document.getElementById('breadcrumb');
    breadcrumb.innerHTML = `<span class="breadcrumb-item active"><i class="ph ph-house"></i> @${this.selectedClient.users}</span>`;
    
    await this.loadFolderContents();
  },

  async loadFolderContents() {
    try {
      const content = document.getElementById('drive-content');
      content.innerHTML = '<div class="empty-state"><i class="ph ph-spinner"></i><p>Carregando...</p></div>';
      
      // Chamada ajustada para o backend (sem id de pasta)
      const result = await window.driveAPI.getFolderContents(this.selectedClient.id, null);
      if (!result.success) throw new Error(result.error);

      this.files = result.files || [];
      this.sortAndRenderContents();
    } catch (error) {
      console.error('[Drive] Erro:', error);
      Notificacao.show('Erro ao carregar conteúdo', 'error');
    }
  },

  changeViewMode(mode) {
    this.viewMode = mode;
    document.querySelectorAll('.view-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.view === mode));
    document.getElementById('drive-content').className = `drive-content view-${mode}`;
    this.sortAndRenderContents();
  },

  sortAndRenderContents() {
    this.files.sort((a, b) => {
      let cmp = 0;
      switch (this.sortBy) {
        case 'name': cmp = (a.name || '').localeCompare(b.name || ''); break;
        case 'size': cmp = (a.file_size_kb || 0) - (b.file_size_kb || 0); break;
        case 'date': cmp = new Date(a.created_at || 0) - new Date(b.created_at || 0); break;
      }
      return this.sortOrder === 'asc' ? cmp : -cmp;
    });
    this.renderContents();
  },

  renderContents() {
    const content = document.getElementById('drive-content');
    if (this.files.length === 0) {
      content.innerHTML = `<div class="empty-state"><i class="ph ph-image"></i><p>Nenhum arquivo encontrado</p></div>`;
      return;
    }

    if (this.viewMode === 'list') {
      content.innerHTML = `<div class="files-list">${this.files.map(f => this.renderFileListItem(f)).join('')}</div>`;
    } else {
      content.innerHTML = `
        <div class="files-section">
          <div class="section-title"><i class="ph ph-image"></i> Todos os Arquivos (${this.files.length})</div>
          <div class="files-grid">${this.files.map(f => this.renderFileItem(f)).join('')}</div>
        </div>`;
    }
  },

  renderFileItem(file) {
    const isSelected = this.selectedItems.has(`file-${file.id}`);
    return `
      <div class="file-item ${isSelected ? 'selected' : ''}" data-id="${file.id}">
        <div class="item-select-indicator"></div>
        <div class="file-thumbnail">
          <img src="${file.url_thumbnail || file.url_media}" loading="lazy">
          ${file.file_type === 'video' ? '<span class="file-type-badge"><i class="ph-fill ph-play"></i></span>' : ''}
        </div>
      </div>`;
  },

  renderFileListItem(file) {
    const isSelected = this.selectedItems.has(`file-${file.id}`);
    return `
      <div class="file-list-item ${isSelected ? 'selected' : ''}" data-id="${file.id}">
        <div class="item-select-indicator"></div>
        <div class="file-list-thumbnail">
          <img src="${file.url_thumbnail || file.url_media}" loading="lazy">
        </div>
        <div class="file-list-info">
          <div class="file-list-name">${file.name}</div>
          <div class="file-list-details">
            <span class="file-detail-tag"><i class="ph ph-hard-drive"></i> ${this.formatFileSize(file.file_size_kb)}</span>
            <span class="file-detail-tag"><i class="ph ph-calendar"></i> ${this.formatDate(file.created_at)}</span>
          </div>
        </div>
      </div>`;
  },

  formatFileSize(kb) { return kb < 1024 ? `${Math.round(kb)} KB` : `${(kb / 1024).toFixed(1)} MB`; },
  formatDate(d) { return new Date(d).toLocaleDateString('pt-BR'); },

  clearSelection() {
    this.selectedItems.clear();
    this.updateSelectionUI();
  },

  updateSelectionUI() {
    document.querySelectorAll('.file-item, .file-list-item').forEach(el => {
      el.classList.toggle('selected', this.selectedItems.has(`file-${el.dataset.id}`));
    });
    const bar = document.getElementById('selection-bar');
    if (this.selectedItems.size > 0) {
      bar.classList.add('show');
      document.getElementById('selection-count').textContent = `${this.selectedItems.size} itens`;
    } else {
      bar.classList.remove('show');
    }
  },

  async uploadFiles(files) {
    if (!this.selectedClient) return Notificacao.show('Selecione um cliente', 'warning');
    
    // Pasta plana no R2 organizada apenas por cliente
    const folderPath = `drive/client-${this.selectedClient.id}`;
    
    this.uploadQueue = files.map((file, index) => ({
      file, index, folderPath, status: 'pending', size: file.size, name: file.name, type: file.type
    }));

    Notificacao.multiProgress.show(this.uploadQueue);
    
    const uploadPromises = [];
    const concurrency = files.some(f => f.size > 500 * 1024 * 1024) ? 2 : 5;
    
    for (let i = 0; i < concurrency; i++) uploadPromises.push(this.processUploadQueue());
    
    await Promise.all(uploadPromises);
    setTimeout(() => {
        Notificacao.multiProgress.hide();
        this.loadClientsStorage();
        this.loadFolderContents();
    }, 2000);
  },

  async processUploadQueue() {
    while (this.uploadQueue.length > 0) {
      const task = this.uploadQueue.find(t => t.status === 'pending');
      if (!task) break;
      task.status = 'uploading';
      try {
        await this.uploadSingleFile(task);
        task.status = 'completed';
      } catch (e) {
        task.status = 'error';
      }
    }
  },

  async uploadSingleFile(task) {
    const { file, index, folderPath } = task;
    const isVideo = file.type.startsWith('video/');
    const fileName = `${folderPath}/${Date.now()}-${index}.${file.name.split('.').pop()}`;

    Notificacao.multiProgress.setFileUploading(index);
    
    // Metadados
    let meta = isVideo ? await this.extractVideoMetadata(file) : await this.extractImageMetadata(file);
    
    const urlResult = await window.r2API.generateUploadUrl(fileName, file.type, file.size);
    if (!urlResult.success) throw new Error('URL error');

    await this.uploadToR2WithRetry(file, urlResult.uploadUrl, index);

    // Thumbnail
    let thumbUrl = await this.generateAndUploadThumbnail(file, folderPath, Date.now(), index, isVideo);
    
    await window.driveAPI.saveFile({
      clientId: this.selectedClient.id,
      folderId: null, // SEMPRE NULL AGORA
      path: fileName,
      name: file.name,
      urlMedia: urlResult.publicUrl,
      urlThumbnail: thumbUrl,
      fileType: isVideo ? 'video' : 'image',
      mimeType: file.type,
      fileSizeKb: Math.round(file.size / 1024),
      dimensions: meta.dimensions,
      duration: meta.duration
    });

    Notificacao.multiProgress.setFileCompleted(index);
  },

  async uploadToR2WithRetry(file, url, index, retry = 0) {
    try {
      await this.uploadToR2WithProgress(file, url, 600000, (loaded) => {
        Notificacao.multiProgress.updateFileProgress(index, loaded, file.size, 0);
      });
    } catch (e) {
      if (retry < 3) return this.uploadToR2WithRetry(file, url, index, retry + 1);
      throw e;
    }
  },

  uploadToR2WithProgress(file, url, timeout, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.upload.addEventListener('progress', e => e.lengthComputable && onProgress(e.loaded));
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject();
      xhr.onerror = reject;
      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.send(file);
    });
  },

  async generateAndUploadThumbnail(file, folderPath, ts, idx, isVideo) {
    const blob = isVideo ? await this.generateVideoThumbnail(file) : await this.generateImageThumbnail(file);
    if (!blob) return null;
    const path = `${folderPath}/thumb_${ts}-${idx}.jpg`;
    const res = await window.r2API.generateUploadUrl(path, 'image/jpeg', blob.size);
    if (res.success) {
      await this.uploadToR2WithProgress(blob, res.uploadUrl, 60000, () => {});
      return res.publicUrl;
    }
    return null;
  },

  async deleteSelected() {
    const items = Array.from(this.selectedItems);
    if (!confirm(`Excluir ${items.length} itens?`)) return;
    for (const item of items) {
      const id = item.split('-')[1];
      const file = this.files.find(f => String(f.id) === String(id));
      if (file) {
        await window.driveAPI.deleteFile(id);
        await window.r2API.deleteFiles([file.path]);
      }
    }
    this.clearSelection();
    this.loadFolderContents();
  },

  async confirmDelete(id) {
    if (!confirm('Excluir arquivo?')) return;
    const file = this.files.find(f => String(f.id) === String(id));
    if (file) {
      await window.driveAPI.deleteFile(id);
      await window.r2API.deleteFiles([file.path]);
      this.loadFolderContents();
    }
  },

  previewFile(id) {
    const file = this.files.find(f => String(f.id) === String(id));
    if (!file) return;
    const container = document.getElementById('preview-container');
    container.innerHTML = file.file_type === 'video' ? `<video src="${file.url_media}" controls autoplay></video>` : `<img src="${file.url_media}">`;
    document.getElementById('preview-info').innerHTML = `<h4>${file.name}</h4><p>${this.formatFileSize(file.file_size_kb)}</p>`;
    document.getElementById('modal-preview').classList.add('show');
  },

  // Helpers de metadados mantidos do original
  async extractImageMetadata(f) { return new Promise(r => { const i = new Image(); i.onload = () => r({dimensions: `${i.width}x${i.height}`}); i.src = URL.createObjectURL(f); }); },
  async extractVideoMetadata(f) { return new Promise(r => { const v = document.createElement('video'); v.onloadedmetadata = () => r({dimensions: `${v.videoWidth}x${v.videoHeight}`, duration: v.duration}); v.src = URL.createObjectURL(f); }); },
  async generateImageThumbnail(f) { return new Promise(r => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width=150; c.height=150; c.getContext('2d').drawImage(i,0,0,150,150); c.toBlob(r, 'image/jpeg'); }; i.src = URL.createObjectURL(f); }); },
  async generateVideoThumbnail(f) { return new Promise(r => { const v = document.createElement('video'); v.onloadeddata = () => { v.currentTime = 1; v.onseeked = () => { const c = document.createElement('canvas'); c.width=150; c.height=150; c.getContext('2d').drawImage(v,0,0,150,150); c.toBlob(r, 'image/jpeg'); }; }; v.src = URL.createObjectURL(f); }); }
};

document.addEventListener('DOMContentLoaded', () => Drive.init());
