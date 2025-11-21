const Drive = {
  clients: [],
  selectedClient: null,
  currentFolder: null,
  folders: [],
  files: [],
  breadcrumbPath: [],

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

    // Preview modal
    document.getElementById('modal-close-preview').addEventListener('click', () => {
      document.getElementById('modal-preview').classList.remove('show');
    });

    // Drag and drop
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

    // Clicks em pastas/arquivos
    document.addEventListener('click', (e) => {
      const folderItem = e.target.closest('.folder-item');
      const fileItem = e.target.closest('.file-item');
      const deleteBtn = e.target.closest('.action-btn[data-action="delete"]');

      if (deleteBtn) {
        e.stopPropagation();
        const type = deleteBtn.dataset.type;
        const id = deleteBtn.dataset.id;
        this.confirmDelete(type, id);
        return;
      }

      if (folderItem) {
        const folderId = folderItem.dataset.id;
        this.navigateToFolder(folderId);
      }

      if (fileItem) {
        const fileId = fileItem.dataset.id;
        this.previewFile(fileId);
      }
    });
  },

  async loadClients() {
    try {
      const result = await window.supabaseAPI.getClients();
      if (!result.success) throw new Error(result.error);
      this.clients = result.data || [];
      this.renderClientList();
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
    document.querySelectorAll('.client-item').forEach(el => el.classList.remove('active'));
    document.querySelector(`.client-item[data-id="${clientId}"]`)?.classList.add('active');

    this.selectedClient = this.clients.find(c => String(c.id) === String(clientId));
    this.currentFolder = null;
    this.breadcrumbPath = [{ id: null, name: `@${this.selectedClient.users}` }];

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
      this.renderBreadcrumb();
      this.renderContents();
    } catch (error) {
      console.error('[Drive] Erro:', error);
      Notificacao.show('Erro ao carregar conteúdo', 'error');
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

  renderContents() {
    const content = document.getElementById('drive-content');
    
    if (this.folders.length === 0 && this.files.length === 0) {
      content.innerHTML = `
        <div class="empty-state">
          <i class="ph ph-folder-open"></i>
          <p>Pasta vazia</p>
        </div>
      `;
      return;
    }

    let html = '';

    if (this.folders.length > 0) {
      html += `
        <div class="folders-section">
          <div class="section-title">Pastas (${this.folders.length})</div>
          <div class="folders-grid">
            ${this.folders.map(f => `
              <div class="folder-item" data-id="${f.id}">
                <div class="item-actions">
                  <button class="action-btn" data-action="delete" data-type="folder" data-id="${f.id}">
                    <i class="ph ph-trash"></i>
                  </button>
                </div>
                <i class="ph-fill ph-folder"></i>
                <div class="folder-name" title="${f.name}">${f.name}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    if (this.files.length > 0) {
      html += `
        <div class="files-section">
          <div class="section-title">Arquivos (${this.files.length})</div>
          <div class="files-grid">
            ${this.files.map(f => `
              <div class="file-item" data-id="${f.id}">
                <div class="item-actions">
                  <button class="action-btn" data-action="delete" data-type="file" data-id="${f.id}">
                    <i class="ph ph-trash"></i>
                  </button>
                </div>
                <div class="file-thumbnail">
                  ${f.file_type === 'video' 
                    ? `<video src="${f.url_thumbnail || f.url_media}" preload="metadata"></video>`
                    : `<img src="${f.url_thumbnail || f.url_media}" alt="${f.name}">`
                  }
                  <span class="file-type-badge">${f.file_type === 'video' ? 'VID' : 'IMG'}</span>
                </div>
                <div class="file-name" title="${f.name}">${this.truncateName(f.name, 18)}</div>
                <div class="file-meta">${f.file_size_kb ? (f.file_size_kb / 1024).toFixed(1) + ' MB' : ''}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    content.innerHTML = html;
  },

  truncateName(name, max) {
    if (name.length <= max) return name;
    const ext = name.split('.').pop();
    return name.substring(0, max - ext.length - 4) + '...' + ext;
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
      container.innerHTML = `<video src="${file.url_media}" controls autoplay></video>`;
    } else {
      container.innerHTML = `<img src="${file.url_media}" alt="${file.name}">`;
    }

    info.innerHTML = `
      <h4>${file.name}</h4>
      <p>${file.dimensions || ''} ${file.duration ? '• ' + file.duration + 's' : ''} • ${file.file_size_kb ? (file.file_size_kb / 1024).toFixed(2) + ' MB' : ''}</p>
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
      Notificacao.show('Erro ao criar pasta', 'error');
    }
  },

  async uploadFiles(files) {
    if (!this.selectedClient) {
      Notificacao.show('Selecione um cliente primeiro', 'warning');
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime'];
    for (const file of files) {
      if (!allowedTypes.includes(file.type)) {
        Notificacao.show(`Tipo não permitido: ${file.name}`, 'warning');
        return;
      }
    }

    try {
      Notificacao.showProgress(0, 0, files.length);
      const folder = `drive/${this.selectedClient.id}${this.currentFolder ? '/' + this.currentFolder : ''}`;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = file.name.split('.').pop().toLowerCase();
        const fileName = `${folder}/${Date.now()}-${i}.${ext}`;

        Notificacao.showProgress((i / files.length) * 80, i + 1, files.length);

        const urlResult = await window.r2API.generateUploadUrl(fileName, file.type, file.size);
        if (!urlResult.success) throw new Error(urlResult.error);

        await this.uploadToR2(file, urlResult.uploadUrl);

        await window.driveAPI.saveFile({
          clientId: this.selectedClient.id,
          folderId: this.currentFolder,
          path: fileName,
          name: file.name,
          urlMedia: urlResult.publicUrl,
          fileType: file.type.startsWith('image/') ? 'image' : 'video',
          mimeType: file.type,
          fileSizeKb: Math.round(file.size / 1024)
        });
      }

      Notificacao.showProgress(100, files.length, files.length);
      setTimeout(() => Notificacao.hideProgress(), 1500);
      Notificacao.show(`${files.length} arquivo(s) enviado(s)!`, 'success');
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
      xhr.addEventListener('load', () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`)));
      xhr.addEventListener('error', () => reject(new Error('Erro de rede')));
      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.send(file);
    });
  },

  async confirmDelete(type, id) {
    const msg = type === 'folder' ? 'Excluir esta pasta e todo seu conteúdo?' : 'Excluir este arquivo?';
    if (!confirm(msg)) return;

    try {
      Notificacao.show('Excluindo...', 'info');
      const result = type === 'folder' 
        ? await window.driveAPI.deleteFolder(id)
        : await window.driveAPI.deleteFile(id);

      if (!result.success) throw new Error(result.error);

      Notificacao.show('Excluído!', 'success');
      await this.loadFolderContents();
    } catch (error) {
      console.error('[Drive] Erro ao excluir:', error);
      Notificacao.show('Erro ao excluir', 'error');
    }
  }
};

// Ajustar showCorrectScreen para Drive
Auth.showCorrectScreen = function() {
  const loginScreen = document.getElementById('login-screen');
  const driveSystem = document.getElementById('drive-system');
  if (this.isAuthenticated()) {
    loginScreen.style.display = 'none';
    driveSystem.classList.add('active');
  } else {
    loginScreen.style.display = 'block';
    driveSystem.classList.remove('active');
  }
};

document.addEventListener('DOMContentLoaded', () => Drive.init());