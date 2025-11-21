const Drive = {
  clients: [],
  selectedClient: null,
  currentFolder: null,
  folders: [],
  files: [],
  breadcrumbPath: [],
  selectedItems: new Set(),
  viewMode: 'compact', // 'compact', 'grid', 'list'
  sortBy: 'name', // 'name', 'size', 'type', 'date'
  sortOrder: 'asc',
  draggedItems: new Set(),

  async init() {
    VANTA.WAVES({
      el: "#bg", mouseControls: true, touchControls: true, gyroControls: false,
      minHeight: 200, minWidth: 200, scale: 1, scaleMobile: 1, color: 0x000000,
      shininess: 25, waveHeight: 25, waveSpeed: 1.05, zoom: 1.20
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

    // Nova pasta
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

    // View mode buttons
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const mode = e.currentTarget.dataset.view;
        this.changeViewMode(mode);
      });
    });

    // Sort button - usar modal de ordenação
    document.getElementById('btn-sort')?.addEventListener('click', () => {
      document.getElementById('modal-sort').classList.add('show');
    });

    document.getElementById('modal-close-sort')?.addEventListener('click', () => {
      document.getElementById('modal-sort').classList.remove('show');
    });

    // Opções de ordenação
    document.querySelectorAll('.sort-option').forEach(opt => {
      opt.addEventListener('click', (e) => {
        const field = e.currentTarget.dataset.field;
        this.setSortBy(field);
        document.getElementById('modal-sort').classList.remove('show');
      });
    });

    // Selection actions
    document.getElementById('btn-select-all')?.addEventListener('click', () => this.selectAll());
    document.getElementById('btn-deselect')?.addEventListener('click', () => this.clearSelection());
    document.getElementById('btn-delete-selected')?.addEventListener('click', () => this.deleteSelected());
    document.getElementById('btn-download-selected')?.addEventListener('click', () => this.downloadSelected());

    // Preview modal
    document.getElementById('modal-close-preview').addEventListener('click', () => {
      document.getElementById('modal-preview').classList.remove('show');
      document.getElementById('preview-container').innerHTML = '';
    });

    // Fechar modal com ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.getElementById('modal-new-folder').classList.remove('show');
        document.getElementById('modal-preview').classList.remove('show');
        document.getElementById('preview-container').innerHTML = '';
      }
    });

    // Drag and drop na área principal
    const driveContent = document.getElementById('drive-content');
    driveContent.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (this.selectedClient) driveContent.classList.add('dragover');
    });
    driveContent.addEventListener('dragleave', () => driveContent.classList.remove('dragover'));
    driveContent.addEventListener('drop', (e) => {
      e.preventDefault();
      driveContent.classList.remove('dragover');
      if (this.selectedClient && e.dataTransfer.files.length > 0) {
        this.uploadFiles(Array.from(e.dataTransfer.files));
      }
    });

    // Clicks em items
    document.addEventListener('click', (e) => {
      const checkbox = e.target.closest('.item-checkbox, .file-list-checkbox');
      const folderItem = e.target.closest('.folder-item');
      const fileItem = e.target.closest('.file-item');
      const listItem = e.target.closest('.file-list-item');
      const deleteBtn = e.target.closest('.action-btn[data-action="delete"]');
      const downloadBtn = e.target.closest('.action-btn[data-action="download"]');

      if (checkbox) {
        e.stopPropagation();
        const item = checkbox.closest('.folder-item, .file-item, .file-list-item');
        const isFolder = item.classList.contains('folder-item') || 
                        (item.classList.contains('file-list-item') && item.querySelector('.ph-folder'));
        const type = isFolder ? 'folder' : 'file';
        const id = item.dataset.id;
        this.toggleSelection(type, id);
        return;
      }

      if (deleteBtn) {
        e.stopPropagation();
        const type = deleteBtn.dataset.type;
        const id = deleteBtn.dataset.id;
        this.confirmDelete(type, id);
        return;
      }

      if (downloadBtn) {
        e.stopPropagation();
        const id = downloadBtn.dataset.id;
        this.downloadFile(id);
        return;
      }

      if (folderItem && !e.target.closest('.action-btn, .item-checkbox')) {
        const folderId = folderItem.dataset.id;
        this.navigateToFolder(folderId);
        return;
      }

      if (fileItem && !e.target.closest('.action-btn, .item-checkbox')) {
        const fileId = fileItem.dataset.id;
        this.previewFile(fileId);
        return;
      }

      if (listItem && !e.target.closest('.action-btn, .file-list-checkbox')) {
        const isFolder = listItem.querySelector('.ph-folder');
        if (isFolder) {
          const folderId = listItem.dataset.id;
          this.navigateToFolder(folderId);
        } else {
          const fileId = listItem.dataset.id;
          this.previewFile(fileId);
        }
        return;
      }
    });

    // Drag items para mover
    document.addEventListener('dragstart', (e) => {
      const item = e.target.closest('.folder-item, .file-item');
      if (item) {
        const type = item.classList.contains('folder-item') ? 'folder' : 'file';
        const id = item.dataset.id;
        
        // Se o item não está selecionado, seleciona apenas ele
        if (!this.selectedItems.has(`${type}-${id}`)) {
          this.clearSelection();
          this.toggleSelection(type, id);
        }
        
        // Adiciona classe dragging em todos os itens selecionados
        this.draggedItems = new Set(this.selectedItems);
        this.updateDraggingState();
        
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', Array.from(this.draggedItems).join(','));
      }
    });

    document.addEventListener('dragend', () => {
      this.draggedItems.clear();
      this.updateDraggingState();
      document.querySelectorAll('.folder-item').forEach(f => f.classList.remove('drop-target'));
    });

    // Drop em pastas
    document.addEventListener('dragover', (e) => {
      const folder = e.target.closest('.folder-item');
      if (folder && this.draggedItems.size > 0) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        folder.classList.add('drop-target');
      }
    });

    document.addEventListener('dragleave', (e) => {
      const folder = e.target.closest('.folder-item');
      if (folder) {
        folder.classList.remove('drop-target');
      }
    });

    document.addEventListener('drop', async (e) => {
      const folder = e.target.closest('.folder-item');
      if (folder && this.draggedItems.size > 0) {
        e.preventDefault();
        folder.classList.remove('drop-target');
        const targetFolderId = folder.dataset.id;
        await this.moveItemsToFolder(targetFolderId);
      }
    });
  },

  async loadClients() {
    try {
      console.log('[Drive] Carregando clientes...');
      const result = await window.supabaseAPI.getClients();
      if (!result.success) throw new Error(result.error);
      this.clients = result.data || [];
      this.renderClientList();
      console.log('[Drive] Clientes carregados:', this.clients.length);
    } catch (error) {
      console.error('[Drive] Erro ao carregar clientes:', error);
      Notificacao.show('Erro ao carregar clientes', 'error');
    }
  },

  renderClientList() {
    const container = document.getElementById('client-list');
    if (this.clients.length === 0) {
      container.innerHTML = '<div class="loading-clients">Nenhum cliente</div>';
      return;
    }
    container.innerHTML = this.clients.map(c => `
      <div class="client-item" data-id="${c.id}">
        <img src="${c.profile_photo || 'https://via.placeholder.com/40'}" class="client-item-avatar" alt="${c.users}">
        <div class="client-item-info">
          <div class="client-item-name">@${c.users}</div>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.client-item').forEach(el => {
      el.addEventListener('click', () => this.selectClient(el.dataset.id));
    });
  },

  async selectClient(clientId) {
    console.log('[Drive] Selecionando cliente:', clientId);
    
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
      console.log('[Drive] Carregando conteúdo da pasta...');
      const content = document.getElementById('drive-content');
      content.innerHTML = '<div class="empty-state"><i class="ph ph-spinner"></i><p>Carregando...</p></div>';

      const result = await window.driveAPI.getFolderContents(this.selectedClient.id, this.currentFolder);
      
      if (!result.success) throw new Error(result.error);

      this.folders = result.folders || [];
      this.files = result.files || [];
      
      console.log(`[Drive] Carregado: ${this.folders.length} pastas, ${this.files.length} arquivos`);
      
      this.clearSelection();
      this.renderBreadcrumb();
      this.sortAndRenderContents();
    } catch (error) {
      console.error('[Drive] Erro ao carregar conteúdo:', error);
      Notificacao.show('Erro ao carregar conteúdo', 'error');
      document.getElementById('drive-content').innerHTML = `
        <div class="empty-state">
          <i class="ph ph-warning"></i>
          <p>Erro ao carregar conteúdo</p>
        </div>
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
    // Ordenar arquivos
    this.files.sort((a, b) => {
      let comparison = 0;
      switch (this.sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'size':
          comparison = (a.file_size_kb || 0) - (b.file_size_kb || 0);
          break;
        case 'type':
          comparison = (a.file_type || '').localeCompare(b.file_type || '');
          break;
        case 'date':
          comparison = new Date(a.created_at || 0) - new Date(b.created_at || 0);
          break;
        case 'capture':
          const dateA = a.data_de_captura ? new Date(a.data_de_captura) : new Date(0);
          const dateB = b.data_de_captura ? new Date(b.data_de_captura) : new Date(0);
          comparison = dateA - dateB;
          break;
      }
      return this.sortOrder === 'asc' ? comparison : -comparison;
    });

    // Ordenar pastas por nome sempre
    this.folders.sort((a, b) => a.name.localeCompare(b.name));

    this.renderContents();
  },

  setSortBy(field) {
    if (this.sortBy === field) {
      this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = field;
      this.sortOrder = 'asc';
    }
    
    // Atualizar UI do botão de ordenação
    const sortBtn = document.getElementById('btn-sort');
    if (sortBtn) {
      const labels = {
        name: 'Nome',
        size: 'Tamanho',
        type: 'Tipo',
        date: 'Data Upload',
        capture: 'Data Captura'
      };
      const icon = this.sortOrder === 'asc' ? '↑' : '↓';
      sortBtn.innerHTML = `<i class="ph ph-sort-ascending"></i> <span>${labels[field]} ${icon}</span>`;
    }
    
    this.sortAndRenderContents();
  },

  renderContents() {
    const content = document.getElementById('drive-content');
    
    if (this.folders.length === 0 && this.files.length === 0) {
      content.innerHTML = `
        <div class="empty-state">
          <i class="ph ph-folder-open"></i>
          <p>Pasta vazia - arraste arquivos aqui</p>
        </div>
      `;
      return;
    }

    if (this.viewMode === 'list') {
      this.renderListView();
    } else {
      this.renderGridView();
    }
  },

  renderGridView() {
    const content = document.getElementById('drive-content');
    let html = '';

    if (this.folders.length > 0) {
      html += `
        <div class="folders-section">
          <div class="section-title">Pastas (${this.folders.length})</div>
          <div class="folders-grid">
            ${this.folders.map(f => this.renderFolderItem(f)).join('')}
          </div>
        </div>
      `;
    }

    if (this.files.length > 0) {
      html += `
        <div class="files-section">
          <div class="section-title">Arquivos (${this.files.length})</div>
          <div class="files-grid">
            ${this.files.map(f => this.renderFileItem(f)).join('')}
          </div>
        </div>
      `;
    }

    content.innerHTML = html;
  },

  renderListView() {
    const content = document.getElementById('drive-content');
    let html = '';

    if (this.folders.length > 0) {
      html += `
        <div class="folders-section">
          <div class="section-title">Pastas (${this.folders.length})</div>
          <div class="files-list">
            ${this.folders.map(f => this.renderFolderListItem(f)).join('')}
          </div>
        </div>
      `;
    }

    if (this.files.length > 0) {
      html += `
        <div class="files-section">
          <div class="section-title">Arquivos (${this.files.length})</div>
          <div class="files-list">
            ${this.files.map(f => this.renderFileListItem(f)).join('')}
          </div>
        </div>
      `;
    }

    content.innerHTML = html;
  },

  renderFolderItem(folder) {
    const isSelected = this.selectedItems.has(`folder-${folder.id}`);
    return `
      <div class="folder-item ${isSelected ? 'selected' : ''}" data-id="${folder.id}" draggable="true">
        <div class="item-checkbox ${isSelected ? 'checked' : ''}">
          <i class="ph-fill ph-check"></i>
        </div>
        <div class="item-actions">
          <button class="action-btn" data-action="delete" data-type="folder" data-id="${folder.id}">
            <i class="ph ph-trash"></i>
          </button>
        </div>
        <i class="ph-fill ph-folder"></i>
        <div class="folder-name" title="${folder.name}">${folder.name}</div>
      </div>
    `;
  },

  renderFileItem(file) {
    const isSelected = this.selectedItems.has(`file-${file.id}`);
    return `
      <div class="file-item ${isSelected ? 'selected' : ''}" data-id="${file.id}" draggable="true">
        <div class="item-checkbox ${isSelected ? 'checked' : ''}">
          <i class="ph-fill ph-check"></i>
        </div>
        <div class="item-actions">
          <button class="action-btn" data-action="download" data-type="file" data-id="${file.id}">
            <i class="ph ph-download-simple"></i>
          </button>
          <button class="action-btn" data-action="delete" data-type="file" data-id="${file.id}">
            <i class="ph ph-trash"></i>
          </button>
        </div>
        <div class="file-thumbnail">
          ${file.file_type === 'video' 
            ? `<video src="${file.url_media}" preload="metadata"></video>`
            : `<img src="${file.url_media}" alt="${file.name}">`
          }
          <span class="file-type-badge">${file.file_type === 'video' ? 'VÍD' : 'IMG'}</span>
        </div>
        ${this.viewMode === 'grid' ? `
          <div class="file-info-overlay">
            <div class="file-name" title="${file.name}">${this.truncateName(file.name, 20)}</div>
            <div class="file-meta">${this.formatFileSize(file.file_size_kb)}</div>
          </div>
        ` : ''}
      </div>
    `;
  },

  renderFolderListItem(folder) {
    const isSelected = this.selectedItems.has(`folder-${folder.id}`);
    return `
      <div class="file-list-item ${isSelected ? 'selected' : ''}" data-id="${folder.id}" draggable="true">
        <div class="file-list-checkbox ${isSelected ? 'checked' : ''}">
          <i class="ph-fill ph-check"></i>
        </div>
        <div style="font-size: 32px; color: #fbbf24; width: 48px; text-align: center;">
          <i class="ph-fill ph-folder"></i>
        </div>
        <div class="file-list-info">
          <div class="file-list-name">${folder.name}</div>
          <div class="file-list-meta">
            <span>Pasta</span>
          </div>
        </div>
        <div class="file-list-actions">
          <button class="action-btn" data-action="delete" data-type="folder" data-id="${folder.id}">
            <i class="ph ph-trash"></i>
          </button>
        </div>
      </div>
    `;
  },

  renderFileListItem(file) {
    const isSelected = this.selectedItems.has(`file-${file.id}`);
    return `
      <div class="file-list-item ${isSelected ? 'selected' : ''}" data-id="${file.id}" draggable="true">
        <div class="file-list-checkbox ${isSelected ? 'checked' : ''}">
          <i class="ph-fill ph-check"></i>
        </div>
        <div class="file-list-thumbnail">
          ${file.file_type === 'video' 
            ? `<video src="${file.url_media}" preload="metadata"></video>`
            : `<img src="${file.url_media}" alt="${file.name}">`
          }
        </div>
        <div class="file-list-info">
          <div class="file-list-name">${file.name}</div>
          <div class="file-list-meta">
            <span>${file.file_type === 'video' ? 'Vídeo' : 'Imagem'}</span>
            <span>•</span>
            <span>${this.formatFileSize(file.file_size_kb)}</span>
            ${file.dimensions ? `<span>•</span><span>${file.dimensions}</span>` : ''}
          </div>
        </div>
        <div class="file-list-actions">
          <button class="action-btn" data-action="download" data-type="file" data-id="${file.id}">
            <i class="ph ph-download-simple"></i>
          </button>
          <button class="action-btn" data-action="delete" data-type="file" data-id="${file.id}">
            <i class="ph ph-trash"></i>
          </button>
        </div>
      </div>
    `;
  },

  toggleSelection(type, id) {
    const key = `${type}-${id}`;
    if (this.selectedItems.has(key)) {
      this.selectedItems.delete(key);
    } else {
      this.selectedItems.add(key);
    }
    this.updateSelectionUI();
  },

  clearSelection() {
    this.selectedItems.clear();
    this.updateSelectionUI();
  },

  selectAll() {
    this.folders.forEach(f => this.selectedItems.add(`folder-${f.id}`));
    this.files.forEach(f => this.selectedItems.add(`file-${f.id}`));
    this.updateSelectionUI();
  },

  updateSelectionUI() {
    // Atualizar visual dos items
    document.querySelectorAll('.folder-item, .file-item, .file-list-item').forEach(el => {
      const type = el.classList.contains('folder-item') || (el.classList.contains('file-list-item') && el.querySelector('.ph-folder')) ? 'folder' : 'file';
      const id = el.dataset.id;
      const key = `${type}-${id}`;
      const isSelected = this.selectedItems.has(key);
      
      el.classList.toggle('selected', isSelected);
      const checkbox = el.querySelector('.item-checkbox, .file-list-checkbox');
      if (checkbox) {
        checkbox.classList.toggle('checked', isSelected);
      }
    });

    // Atualizar barra de seleção
    const selectionBar = document.getElementById('selection-bar');
    if (this.selectedItems.size > 0) {
      selectionBar.classList.add('show');
      document.getElementById('selection-count').textContent = 
        `${this.selectedItems.size} ${this.selectedItems.size === 1 ? 'item selecionado' : 'itens selecionados'}`;
    } else {
      selectionBar.classList.remove('show');
    }
  },

  updateDraggingState() {
    document.querySelectorAll('.folder-item, .file-item').forEach(el => {
      const type = el.classList.contains('folder-item') ? 'folder' : 'file';
      const id = el.dataset.id;
      const key = `${type}-${id}`;
      el.classList.toggle('dragging', this.draggedItems.has(key));
    });
  },

  async moveItemsToFolder(targetFolderId) {
    const items = Array.from(this.selectedItems);
    if (items.length === 0) return;

    try {
      Notificacao.show('Movendo itens...', 'info');
      
      for (const item of items) {
        const [type, id] = item.split('-');
        
        if (type === 'folder') {
          await window.driveAPI.moveFolder(id, targetFolderId);
        } else {
          await window.driveAPI.moveFile(id, targetFolderId);
        }
      }

      Notificacao.show('Itens movidos com sucesso!', 'success');
      this.clearSelection();
      await this.loadFolderContents();
    } catch (error) {
      console.error('[Drive] Erro ao mover itens:', error);
      Notificacao.show('Erro ao mover itens: ' + error.message, 'error');
    }
  },

  async deleteSelected() {
    const items = Array.from(this.selectedItems);
    if (items.length === 0) return;

    const msg = `Deseja excluir ${items.length} ${items.length === 1 ? 'item' : 'itens'}?\nEsta ação não pode ser desfeita.`;
    if (!confirm(msg)) return;

    try {
      Notificacao.show('Excluindo...', 'info');
      
      const filesToDelete = [];
      
      for (const item of items) {
        const [type, id] = item.split('-');
        
        if (type === 'folder') {
          const result = await window.driveAPI.deleteFolder(id);
          if (result.success && result.deletedFiles) {
            filesToDelete.push(...result.deletedFiles);
          }
        } else {
          const file = this.files.find(f => String(f.id) === String(id));
          if (file) {
            filesToDelete.push(file.path);
            await window.driveAPI.deleteFile(id);
          }
        }
      }

      // Excluir do R2
      if (filesToDelete.length > 0) {
        console.log('[Drive] Excluindo do R2:', filesToDelete);
        await window.r2API.deleteFiles(filesToDelete);
      }

      Notificacao.show('Excluído com sucesso!', 'success');
      this.clearSelection();
      await this.loadFolderContents();
    } catch (error) {
      console.error('[Drive] Erro ao excluir:', error);
      Notificacao.show('Erro ao excluir: ' + error.message, 'error');
    }
  },

  async downloadSelected() {
    const items = Array.from(this.selectedItems);
    const fileItems = items.filter(item => item.startsWith('file-'));
    
    if (fileItems.length === 0) {
      Notificacao.show('Selecione arquivos para baixar', 'warning');
      return;
    }

    Notificacao.show(`Baixando ${fileItems.length} arquivo(s)...`, 'info');

    for (const item of fileItems) {
      const id = item.split('-')[1];
      await this.downloadFile(id);
      await new Promise(resolve => setTimeout(resolve, 500)); // Delay entre downloads
    }

    Notificacao.show('Downloads concluídos!', 'success');
  },

  async downloadFile(fileId) {
    const file = this.files.find(f => String(f.id) === String(fileId));
    if (!file) return;

    try {
      // Extrair o nome do arquivo do path (último segmento)
      const fileName = file.path ? file.path.split('/').pop() : file.name;
      
      // Usar a URL pública diretamente
      const a = document.createElement('a');
      a.href = file.url_media;
      a.download = fileName; // Nome original do R2
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      console.log('[Drive] Download iniciado:', fileName);
    } catch (error) {
      console.error('[Drive] Erro ao baixar arquivo:', error);
      Notificacao.show('Erro ao baixar: ' + file.name, 'error');
    }
  },

  truncateName(name, max) {
    if (!name) return '';
    if (name.length <= max) return name;
    const ext = name.split('.').pop();
    return name.substring(0, max - ext.length - 4) + '...' + ext;
  },

  formatFileSize(kb) {
    if (!kb) return '';
    if (kb < 1024) return `${kb} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  },

  async navigateToFolder(folderId) {
    const folder = this.folders.find(f => String(f.id) === String(folderId));
    if (!folder) return;

    console.log('[Drive] Navegando para pasta:', folder.name);
    this.currentFolder = folder.id;
    this.breadcrumbPath.push({ id: folder.id, name: folder.name });
    await this.loadFolderContents();
  },

  previewFile(fileId) {
    const file = this.files.find(f => String(f.id) === String(fileId));
    if (!file) return;

    console.log('[Drive] Preview do arquivo:', file.name);
    const container = document.getElementById('preview-container');
    const info = document.getElementById('preview-info');

    if (file.file_type === 'video') {
      container.innerHTML = `<video src="${file.url_media}" controls autoplay></video>`;
    } else {
      container.innerHTML = `<img src="${file.url_media}" alt="${file.name}">`;
    }

    const details = [];
    if (file.dimensions) details.push(file.dimensions);
    if (file.duration) details.push(`${file.duration}s`);
    if (file.file_size_kb) details.push(this.formatFileSize(file.file_size_kb));
    if (file.data_de_captura) details.push(new Date(file.data_de_captura).toLocaleDateString('pt-BR'));

    info.innerHTML = `
      <h4>${file.name}</h4>
      <p>${details.join(' • ')}</p>
    `;

    document.getElementById('modal-preview').classList.add('show');
  },

  async createFolder() {
    const name = document.getElementById('folder-name').value.trim();
    if (!name) {
      Notificacao.show('Digite um nome para a pasta', 'warning');
      return;
    }

    try {
      console.log('[Drive] Criando pasta:', name);
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
      console.error('[Drive] Erro ao criar pasta:', error);
      Notificacao.show('Erro ao criar pasta: ' + error.message, 'error');
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

  extractCaptureDate(file) {
    if (file.lastModified) {
      return new Date(file.lastModified).toISOString();
    }
    return null;
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
      if (file.size > 500 * 1024 * 1024) {
        Notificacao.show(`Arquivo muito grande (max 500MB): ${file.name}`, 'warning');
        return;
      }
    }

    try {
      console.log(`[Drive] Iniciando upload de ${files.length} arquivo(s)`);
      Notificacao.showProgress(0, 0, files.length);

      const folderPath = this.currentFolder 
        ? `drive/client-${this.selectedClient.id}/folder-${this.currentFolder}`
        : `drive/client-${this.selectedClient.id}`;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const isVideo = file.type.startsWith('video/');
        const ext = file.name.split('.').pop().toLowerCase();
        const timestamp = Date.now();
        const fileName = `${folderPath}/${timestamp}-${i}.${ext}`;

        console.log(`[Drive] Upload ${i + 1}/${files.length}: ${file.name}`);
        Notificacao.showProgress(((i) / files.length) * 70, i + 1, files.length);

        let metadata = {};
        if (isVideo) {
          metadata = await this.extractVideoMetadata(file);
        } else {
          metadata = await this.extractImageMetadata(file);
        }
        
        const captureDate = this.extractCaptureDate(file);
        console.log('[Drive] Metadados extraídos:', metadata);

        const urlResult = await window.r2API.generateUploadUrl(fileName, file.type, file.size);
        if (!urlResult.success) throw new Error('Erro ao gerar URL: ' + urlResult.error);

        Notificacao.showProgress(((i + 0.3) / files.length) * 70, i + 1, files.length);
        await this.uploadToR2(file, urlResult.uploadUrl);

        Notificacao.showProgress(((i + 0.8) / files.length) * 70, i + 1, files.length);
        
        const saveResult = await window.driveAPI.saveFile({
          clientId: this.selectedClient.id,
          folderId: this.currentFolder,
          path: fileName,
          name: file.name,
          urlMedia: urlResult.publicUrl,
          urlThumbnail: null,
          fileType: isVideo ? 'video' : 'image',
          mimeType: file.type,
          fileSizeKb: Math.round(file.size / 1024),
          dimensions: metadata.dimensions || null,
          duration: metadata.duration || null,
          dataDeCaptura: captureDate
        });

        if (!saveResult.success) {
          console.error('[Drive] Erro ao salvar no banco:', saveResult.error);
        }
      }

      Notificacao.showProgress(100, files.length, files.length);
      
      setTimeout(() => {
        Notificacao.hideProgress();
        Notificacao.show(`${files.length} arquivo(s) enviado(s)!`, 'success');
      }, 500);
      
      await this.loadFolderContents();
      
    } catch (error) {
      console.error('[Drive] Erro no upload:', error);
      Notificacao.hideProgress();
      Notificacao.show('Erro no upload: ' + error.message, 'error');
    }
  },

  uploadToR2(file, uploadUrl) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percent = (e.loaded / e.total) * 100;
          console.log(`[Drive] Upload progress: ${percent.toFixed(1)}%`);
        }
      });
      
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          console.log('[Drive] Upload concluído com sucesso');
          resolve();
        } else {
          reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
        }
      });
      
      xhr.addEventListener('error', () => reject(new Error('Erro de rede no upload')));
      xhr.addEventListener('timeout', () => reject(new Error('Timeout no upload')));
      
      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.timeout = 300000;
      xhr.send(file);
    });
  },

  async confirmDelete(type, id) {
    const msg = type === 'folder' 
      ? 'Excluir esta pasta e todo seu conteúdo?' 
      : 'Excluir este arquivo?';
    
    if (!confirm(msg)) return;

    try {
      console.log(`[Drive] Excluindo ${type}: ${id}`);
      Notificacao.show('Excluindo...', 'info');
      
      let filesToDelete = [];
      
      if (type === 'folder') {
        const result = await window.driveAPI.deleteFolder(id);
        if (!result.success) throw new Error(result.error);
        if (result.deletedFiles) {
          filesToDelete = result.deletedFiles;
        }
      } else {
        const file = this.files.find(f => String(f.id) === String(id));
        if (file) {
          filesToDelete.push(file.path);
        }
        const result = await window.driveAPI.deleteFile(id);
        if (!result.success) throw new Error(result.error);
      }

      // Excluir do R2
      if (filesToDelete.length > 0) {
        console.log('[Drive] Excluindo do R2:', filesToDelete);
        await window.r2API.deleteFiles(filesToDelete);
      }

      Notificacao.show('Excluído com sucesso!', 'success');
      await this.loadFolderContents();
    } catch (error) {
      console.error('[Drive] Erro ao excluir:', error);
      Notificacao.show('Erro ao excluir: ' + error.message, 'error');
    }
  }
};

// Sobrescrever showCorrectScreen
Auth.showCorrectScreen = function() {
  const loginScreen = document.getElementById('login-screen');
  const driveSystem = document.getElementById('drive-system');
  
  if (!loginScreen || !driveSystem) {
    console.error('[Auth] Elementos de tela não encontrados');
    return false;
  }
  
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