const Designer = {
  currentTab: 'pending',
  currentRequest: null,
  pendingRequests: [],
  approvedRequests: [],
  uploadFiles: [],
  
  async init() {
    // Background animado
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

    // Auto-login
    const autoLoginResult = await Auth.autoLogin();
    if (autoLoginResult.success) {
      Auth.showCorrectScreen();
      await this.loadPendingRequests();
      this.populateYearFilter();
      Notificacao.show('Bem-vindo ao Designer!', 'success');
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
        await this.loadPendingRequests();
        this.populateYearFilter();
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

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.currentTarget.dataset.tab;
        this.switchTab(tab);
      });
    });

    // Filtros aprovados
    document.getElementById('month-filter').addEventListener('change', () => this.loadApprovedRequests());
    document.getElementById('year-filter').addEventListener('change', () => this.loadApprovedRequests());

    // Modal detalhes
    document.getElementById('modal-close-details').addEventListener('click', () => {
      document.getElementById('modal-request-details').classList.remove('show');
    });

    // Modal upload
    document.getElementById('modal-close-upload').addEventListener('click', () => {
      document.getElementById('modal-upload').classList.remove('show');
      this.uploadFiles = [];
      document.getElementById('upload-preview').innerHTML = '';
    });

    document.getElementById('btn-cancel-upload').addEventListener('click', () => {
      document.getElementById('modal-upload').classList.remove('show');
      this.uploadFiles = [];
      document.getElementById('upload-preview').innerHTML = '';
    });

    document.getElementById('btn-confirm-upload').addEventListener('click', () => {
      this.uploadMediaFiles();
    });

    // Upload area
    const uploadArea = document.getElementById('upload-area');
    const uploadInput = document.getElementById('upload-input');

    uploadArea.addEventListener('click', () => uploadInput.click());
    
    uploadInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.handleFileUpload(Array.from(e.target.files));
        e.target.value = '';
      }
    });

    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        this.handleFileUpload(Array.from(e.dataTransfer.files));
      }
    });

    // Modal preview mídia
    document.getElementById('modal-close-media-preview').addEventListener('click', () => {
      document.getElementById('modal-media-preview').classList.remove('show');
      document.getElementById('preview-media-container').innerHTML = '';
    });

    // ESC para fechar modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.show').forEach(modal => {
          modal.classList.remove('show');
        });
      }
    });
  },

  switchTab(tab) {
    this.currentTab = tab;

    // Atualizar botões
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    // Atualizar conteúdo
    document.querySelectorAll('.tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `tab-${tab}`);
    });

    // Carregar dados
    if (tab === 'pending') {
      this.loadPendingRequests();
    } else {
      this.loadApprovedRequests();
    }
  },

  async loadPendingRequests() {
    try {
      const listElement = document.getElementById('pending-list');
      listElement.innerHTML = '<div class="loading-state"><i class="ph ph-spinner"></i><p>Carregando...</p></div>';

      const result = await window.designerAPI.getPendingRequests();
      
      if (!result.success) throw new Error(result.error);

      this.pendingRequests = result.data || [];
      
      // Atualizar badge
      document.getElementById('pending-count').textContent = this.pendingRequests.length;

      this.renderPendingList();
    } catch (error) {
      console.error('[Designer] Erro:', error);
      document.getElementById('pending-list').innerHTML = `
        <div class="empty-state">
          <i class="ph ph-warning"></i>
          <p>Erro ao carregar solicitações</p>
        </div>
      `;
    }
  },

  async loadApprovedRequests() {
    try {
      const listElement = document.getElementById('approved-list');
      listElement.innerHTML = '<div class="loading-state"><i class="ph ph-spinner"></i><p>Carregando...</p></div>';

      const month = document.getElementById('month-filter').value;
      const year = document.getElementById('year-filter').value;

      const result = await window.designerAPI.getApprovedRequests(month, year);
      
      if (!result.success) throw new Error(result.error);

      this.approvedRequests = result.data || [];

      this.renderApprovedList();
    } catch (error) {
      console.error('[Designer] Erro:', error);
      document.getElementById('approved-list').innerHTML = `
        <div class="empty-state">
          <i class="ph ph-warning"></i>
          <p>Erro ao carregar solicitações</p>
        </div>
      `;
    }
  },

  renderPendingList() {
    const listElement = document.getElementById('pending-list');

    if (this.pendingRequests.length === 0) {
      listElement.innerHTML = `
        <div class="empty-state">
          <i class="ph ph-check-circle"></i>
          <p>Nenhuma solicitação pendente</p>
        </div>
      `;
      return;
    }

    listElement.innerHTML = this.pendingRequests.map(req => this.renderRequestCard(req)).join('');

    // Event listeners
    listElement.querySelectorAll('.request-card').forEach(card => {
      card.addEventListener('click', () => {
        const requestId = card.dataset.id;
        this.openRequestDetails(requestId);
      });
    });
  },

  renderApprovedList() {
    const listElement = document.getElementById('approved-list');

    if (this.approvedRequests.length === 0) {
      listElement.innerHTML = `
        <div class="empty-state">
          <i class="ph ph-magnifying-glass"></i>
          <p>Nenhuma solicitação aprovada</p>
        </div>
      `;
      return;
    }

    listElement.innerHTML = this.approvedRequests.map(req => this.renderRequestCard(req)).join('');

    // Event listeners
    listElement.querySelectorAll('.request-card').forEach(card => {
      card.addEventListener('click', () => {
        const requestId = card.dataset.id;
        this.openRequestDetails(requestId);
      });
    });
  },

  renderRequestCard(request) {
    const statusClass = request.status.toLowerCase().replace('_', '-');
    const statusLabel = {
      'PENDENTE': 'Pendente',
      'RECUSADO': 'Recusado',
      'APROVADO': 'Aprovado',
      'EM_ANDAMENTO': 'Em Andamento'
    }[request.status] || request.status;

    const date = new Date(request.created_at);
    const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

    return `
      <div class="request-card ${statusClass}" data-id="${request.id}">
        <div class="request-card-header">
          <img src="${request.client?.profile_photo || 'https://via.placeholder.com/40'}" class="request-avatar" alt="${request.client?.users}">
          <div class="request-info">
            <div class="request-client">@${request.client?.users}</div>
            <div class="request-date">${dateStr}</div>
          </div>
          <span class="request-status status-${statusClass}">${statusLabel}</span>
        </div>
        <div class="request-card-body">
          <div class="request-theme">${request.tema || 'Sem tema'}</div>
          ${request.description ? `<div class="request-description">${request.description}</div>` : ''}
          <div class="request-meta">
            <span><i class="ph ph-image"></i> ${request.type_media || 'N/A'}</span>
            <span><i class="ph ph-arrows-out"></i> ${request.dimension || 'N/A'}</span>
          </div>
        </div>
      </div>
    `;
  },

  async openRequestDetails(requestId) {
    try {
      Notificacao.show('Carregando detalhes...', 'info');

      const result = await window.designerAPI.getRequestDetails(requestId);
      
      if (!result.success) throw new Error(result.error);

      this.currentRequest = result;

      this.renderRequestDetails();
      
      document.getElementById('modal-request-details').classList.add('show');
    } catch (error) {
      console.error('[Designer] Erro:', error);
      Notificacao.show('Erro ao carregar detalhes', 'error');
    }
  },

  renderRequestDetails() {
    const { request, medias, messages } = this.currentRequest;
    
    const statusClass = request.status.toLowerCase().replace('_', '-');
    const statusLabel = {
      'PENDENTE': 'Pendente',
      'RECUSADO': 'Recusado',
      'APROVADO': 'Aprovado',
      'EM_ANDAMENTO': 'Em Andamento'
    }[request.status] || request.status;

    const date = new Date(request.created_at);
    const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const canUpload = request.status === 'PENDENTE' || request.status === 'RECUSADO';

    const detailsHTML = `
      <div class="request-details">
        <!-- Informações do Cliente -->
        <div class="details-section">
          <div class="section-header">
            <i class="ph ph-user"></i>
            <h4>Cliente</h4>
          </div>
          <div class="client-details">
            <img src="${request.client?.profile_photo || 'https://via.placeholder.com/60'}" class="client-details-avatar" alt="${request.client?.users}">
            <div>
              <div class="client-details-name">@${request.client?.users}</div>
              ${request.client?.id_instagram ? `<div class="client-details-meta">${request.client.id_instagram}</div>` : ''}
            </div>
          </div>
        </div>

        <!-- Detalhes da Solicitação -->
        <div class="details-section">
          <div class="section-header">
            <i class="ph ph-file-text"></i>
            <h4>Detalhes</h4>
            <span class="request-status status-${statusClass}">${statusLabel}</span>
          </div>
          <div class="details-grid">
            <div class="detail-item">
              <span class="detail-label">Tema:</span>
              <span class="detail-value">${request.tema || 'Não especificado'}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Tipo:</span>
              <span class="detail-value">${request.type_media || 'N/A'}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Dimensão:</span>
              <span class="detail-value">${request.dimension || 'N/A'}</span>
            </div>
            <div class="detail-item">
              <span class="detail-label">Data:</span>
              <span class="detail-value">${dateStr}</span>
            </div>
            ${request.nota ? `
            <div class="detail-item full-width">
              <span class="detail-label">Nota:</span>
              <span class="detail-value">${request.nota}</span>
            </div>
            ` : ''}
            ${request.description ? `
            <div class="detail-item full-width">
              <span class="detail-label">Descrição:</span>
              <span class="detail-value">${request.description}</span>
            </div>
            ` : ''}
          </div>
        </div>

        <!-- Mídias Enviadas -->
        ${medias.length > 0 ? `
        <div class="details-section">
          <div class="section-header">
            <i class="ph ph-images"></i>
            <h4>Mídias Enviadas (${medias.length})</h4>
          </div>
          <div class="medias-grid">
            ${medias.map(media => this.renderMediaThumb(media)).join('')}
          </div>
        </div>
        ` : ''}

        <!-- Mensagens -->
        ${messages.length > 0 ? `
        <div class="details-section">
          <div class="section-header">
            <i class="ph ph-chat-circle-text"></i>
            <h4>Mensagens (${messages.length})</h4>
          </div>
          <div class="messages-list">
            ${messages.map(msg => this.renderMessage(msg)).join('')}
          </div>
        </div>
        ` : ''}

        <!-- Ações -->
        ${canUpload ? `
        <div class="details-actions">
          <button class="btn btn-primary btn-upload-media" onclick="Designer.openUploadModal()">
            <i class="ph ph-upload"></i> Enviar Mídias
          </button>
        </div>
        ` : ''}
      </div>
    `;

    document.getElementById('request-details-body').innerHTML = detailsHTML;

    // Event listeners para mídias
    document.querySelectorAll('.media-thumb').forEach(thumb => {
      thumb.addEventListener('click', () => {
        const mediaUrl = thumb.dataset.url;
        const mediaType = thumb.dataset.type;
        this.previewMedia(mediaUrl, mediaType);
      });
    });
  },

  renderMediaThumb(media) {
    const isVideo = media.url_media.includes('.mp4') || media.url_media.includes('.mov');
    const type = isVideo ? 'video' : 'image';
    
    return `
      <div class="media-thumb" data-url="${media.url_media}" data-type="${type}">
        ${isVideo ? `
          <video src="${media.url_media}" preload="metadata"></video>
          <div class="media-thumb-overlay"><i class="ph ph-play-circle"></i></div>
        ` : `
          <img src="${media.url_media}" alt="Mídia">
        `}
      </div>
    `;
  },

  renderMessage(message) {
    const isAdmin = message.admin_or_users === 'admin';
    const date = new Date(message.created_at);
    const dateStr = date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

    if (message.type === 'media') {
      const isVideo = message.url_ou_text.includes('.mp4') || message.url_ou_text.includes('.mov');
      return `
        <div class="message ${isAdmin ? 'message-admin' : 'message-user'}">
          <div class="message-header">
            <span class="message-author">${isAdmin ? 'Admin' : 'Designer'}</span>
            <span class="message-time">${dateStr}</span>
          </div>
          <div class="message-media" onclick="Designer.previewMedia('${message.url_ou_text}', '${isVideo ? 'video' : 'image'}')">
            ${isVideo ? `
              <video src="${message.url_ou_text}" preload="metadata"></video>
              <i class="ph ph-play-circle"></i>
            ` : `
              <img src="${message.url_ou_text}" alt="Mídia">
            `}
          </div>
        </div>
      `;
    } else {
      return `
        <div class="message ${isAdmin ? 'message-admin' : 'message-user'}">
          <div class="message-header">
            <span class="message-author">${isAdmin ? 'Admin' : 'Designer'}</span>
            <span class="message-time">${dateStr}</span>
          </div>
          <div class="message-text">${message.url_ou_text}</div>
        </div>
      `;
    }
  },

  previewMedia(url, type) {
    const container = document.getElementById('preview-media-container');
    
    if (type === 'video') {
      container.innerHTML = `<video src="${url}" controls autoplay></video>`;
    } else {
      container.innerHTML = `<img src="${url}" alt="Preview">`;
    }

    document.getElementById('modal-media-preview').classList.add('show');
  },

  openUploadModal() {
    this.uploadFiles = [];
    document.getElementById('upload-preview').innerHTML = '';
    document.getElementById('modal-upload').classList.add('show');
  },

  handleFileUpload(files) {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime'];
    
    for (const file of files) {
      if (!allowedTypes.includes(file.type)) {
        Notificacao.show(`Tipo não permitido: ${file.name}`, 'warning');
        continue;
      }
      if (file.size > 500 * 1024 * 1024) {
        Notificacao.show(`Arquivo muito grande: ${file.name}`, 'warning');
        continue;
      }

      this.uploadFiles.push(file);
    }

    this.renderUploadPreview();
  },

  renderUploadPreview() {
    const preview = document.getElementById('upload-preview');
    
    if (this.uploadFiles.length === 0) {
      preview.innerHTML = '';
      return;
    }

    preview.innerHTML = `
      <div class="upload-preview-header">
        <span>${this.uploadFiles.length} arquivo(s) selecionado(s)</span>
        <button class="btn-clear-upload" onclick="Designer.clearUploadFiles()">
          <i class="ph ph-x"></i> Limpar
        </button>
      </div>
      <div class="upload-preview-grid">
        ${this.uploadFiles.map((file, index) => this.renderUploadThumb(file, index)).join('')}
      </div>
    `;
  },

  renderUploadThumb(file, index) {
    const url = URL.createObjectURL(file);
    const isVideo = file.type.startsWith('video/');
    
    return `
      <div class="upload-thumb" data-index="${index}">
        ${isVideo ? `
          <video src="${url}" preload="metadata"></video>
          <div class="upload-thumb-overlay"><i class="ph ph-play-circle"></i></div>
        ` : `
          <img src="${url}" alt="${file.name}">
        `}
        <button class="btn-remove-upload" onclick="Designer.removeUploadFile(${index})">
          <i class="ph ph-trash"></i>
        </button>
        <div class="upload-thumb-name">${file.name}</div>
      </div>
    `;
  },

  removeUploadFile(index) {
    this.uploadFiles.splice(index, 1);
    this.renderUploadPreview();
  },

  clearUploadFiles() {
    this.uploadFiles = [];
    this.renderUploadPreview();
  },

  async uploadMediaFiles() {
    if (this.uploadFiles.length === 0) {
      Notificacao.show('Selecione arquivos para enviar', 'warning');
      return;
    }

    try {
      const requestId = this.currentRequest.request.id;
      const folderPath = `designer/request-${requestId}`;

      Notificacao.show('Enviando arquivos...', 'info');

      // Upload para R2
      const uploadedUrls = [];
      
      for (let i = 0; i < this.uploadFiles.length; i++) {
        const file = this.uploadFiles[i];
        const ext = file.name.split('.').pop();
        const fileName = `${folderPath}/${Date.now()}-${i}.${ext}`;

        // Gerar URL
        const urlResult = await window.r2API.generateUploadUrl(fileName, file.type, file.size);
        if (!urlResult.success) throw new Error('Erro ao gerar URL');

        // Upload
        await this.uploadToR2(file, urlResult.uploadUrl);
        uploadedUrls.push(urlResult.publicUrl);

        Notificacao.show(`Enviando ${i + 1} de ${this.uploadFiles.length}...`, 'info');
      }

      // Salvar no banco
      const result = await window.designerAPI.uploadMedia(requestId, uploadedUrls);
      
      if (!result.success) throw new Error(result.error);

      Notificacao.show('Mídias enviadas com sucesso!', 'success');
      
      // Fechar modal e recarregar
      document.getElementById('modal-upload').classList.remove('show');
      this.uploadFiles = [];
      
      await this.openRequestDetails(requestId);
      await this.loadPendingRequests();

    } catch (error) {
      console.error('[Designer] Erro no upload:', error);
      Notificacao.show('Erro ao enviar mídias: ' + error.message, 'error');
    }
  },

  uploadToR2(file, uploadUrl) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload falhou: ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Erro de rede')));
      xhr.addEventListener('timeout', () => reject(new Error('Timeout')));

      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.timeout = 300000;
      xhr.send(file);
    });
  },

  populateYearFilter() {
    const yearFilter = document.getElementById('year-filter');
    const currentYear = new Date().getFullYear();
    
    for (let year = currentYear; year >= currentYear - 5; year--) {
      const option = document.createElement('option');
      option.value = year;
      option.textContent = year;
      yearFilter.appendChild(option);
    }
  }
};

// Sobrescrever showCorrectScreen do Auth
Auth.showCorrectScreen = function() {
  const loginScreen = document.getElementById('login-screen');
  const designerSystem = document.getElementById('designer-system');
  
  if (!loginScreen || !designerSystem) return false;
  
  if (this.isAuthenticated()) {
    loginScreen.style.display = 'none';
    designerSystem.classList.add('active');
    return true;
  } else {
    loginScreen.style.display = 'block';
    designerSystem.classList.remove('active');
    return false;
  }
};

document.addEventListener('DOMContentLoaded', () => Designer.init());
