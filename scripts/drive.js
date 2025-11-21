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
    
    // Enter para criar pasta
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

      if (folderItem && !e.target.closest('.action-btn')) {
        const folderId = folderItem.dataset.id;
        this.navigateToFolder(folderId);
      }

      if (fileItem && !e.target.closest('.action-btn')) {
        const fileId = fileItem.dataset.id;
        this.previewFile(fileId);
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
      
      this.renderBreadcrumb();
      this.renderContents();
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
                    ? `<video src="${f.url_media}" preload="metadata"></video>`
                    : `<img src="${f.url_media}" alt="${f.name}">`
                  }
                  <span class="file-type-badge">${f.file_type === 'video' ? 'VÍD' : 'IMG'}</span>
                </div>
                <div class="file-name" title="${f.name}">${this.truncateName(f.name, 18)}</div>
                <div class="file-meta">${this.formatFileSize(f.file_size_kb)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    content.innerHTML = html;
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

  // Extrair metadados de imagem
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

  // Extrair metadados de vídeo
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

  // Extrair data de captura do EXIF (se disponível)
  extractCaptureDate(file) {
    // A data de modificação do arquivo é a melhor aproximação disponível no browser
    // Para EXIF real, precisaria de uma biblioteca como exif-js
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

        // Extrair metadados
        let metadata = {};
        if (isVideo) {
          metadata = await this.extractVideoMetadata(file);
        } else {
          metadata = await this.extractImageMetadata(file);
        }
        
        const captureDate = this.extractCaptureDate(file);
        console.log('[Drive] Metadados extraídos:', metadata);

        // Gerar URL de upload
        const urlResult = await window.r2API.generateUploadUrl(fileName, file.type, file.size);
        if (!urlResult.success) throw new Error('Erro ao gerar URL: ' + urlResult.error);

        // Upload para R2
        Notificacao.showProgress(((i + 0.3) / files.length) * 70, i + 1, files.length);
        await this.uploadToR2(file, urlResult.uploadUrl);

        // Salvar no banco com todos os metadados
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
      xhr.timeout = 300000; // 5 minutos
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
      
      const result = type === 'folder' 
        ? await window.driveAPI.deleteFolder(id)
        : await window.driveAPI.deleteFile(id);

      if (!result.success) throw new Error(result.error);

      Notificacao.show('Excluído com sucesso!', 'success');
      await this.loadFolderContents();
    } catch (error) {
      console.error('[Drive] Erro ao excluir:', error);
      Notificacao.show('Erro ao excluir: ' + error.message, 'error');
    }
  }
};

// Sobrescrever showCorrectScreen para funcionar na página do Drive
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

// Inicializar quando DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => Drive.init());