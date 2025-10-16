const Renderer = {
  clients: [],
  selectedClient: null,
  mediaFiles: [],
  postType: '',

  async loadClients() {
    try {
      const { data, error } = await supabase
        .from('client')
        .select('*')
        .order('users', { ascending: true });

      if (error) throw error;

      this.clients = data || [];
      this.renderClientSelect();
      console.log('[Renderer] Clientes carregados:', this.clients.length);
    } catch (error) {
      console.error('[Renderer] Erro ao carregar clientes:', error);
      Notificacao.show('Erro ao carregar clientes', 'error');
    }
  },

  renderClientSelect() {
    const select = document.getElementById('client-select');
    if (!select) return;

    if (this.clients.length === 0) {
      select.innerHTML = '<option value="">Nenhum cliente encontrado</option>';
      return;
    }

    select.innerHTML = `
      <option value="">Selecione um cliente...</option>
      ${this.clients.map(client => 
        `<option value="${client.id}">@${client.users}</option>`
      ).join('')}
    `;
  },

  async selectClient(clientId) {
    if (!clientId) {
      document.getElementById('client-preview').classList.remove('show');
      this.selectedClient = null;
      return;
    }

    try {
      const { data, error } = await supabase
        .from('client')
        .select('*')
        .eq('id', clientId)
        .single();

      if (error) throw error;

      this.selectedClient = data;
      this.updateClientPreview();
    } catch (error) {
      console.error('[Renderer] Erro ao buscar cliente:', error);
      Notificacao.show('Erro ao carregar dados do cliente', 'error');
    }
  },

  updateClientPreview() {
    const preview = document.getElementById('client-preview');
    const avatar = document.getElementById('client-avatar');
    const name = document.getElementById('client-name');
    const instagram = document.getElementById('client-instagram');

    if (preview && avatar && name && instagram && this.selectedClient) {
      avatar.src = this.selectedClient.profile_photo || 'https://via.placeholder.com/60';
      name.textContent = `@${this.selectedClient.users}`;
      instagram.textContent = this.selectedClient.id_instagram || 'N/A';
      preview.classList.add('show');
    }
  },

  selectPostType(type) {
    this.postType = type;
    document.querySelectorAll('.post-type').forEach(el => {
      el.classList.remove('selected');
    });
    event.target.closest('.post-type').classList.add('selected');

    const fileInput = document.getElementById('media-files');
    fileInput.multiple = (type === 'carousel');

    if (type !== 'carousel' && this.mediaFiles.length > 1) {
      this.mediaFiles = [this.mediaFiles[0]];
      this.updateMediaPreview();
    }
  },

  handleFileUpload(files) {
    const fileArray = Array.from(files);

    if (this.postType !== 'carousel' && fileArray.length > 1) {
      Notificacao.show('Este tipo de postagem aceita apenas 1 arquivo', 'warning');
      return;
    }

    if (this.postType !== 'carousel' && this.mediaFiles.length > 0) {
      this.mediaFiles.forEach(media => {
        if (media.url && media.url.startsWith('blob:')) {
          URL.revokeObjectURL(media.url);
        }
      });
      this.mediaFiles = [];
    }

    const startOrder = this.mediaFiles.length;

    fileArray.forEach((file, index) => {
      const mediaId = Date.now() + index;
      const mediaItem = {
        file: file,
        id: mediaId,
        type: file.type.startsWith('image/') ? 'image' : 'video',
        url: URL.createObjectURL(file),
        order: startOrder + index + 1,
        name: file.name,
        size: (file.size / (1024 * 1024)).toFixed(2) + ' MB'
      };

      this.mediaFiles.push(mediaItem);
    });

    if (this.mediaFiles.length > 1 && this.postType !== 'carousel') {
      this.postType = 'carousel';
      document.querySelectorAll('.post-type').forEach(el => el.classList.remove('selected'));
      document.querySelector('.post-type[data-type="carousel"]')?.classList.add('selected');
    }

    this.updateMediaPreview();
  },

  updateMediaPreview() {
    const preview = document.getElementById('media-preview-post');
    const list = document.getElementById('media-list');

    if (!preview || !list) return;

    if (this.mediaFiles.length === 0) {
      preview.classList.remove('show');
      return;
    }

    preview.classList.add('show');

    list.innerHTML = this.mediaFiles.map(media => `
      <div class="media-item" data-id="${media.id}">
        <div class="media-content">
          ${media.type === 'image' 
            ? `<img src="${media.url}" alt="Preview">` 
            : `<video src="${media.url}" preload="metadata"></video>`
          }
          <div class="media-overlay">
            <span class="order-badge">#${media.order}</span>
            <div class="media-controls">
              <button class="remove-media-btn" data-id="${media.id}" title="Remover arquivo">
                <i class="ph ph-trash"></i>
              </button>
            </div>
          </div>
        </div>
        <div class="media-info">
          <div class="media-name">${this.truncateFileName(media.name)}</div>
          <div class="media-size">${media.size}</div>
        </div>
      </div>
    `).join('');
  },

  removeMediaFile(id) {
    const mediaToRemove = this.mediaFiles.find(item => item.id === id);
    if (mediaToRemove && mediaToRemove.url && mediaToRemove.url.startsWith('blob:')) {
      URL.revokeObjectURL(mediaToRemove.url);
    }

    this.mediaFiles = this.mediaFiles.filter(item => item.id !== id);
    this.mediaFiles.forEach((item, index) => {
      item.order = index + 1;
    });

    this.updateMediaPreview();

    if (this.mediaFiles.length <= 1 && this.postType === 'carousel') {
      document.querySelectorAll('.post-type').forEach(el => el.classList.remove('selected'));
      this.postType = '';
    }
  },

  truncateFileName(fileName, maxLength = 25) {
    if (fileName.length <= maxLength) return fileName;
    const extension = fileName.split('.').pop();
    const name = fileName.substring(0, fileName.lastIndexOf('.'));
    const truncated = name.substring(0, maxLength - extension.length - 4) + '...';
    return truncated + '.' + extension;
  },

  resetForm() {
    this.mediaFiles.forEach(media => {
      if (media.url && media.url.startsWith('blob:')) {
        URL.revokeObjectURL(media.url);
      }
    });

    this.selectedClient = null;
    this.mediaFiles = [];
    this.postType = '';

    document.getElementById('client-select').value = '';
    document.getElementById('client-preview').classList.remove('show');
    document.querySelectorAll('.post-type').forEach(el => el.classList.remove('selected'));
    document.getElementById('media-preview-post').classList.remove('show');
    document.getElementById('caption').value = '';
    document.getElementById('schedule-datetime').value = '';
    document.getElementById('caption-counter').textContent = '0 / 2200 caracteres';
  }
};