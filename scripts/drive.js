const Drive = {
  clients: [],
  clientsStorage: {},
  selectedClient: null,
  currentFolder: null,
  folders: [],
  files: [],
  breadcrumbPath: [],
  selectedItems: new Set(),
  viewMode: 'compact',
  sortBy: 'name',
  sortOrder: 'asc',
  lastSelectedItem: null,
  lastTapTime: 0,
  lastTapItem: null,
  
  // Configurações de upload otimizadas
  MAX_CONCURRENT_UPLOADS: 10,
  THUMBNAIL_SIZE: 150,
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

    // Modal Nova Pasta
    document.getElementById('btn-new-folder').addEventListener('click', () => {
      document.getElementById('modal-new-folder').classList.add('show');
      document.getElementById('folder-name').value = '';
      document.getElementById('folder-name').focus();
    });

    document.getElementById('modal-close-folder').addEventListener('click', () => {
      document.getElementById('modal-new-folder').classList.remove('show');
    });

    document.getElementById('btn-cancel-folder').addEventListener('click', () => {
      document.getElementById('modal-new-folder').classList.remove('show');
    });

    document.getElementById('btn-create-folder').addEventListener('click', () => this.createFolder());
    
    document.getElementById('folder-name').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.createFolder();
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
        document.getElementById('modal-new-folder').classList.remove('show');
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

    // Click outside selection
    driveContent.addEventListener('click', (e) => {
      if (e.target === driveContent || e.target.closest('.empty-state') || 
          e.target.closest('.section-title')) {
        if (!e.ctrlKey && !e.metaKey) {
          this.clearSelection();
        }
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
      const item = e.target.closest('.folder-item, .file-item, .file-list-item');
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
    const type = this.getItemType(item);
    const id = item.dataset.id;
    const key = `${type}-${id}`;

    if (navigator.vibrate) navigator.vibrate(50);

    if (!this.selectedItems.has(key)) {
      this.selectedItems.add(key);
      this.lastSelectedItem = key;
      this.updateSelectionUI();
    }

    this.showActionsModal(type, id);
  },

  showActionsModal(type, id) {
    const existingModal = document.getElementById('actions-modal');
    if (existingModal) existingModal.remove();

    const item = type === 'folder' 
      ? this.folders.find(f => String(f.id) === String(id))
      : this.files.find(f => String(f.id) === String(id));

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
          ${type === 'file' ? `
            <button class="actions-modal-btn" data-action="open">
              <i class="ph ph-eye"></i> Abrir
            </button>
            <button class="actions-modal-btn" data-action="download">
              <i class="ph ph-download-simple"></i> Baixar
            </button>
          ` : `
            <button class="actions-modal-btn" data-action="open">
              <i class="ph ph-folder-open"></i> Abrir pasta
            </button>
          `}
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
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    modal.querySelectorAll('.actions-modal-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        closeModal();
        setTimeout(() => {
          if (action === 'open') {
            type === 'folder' ? this.navigateToFolder(id) : this.previewFile(id);
          } else if (action === 'download') {
            this.downloadFile(id);
          } else if (action === 'delete') {
            this.confirmDelete(type, id);
          }
        }, 200);
      });
    });
  },

  handleTouchEnd(e) {
    const item = e.target.closest('.folder-item, .file-item, .file-list-item');
    if (!item) return;

    const now = Date.now();
    const id = item.dataset.id;

    if (this.lastTapItem === id && (now - this.lastTapTime) < 300) {
      e.preventDefault();
      this.handleItemDoubleClick(e, item);
      this.lastTapTime = 0;
      this.lastTapItem = null;
    } else {
      this.lastTapTime = now;
      this.lastTapItem = id;
    }
  },

  getItemType(element) {
    if (element.classList.contains('folder-item')) return 'folder';
    if (element.classList.contains('file-item')) return 'file';
    if (element.classList.contains('file-list-item')) {
      return element.querySelector('.ph-folder') ? 'folder' : 'file';
    }
    return null;
  },

  handleItemClick(e) {
    const item = e.target.closest('.folder-item, .file-item, .file-list-item');
    if (!item) return;

    const type = this.getItemType(item);
    const id = item.dataset.id;
    const key = `${type}-${id}`;

    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      this.selectedItems.has(key) ? this.selectedItems.delete(key) : this.selectedItems.add(key);
      this.lastSelectedItem = key;
    } else if (e.shiftKey && this.lastSelectedItem) {
      e.preventDefault();
      this.selectRange(this.lastSelectedItem, key);
    } else {
      this.selectedItems.clear();
      this.selectedItems.add(key);
      this.lastSelectedItem = key;
    }

    this.updateSelectionUI();
  },

  handleItemDoubleClick(e, touchItem = null) {
    const item = touchItem || e.target.closest('.folder-item, .file-item, .file-list-item');
    if (!item) return;

    const type = this.getItemType(item);
    const id = item.dataset.id;

    type === 'folder' ? this.navigateToFolder(id) : this.previewFile(id);
  },

  selectRange(startKey, endKey) {
    const allItems = [
      ...this.folders.map(f => `folder-${f.id}`),
      ...this.files.map(f => `file-${f.id}`)
    ];

    const startIndex = allItems.indexOf(startKey);
    const endIndex = allItems.indexOf(endKey);
    if (startIndex === -1 || endIndex === -1) return;

    const [from, to] = startIndex < endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
    for (let i = from; i <= to; i++) this.selectedItems.add(allItems[i]);
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

  getStoragePercentage(kb, maxKb = 5 * 1024 * 1024) {
    return Math.min((kb / maxKb) * 100, 100);
  },

  getStorageClass(percentage) {
    if (percentage >= 90) return 'danger';
    if (percentage >= 70) return 'warning';
    return '';
  },

  renderClientList() {
    const container = document.getElementById('client-list');
    if (this.clients.length === 0) {
      container.innerHTML = '<div class="loading-clients">Nenhum cliente</div>';
      return;
    }
    
    container.innerHTML = this.clients.map(c => {
      const storageKb = this.clientsStorage[c.id] || 0;
      const storageText = this.formatStorageSize(storageKb);
      const percentage = this.getStoragePercentage(storageKb);
      const storageClass = this.getStorageClass(percentage);
      
      return `
        <div class="client-item" data-id="${c.id}">
          <img src="${c.profile_photo || 'https://via.placeholder.com/40'}" class="client-item-avatar" alt="${c.users}">
          <div class="client-item-info">
            <div class="client-item-name">@${c.users}</div>
            <div class="client-item-storage">
              <span>${storageText}</span>
              <div class="storage-bar">
                <div class="storage-bar-fill ${storageClass}" style="width: ${percentage}%"></div>
              </div>
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
    this.currentFolder = null;
    this.breadcrumbPath = [{ id: null, name: `@${this.selectedClient.users}` }];
    this.clearSelection();

    document.getElementById('drive-toolbar').style.display = 'flex';
    await this.loadFolderContents();
  },

  async loadFolderContents() {
    try {
      const content = document.getElementById('drive-content');
      content.innerHTML = '<div class="empty-state"><i class="ph ph-spinner"></i><p>Carregando...</p></div>';

      const result = await window.driveAPI.getFolderContents(this.selectedClient.id, this.currentFolder);
      if (!result.success) throw new Error(result.error);

      this.folders = result.folders || [];
      this.files = result.files || [];
      
      this.clearSelection();
      this.renderBreadcrumb();
      this.sortAndRenderContents();
    } catch (error) {
      console.error('[Drive] Erro:', error);
      Notificacao.show('Erro ao carregar conteúdo', 'error');
      document.getElementById('drive-content').innerHTML = `
        <div class="empty-state"><i class="ph ph-warning"></i><p>Erro ao carregar</p></div>
      `;
    }
  },

  renderBreadcrumb() {
    const container = document.getElementById('breadcrumb');
    container.innerHTML = this.breadcrumbPath.map((item, index) => {
      const isLast = index === this.breadcrumbPath.length - 1;
      return `
        ${index > 0 ? '<span class="breadcrumb-separator"><i class="ph ph-caret-right"></i></span>' : ''}
        <span class="breadcrumb-item ${isLast ? 'active' : ''}" data-id="${item.id}" data-index="${index}">
          ${index === 0 ? '<i class="ph ph-house"></i>' : ''} ${item.name}
        </span>
      `;
    }).join('');

    container.querySelectorAll('.breadcrumb-item:not(.active)').forEach(el => {
      el.addEventListener('click', () => {
        const index = parseInt(el.dataset.index);
        this.breadcrumbPath = this.breadcrumbPath.slice(0, index + 1);
        this.currentFolder = this.breadcrumbPath[index].id;
        this.loadFolderContents();
      });
    });
  },

  changeViewMode(mode) {
    this.viewMode = mode;
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === mode);
    });
    document.getElementById('drive-content').className = `drive-content view-${mode}`;
    this.sortAndRenderContents();
  },

  sortAndRenderContents() {
    this.files.sort((a, b) => {
      let cmp = 0;
      switch (this.sortBy) {
        case 'name': cmp = (a.name || '').localeCompare(b.name || ''); break;
        case 'size': cmp = (a.file_size_kb || 0) - (b.file_size_kb || 0); break;
        case 'type': cmp = (a.file_type || '').localeCompare(b.file_type || ''); break;
        case 'date': cmp = new Date(a.created_at || 0) - new Date(b.created_at || 0); break;
      }
      return this.sortOrder === 'asc' ? cmp : -cmp;
    });
    this.folders.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    this.renderContents();
  },

  renderContents() {
    const content = document.getElementById('drive-content');
    
    if (this.folders.length === 0 && this.files.length === 0) {
      content.innerHTML = `
        <div class="empty-state">
          <i class="ph ph-folder-open"></i>
          <p>Pasta vazia</p>
          <span class="empty-hint">Arraste arquivos ou use o botão Upload</span>
        </div>
      `;
      return;
    }

    this.viewMode === 'list' ? this.renderListView() : this.renderGridView();
  },

  renderGridView() {
    const content = document.getElementById('drive-content');
    let html = '';

    if (this.folders.length > 0) {
      html += `
        <div class="folders-section">
          <div class="section-title"><i class="ph ph-folder"></i> Pastas (${this.folders.length})</div>
          <div class="folders-grid">${this.folders.map(f => this.renderFolderItem(f)).join('')}</div>
        </div>
      `;
    }

    if (this.files.length > 0) {
      html += `
        <div class="files-section">
          <div class="section-title"><i class="ph ph-image"></i> Arquivos (${this.files.length})</div>
          <div class="files-grid">${this.files.map(f => this.renderFileItem(f)).join('')}</div>
        </div>
      `;
    }

    content.innerHTML = html;
  },

  renderListView() {
    const content = document.getElementById('drive-content');
    let html = '<div class="files-list">';
    html += this.folders.map(f => this.renderFolderListItem(f)).join('');
    html += this.files.map(f => this.renderFileListItem(f)).join('');
    html += '</div>';
    content.innerHTML = html;
  },

  renderFolderItem(folder) {
    const isSelected = this.selectedItems.has(`folder-${folder.id}`);
    return `
      <div class="folder-item ${isSelected ? 'selected' : ''}" data-id="${folder.id}">
        <div class="item-select-indicator"></div>
        <i class="ph-fill ph-folder"></i>
        <div class="folder-name" title="${folder.name}">${folder.name}</div>
      </div>
    `;
  },

  renderFileItem(file) {
    const isSelected = this.selectedItems.has(`file-${file.id}`);
    const thumbnailUrl = file.url_thumbnail || file.url_media;
    
    return `
      <div class="file-item ${isSelected ? 'selected' : ''}" data-id="${file.id}">
        <div class="item-select-indicator"></div>
        <div class="file-thumbnail">
          <img src="${thumbnailUrl}" alt="${file.name}" loading="lazy">
          ${file.file_type === 'video' ? '<span class="file-type-badge"><i class="ph-fill ph-play"></i></span>' : ''}
        </div>
      </div>
    `;
  },

  renderFolderListItem(folder) {
    const isSelected = this.selectedItems.has(`folder-${folder.id}`);
    const createdDate = folder.created_at ? this.formatDate(folder.created_at) : '';
    
    return `
      <div class="file-list-item ${isSelected ? 'selected' : ''}" data-id="${folder.id}">
        <div class="item-select-indicator"></div>
        <div class="list-item-icon folder"><i class="ph-fill ph-folder"></i></div>
        <div class="file-list-info">
          <div class="file-list-name">${folder.name}</div>
          <div class="file-list-meta">Pasta</div>
          ${createdDate ? `
            <div class="file-list-details">
              <span class="file-detail-tag"><i class="ph ph-calendar"></i> ${createdDate}</span>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  },

  renderFileListItem(file) {
    const isSelected = this.selectedItems.has(`file-${file.id}`);
    const typeClass = file.file_type === 'video' ? 'type-video' : 'type-image';
    const typeLabel = file.file_type === 'video' ? 'Vídeo' : 'Imagem';
    const thumbnailUrl = file.url_thumbnail || file.url_media;
    
    const details = [];
    details.push(`<span class="file-detail-tag ${typeClass}"><i class="ph ph-${file.file_type === 'video' ? 'video-camera' : 'image'}"></i> ${typeLabel}</span>`);
    
    if (file.file_size_kb) {
      details.push(`<span class="file-detail-tag"><i class="ph ph-hard-drive"></i> ${this.formatFileSize(file.file_size_kb)}</span>`);
    }
    
    if (file.dimensions) {
      details.push(`<span class="file-detail-tag"><i class="ph ph-frame-corners"></i> ${file.dimensions}</span>`);
    }
    
    if (file.duration) {
      details.push(`<span class="file-detail-tag"><i class="ph ph-timer"></i> ${this.formatDuration(file.duration)}</span>`);
    }
    
    if (file.mime_type) {
      const mimeShort = file.mime_type.split('/')[1]?.toUpperCase() || file.mime_type;
      details.push(`<span class="file-detail-tag"><i class="ph ph-file"></i> ${mimeShort}</span>`);
    }
    
    if (file.data_de_captura) {
      details.push(`<span class="file-detail-tag"><i class="ph ph-camera"></i> ${this.formatDate(file.data_de_captura)}</span>`);
    }
    
    if (file.created_at) {
      details.push(`<span class="file-detail-tag"><i class="ph ph-cloud-arrow-up"></i> ${this.formatDate(file.created_at)}</span>`);
    }
    
    if (file.updated_at && file.updated_at !== file.created_at) {
      details.push(`<span class="file-detail-tag"><i class="ph ph-pencil"></i> ${this.formatDate(file.updated_at)}</span>`);
    }

    return `
      <div class="file-list-item ${isSelected ? 'selected' : ''}" data-id="${file.id}">
        <div class="item-select-indicator"></div>
        <div class="file-list-thumbnail">
          <img src="${thumbnailUrl}" alt="${file.name}" loading="lazy">
          ${file.file_type === 'video' ? '<span class="video-indicator"><i class="ph-fill ph-play"></i></span>' : ''}
        </div>
        <div class="file-list-info">
          <div class="file-list-name">${file.name}</div>
          <div class="file-list-details">${details.join('')}</div>
        </div>
      </div>
    `;
  },

  formatFileSize(kb) {
    if (!kb) return '';
    if (kb < 1024) return `${Math.round(kb)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  },

  formatDuration(seconds) {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  },

  formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR', { 
      day: '2-digit', 
      month: '2-digit', 
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
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

  formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  },

  clearSelection() {
    this.selectedItems.clear();
    this.lastSelectedItem = null;
    this.updateSelectionUI();
  },

  updateSelectionUI() {
    document.querySelectorAll('.folder-item, .file-item, .file-list-item').forEach(el => {
      const type = this.getItemType(el);
      const id = el.dataset.id;
      el.classList.toggle('selected', this.selectedItems.has(`${type}-${id}`));
    });

    const selectionBar = document.getElementById('selection-bar');
    if (this.selectedItems.size > 0) {
      selectionBar.classList.add('show');
      document.getElementById('selection-count').textContent = 
        `${this.selectedItems.size} ${this.selectedItems.size === 1 ? 'item' : 'itens'}`;
    } else {
      selectionBar.classList.remove('show');
    }
  },

  async deleteSelected() {
    const items = Array.from(this.selectedItems);
    if (items.length === 0) return;

    if (!confirm(`Excluir ${items.length} ${items.length === 1 ? 'item' : 'itens'}?`)) return;

    try {
      Notificacao.show('Excluindo...', 'info');
      const filesToDelete = [];
      
      for (const item of items) {
        const [type, id] = item.split('-');
        if (type === 'folder') {
          const result = await window.driveAPI.deleteFolder(id);
          if (result.success && result.deletedFiles) filesToDelete.push(...result.deletedFiles);
        } else {
          const file = this.files.find(f => String(f.id) === String(id));
          if (file) {
            filesToDelete.push(file.path);
            await window.driveAPI.deleteFile(id);
          }
        }
      }

      if (filesToDelete.length > 0) await window.r2API.deleteFiles(filesToDelete);

      Notificacao.show('Excluído!', 'success');
      this.clearSelection();
      await this.loadClientsStorage();
      this.renderClientList();
      await this.loadFolderContents();
    } catch (error) {
      console.error('[Drive] Erro:', error);
      Notificacao.show('Erro: ' + error.message, 'error');
    }
  },

 async downloadSelected() {
    const fileItems = Array.from(this.selectedItems).filter(item => item.startsWith('file-'));
    
    if (fileItems.length === 0) {
      Notificacao.show('Selecione arquivos para baixar', 'warning');
      return;
    }

    const files = fileItems.map(item => {
      const id = item.split('-')[1];
      return this.files.find(f => String(f.id) === String(id));
    }).filter(f => f);

    await this.downloadFilesAsZip(files);
  },

  async downloadFile(fileId) {
    const file = this.files.find(f => String(f.id) === String(fileId));
    if (!file) return;

    await this.downloadFilesAsZip([file]);
  },

  async downloadFilesAsZip(files) {
    if (!files || files.length === 0) return;

    try {
      Notificacao.show('Preparando download...', 'info');

      const zip = new JSZip();
      let completed = 0;

      // Baixar cada arquivo e adicionar ao ZIP
      for (const file of files) {
        try {
          Notificacao.show(`Baixando ${completed + 1} de ${files.length}...`, 'info');
          
          const response = await fetch(file.url_media);
          if (!response.ok) throw new Error(`Erro ao baixar ${file.name}`);
          
          const blob = await response.blob();
          const fileName = file.name || file.path?.split('/').pop() || `arquivo_${file.id}`;
          
          zip.file(fileName, blob);
          completed++;
        } catch (error) {
          console.error(`[Drive] Erro ao baixar ${file.name}:`, error);
          Notificacao.show(`Erro ao baixar ${file.name}`, 'warning');
        }
      }

      if (completed === 0) {
        Notificacao.show('Nenhum arquivo foi baixado', 'error');
        return;
      }

      // Gerar o ZIP
      Notificacao.show('Gerando arquivo ZIP...', 'info');
      const zipBlob = await zip.generateAsync({ 
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });

      // Criar nome do ZIP
      const clientName = this.selectedClient?.users || 'arquivos';
      const timestamp = new Date().toISOString().split('T')[0];
      const zipName = files.length === 1 
        ? `${files[0].name.split('.')[0]}.zip`
        : `${clientName}_${timestamp}_${files.length}_arquivos.zip`;

      // Download do ZIP
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = zipName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      Notificacao.show(`Download concluído! ${completed} arquivo(s)`, 'success');
    } catch (error) {
      console.error('[Drive] Erro ao criar ZIP:', error);
      Notificacao.show('Erro ao criar arquivo ZIP', 'error');
    }
  },

  async downloadFile(fileId) {
    const file = this.files.find(f => String(f.id) === String(fileId));
    if (!file) return;

    try {
      const fileName = file.path ? file.path.split('/').pop() : file.name;
      const a = document.createElement('a');
      a.href = file.url_media;
      a.download = fileName;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (error) {
      console.error('[Drive] Erro ao baixar:', error);
      Notificacao.show('Erro ao baixar: ' + file.name, 'error');
    }
  },

  async navigateToFolder(folderId) {
    const folder = this.folders.find(f => String(f.id) === String(folderId));
    if (!folder) return;

    this.currentFolder = folder.id;
    this.breadcrumbPath.push({ id: folder.id, name: folder.name });
    await this.loadFolderContents();
  },

  previewFile(fileId) {
    const file = this.files.find(f => String(f.id) === String(fileId));
    if (!file) return;

    const container = document.getElementById('preview-container');
    const info = document.getElementById('preview-info');

    if (file.file_type === 'video') {
      container.innerHTML = `<video src="${file.url_media}" controls autoplay playsinline></video>`;
    } else {
      container.innerHTML = `<img src="${file.url_media}" alt="${file.name}">`;
    }

    const details = [];
    if (file.dimensions) details.push(file.dimensions);
    if (file.file_size_kb) details.push(this.formatFileSize(file.file_size_kb));
    if (file.duration) details.push(this.formatDuration(file.duration));

    info.innerHTML = `
      <h4>${file.name}</h4>
      ${details.length ? `<p>${details.join(' • ')}</p>` : ''}
    `;

    document.getElementById('modal-preview').classList.add('show');
  },

  async createFolder() {
    const name = document.getElementById('folder-name').value.trim();
    if (!name) {
      Notificacao.show('Digite um nome', 'warning');
      return;
    }

    try {
      Notificacao.show('Criando pasta...', 'info');
      
      const result = await window.driveAPI.createFolder({
        name,
        clientId: this.selectedClient.id,
        parentId: this.currentFolder
      });

      if (!result.success) throw new Error(result.error);

      document.getElementById('modal-new-folder').classList.remove('show');
      Notificacao.show('Pasta criada!', 'success');
      await this.loadFolderContents();
    } catch (error) {
      console.error('[Drive] Erro:', error);
      Notificacao.show('Erro: ' + error.message, 'error');
    }
  },

  async extractImageMetadata(file) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({
          dimensions: `${img.naturalWidth}x${img.naturalHeight}`,
          width: img.naturalWidth,
          height: img.naturalHeight
        });
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => resolve({ dimensions: null });
      img.src = URL.createObjectURL(file);
    });
  },

  async extractVideoMetadata(file) {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      
      video.onloadedmetadata = () => {
        resolve({
          dimensions: `${video.videoWidth}x${video.videoHeight}`,
          width: video.videoWidth,
          height: video.videoHeight,
          duration: Math.round(video.duration * 100) / 100
        });
        URL.revokeObjectURL(video.src);
      };
      video.onerror = () => resolve({ dimensions: null, duration: null });
      video.src = URL.createObjectURL(file);
    });
  },

  async generateVideoThumbnail(file) {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      video.preload = 'metadata';
      video.muted = true;
      
      video.onloadedmetadata = () => {
        video.currentTime = Math.min(1, video.duration * 0.1);
      };
      
      video.onseeked = () => {
        // Configurar canvas para thumbnail quadrado 150x150
        const thumbSize = this.THUMBNAIL_SIZE;
        canvas.width = thumbSize;
        canvas.height = thumbSize;
        
        // Calcular dimensões para corte centralizado
        const scale = Math.max(thumbSize / video.videoWidth, thumbSize / video.videoHeight);
        const scaledWidth = video.videoWidth * scale;
        const scaledHeight = video.videoHeight * scale;
        
        // Centralizar o vídeo no canvas
        const x = (thumbSize - scaledWidth) / 2;
        const y = (thumbSize - scaledHeight) / 2;
        
        ctx.drawImage(video, x, y, scaledWidth, scaledHeight);
        
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(video.src);
          resolve(blob);
        }, 'image/jpeg', 0.85);
      };
      
      video.onerror = () => {
        URL.revokeObjectURL(video.src);
        resolve(null);
      };
      
      video.src = URL.createObjectURL(file);
    });
  },

  async generateImageThumbnail(file) {
    return new Promise((resolve) => {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      img.onload = () => {
        // Configurar canvas para thumbnail quadrado 150x150
        const thumbSize = this.THUMBNAIL_SIZE;
        canvas.width = thumbSize;
        canvas.height = thumbSize;
        
        // Calcular dimensões para corte centralizado
        const scale = Math.max(thumbSize / img.width, thumbSize / img.height);
        const scaledWidth = img.width * scale;
        const scaledHeight = img.height * scale;
        
        // Centralizar a imagem no canvas
        const x = (thumbSize - scaledWidth) / 2;
        const y = (thumbSize - scaledHeight) / 2;
        
        ctx.drawImage(img, x, y, scaledWidth, scaledHeight);
        
        canvas.toBlob((blob) => {
          URL.revokeObjectURL(img.src);
          resolve(blob);
        }, 'image/jpeg', 0.85);
      };
      
      img.onerror = () => {
        URL.revokeObjectURL(img.src);
        resolve(null);
      };
      
      img.src = URL.createObjectURL(file);
    });
  },

  extractCaptureDate(file) {
    return file.lastModified ? new Date(file.lastModified).toISOString() : null;
  },

  async uploadFiles(files) {
    if (!this.selectedClient) {
      Notificacao.show('Selecione um cliente primeiro', 'warning');
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'video/avi', 'video/x-msvideo'];
    
    for (const file of files) {
      if (!allowedTypes.includes(file.type)) {
        Notificacao.show(`Tipo não permitido: ${file.name}`, 'warning');
        return;
      }
      if (file.size > 5000 * 1024 * 1024) {
        Notificacao.show(`Arquivo muito grande (max 5gb): ${file.name}`, 'warning');
        return;
      }
    }

    try {
      const folderPath = this.currentFolder 
        ? `drive/client-${this.selectedClient.id}/folder-${this.currentFolder}`
        : `drive/client-${this.selectedClient.id}`;

      // Preparar fila de uploads
      this.uploadQueue = files.map((file, index) => ({
        file,
        index,
        folderPath,
        status: 'pending',
        size: file.size,
        name: file.name,
        type: file.type
      }));

      // Mostrar interface multi-arquivo
      Notificacao.multiProgress.show(this.uploadQueue);

      this.activeUploads = 0;

      // Iniciar uploads simultâneos
      const uploadPromises = [];
      for (let i = 0; i < this.MAX_CONCURRENT_UPLOADS; i++) {
        uploadPromises.push(this.processUploadQueue());
      }

      await Promise.all(uploadPromises);

      // Upload completo - aguardar 2 segundos antes de fechar
      setTimeout(async () => {
        Notificacao.multiProgress.hide();
        Notificacao.show(`${files.length} arquivo(s) enviado(s)!`, 'success');
        
        await this.loadClientsStorage();
        this.renderClientList();
        document.querySelector(`.client-item[data-id="${this.selectedClient.id}"]`)?.classList.add('active');
      }, 2000);
      
      await this.loadFolderContents();
      
    } catch (error) {
      console.error('[Drive] Erro no upload:', error);
      Notificacao.multiProgress.hide();
      Notificacao.show('Erro no upload: ' + error.message, 'error');
    }
  },

  async processUploadQueue() {
    while (this.uploadQueue.length > 0) {
      const task = this.uploadQueue.find(t => t.status === 'pending');
      if (!task) break;

      task.status = 'uploading';
      this.activeUploads++;

      try {
        await this.uploadSingleFile(task);
        task.status = 'completed';
        this.uploadStats.completedFiles++;
      } catch (error) {
        task.status = 'error';
        console.error(`[Drive] Erro ao enviar ${task.file.name}:`, error);
        throw error;
      } finally {
        this.activeUploads--;
      }
    }
  },

  async uploadSingleFile(task) {
    const { file, index, folderPath } = task;
    const isVideo = file.type.startsWith('video/');
    const ext = file.name.split('.').pop().toLowerCase();
    const timestamp = Date.now();
    const fileName = `${folderPath}/${timestamp}-${index}.${ext}`;

    // Marcar como fazendo upload
    Notificacao.multiProgress.setFileUploading(index);

    // Extrair metadados
    let metadata = isVideo 
      ? await this.extractVideoMetadata(file) 
      : await this.extractImageMetadata(file);
    
    const captureDate = this.extractCaptureDate(file);

    // Gerar URL de upload
    const urlResult = await window.r2API.generateUploadUrl(fileName, file.type, file.size);
    if (!urlResult.success) throw new Error('Erro ao gerar URL: ' + urlResult.error);

    // Upload do arquivo principal com callback de progresso
    let lastTime = Date.now();
    let lastLoaded = 0;
    let speeds = [];

    await this.uploadToR2WithProgress(file, urlResult.uploadUrl, (loaded) => {
      const now = Date.now();
      const timeDiff = (now - lastTime) / 1000;
      const bytesDiff = loaded - lastLoaded;
      
      if (timeDiff > 0) {
        const speed = bytesDiff / timeDiff;
        speeds.push(speed);
        if (speeds.length > 5) speeds.shift();
      }
      
      const avgSpeed = speeds.length > 0 
        ? speeds.reduce((a, b) => a + b, 0) / speeds.length 
        : 0;
      
      lastTime = now;
      lastLoaded = loaded;
      
      Notificacao.multiProgress.updateFileProgress(index, loaded, file.size, avgSpeed);
    });

    // Marcar como processando (gerando thumbnail)
    Notificacao.multiProgress.setFileProcessing(index, 'Gerando thumbnail...');

    // Gerar e fazer upload do thumbnail
    let thumbnailUrl = null;
    try {
      const thumbnailBlob = isVideo 
        ? await this.generateVideoThumbnail(file)
        : await this.generateImageThumbnail(file);
      
      if (thumbnailBlob) {
        const thumbFileName = `${folderPath}/thumb_${timestamp}-${index}.jpg`;
        const thumbUrlResult = await window.r2API.generateUploadUrl(
          thumbFileName, 
          'image/jpeg', 
          thumbnailBlob.size
        );
        
        if (thumbUrlResult.success) {
          await this.uploadToR2WithProgress(thumbnailBlob, thumbUrlResult.uploadUrl);
          thumbnailUrl = thumbUrlResult.publicUrl;
        }
      }
    } catch (thumbError) {
      console.warn('[Drive] Erro ao gerar thumbnail:', thumbError);
    }
    
    // Marcar como processando (salvando no banco)
    Notificacao.multiProgress.setFileProcessing(index, 'Salvando...');

    // Salvar registro no banco
    await window.driveAPI.saveFile({
      clientId: this.selectedClient.id,
      folderId: this.currentFolder,
      path: fileName,
      name: file.name,
      urlMedia: urlResult.publicUrl,
      urlThumbnail: thumbnailUrl,
      fileType: isVideo ? 'video' : 'image',
      mimeType: file.type,
      fileSizeKb: Math.round(file.size / 1024),
      dimensions: metadata.dimensions || null,
      duration: metadata.duration || null,
      dataDeCaptura: captureDate
    });

    // Marcar como concluído
    Notificacao.multiProgress.setFileCompleted(index);
  },

  uploadToR2WithProgress(file, uploadUrl, onProgress = null) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      if (onProgress) {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            onProgress(e.loaded);
          }
        });
      }

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Erro de rede')));
      xhr.addEventListener('timeout', () => reject(new Error('Timeout')));

      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.timeout = 300000;
      xhr.send(file);
    });
  },

  async confirmDelete(type, id) {
    const msg = type === 'folder' ? 'Excluir esta pasta?' : 'Excluir este arquivo?';
    if (!confirm(msg)) return;

    try {
      Notificacao.show('Excluindo...', 'info');
      
      let filesToDelete = [];
      
      if (type === 'folder') {
        const result = await window.driveAPI.deleteFolder(id);
        if (!result.success) throw new Error(result.error);
        if (result.deletedFiles) filesToDelete = result.deletedFiles;
      } else {
        const file = this.files.find(f => String(f.id) === String(id));
        if (file) {
          filesToDelete.push(file.path);
          if (file.url_thumbnail) {
            const thumbPath = file.url_thumbnail.split('.com/')[1];
            if (thumbPath) filesToDelete.push(thumbPath);
          }
          const result = await window.driveAPI.deleteFile(id);
          if (!result.success) throw new Error(result.error);
        }
      }

      if (filesToDelete.length > 0) await window.r2API.deleteFiles(filesToDelete);

      Notificacao.show('Excluído!', 'success');
      this.clearSelection();
      
      await this.loadClientsStorage();
      this.renderClientList();
      document.querySelector(`.client-item[data-id="${this.selectedClient.id}"]`)?.classList.add('active');
      
      await this.loadFolderContents();
    } catch (error) {
      console.error('[Drive] Erro:', error);
      Notificacao.show('Erro: ' + error.message, 'error');
    }
  }
};

// Sobrescrever showCorrectScreen do Auth
Auth.showCorrectScreen = function() {
  const loginScreen = document.getElementById('login-screen');
  const driveSystem = document.getElementById('drive-system');
  
  if (!loginScreen || !driveSystem) return false;
  
  if (this.isAuthenticated()) {
    loginScreen.style.display = 'none';
    driveSystem.classList.add('active');
    return true;
  } else {
    loginScreen.style.display = 'block';
    driveSystem.classList.remove('active');
    return false;
  }
};

document.addEventListener('DOMContentLoaded', () => Drive.init());


