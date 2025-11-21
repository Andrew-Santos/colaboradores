// Configuração da API
const CONFIG = {
  API_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : window.location.origin, // Em produção usa a origem atual
  R2_API_URL: 'https://portal.teamcriativa.com/api/cloudflare'
};

console.log('[Config] API URL:', CONFIG.API_URL);
console.log('[Config] R2 API URL:', CONFIG.R2_API_URL);

// ==================== SUPABASE API ====================
window.supabaseAPI = {
  async login(email, password) {
    try {
      const response = await fetch(`${CONFIG.API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async logout() {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${CONFIG.API_URL}/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async verifyToken() {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${CONFIG.API_URL}/auth/verify`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async getClients() {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${CONFIG.API_URL}/api/clients`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async schedulePost(postData) {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${CONFIG.API_URL}/api/schedule-post`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(postData)
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async saveMedia(postId, mediaFiles) {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${CONFIG.API_URL}/api/save-media`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, mediaFiles })
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

// ==================== DRIVE API ====================
window.driveAPI = {
  async getFolderContents(clientId, folderId = null) {
    try {
      const token = localStorage.getItem('auth_token');
      let url = `${CONFIG.API_URL}/api/drive/contents?clientId=${clientId}`;
      if (folderId) url += `&folderId=${folderId}`;

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return await response.json();
    } catch (error) {
      console.error('[Drive API] Erro:', error);
      return { success: false, error: error.message };
    }
  },

  async createFolder(data) {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${CONFIG.API_URL}/api/drive/folder`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await response.json();
    } catch (error) {
      console.error('[Drive API] Erro:', error);
      return { success: false, error: error.message };
    }
  },

  async deleteFolder(folderId) {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${CONFIG.API_URL}/api/drive/folder/${folderId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return await response.json();
    } catch (error) {
      console.error('[Drive API] Erro:', error);
      return { success: false, error: error.message };
    }
  },

  async saveFile(data) {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${CONFIG.API_URL}/api/drive/file`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await response.json();
    } catch (error) {
      console.error('[Drive API] Erro:', error);
      return { success: false, error: error.message };
    }
  },

  async deleteFile(fileId) {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${CONFIG.API_URL}/api/drive/file/${fileId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      return await response.json();
    } catch (error) {
      console.error('[Drive API] Erro:', error);
      return { success: false, error: error.message };
    }
  }
};

// ==================== R2 API ====================
window.r2API = {
  async generateUploadUrl(fileName, contentType, fileSize) {
    try {
      const response = await fetch(`${CONFIG.R2_API_URL}/generate-upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName, contentType, fileSize })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      return { success: true, ...result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async generateUploadUrls(files) {
    try {
      const response = await fetch(`${CONFIG.R2_API_URL}/generate-upload-urls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files })
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async verifyUpload(fileName) {
    try {
      const response = await fetch(`${CONFIG.R2_API_URL}/verify-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName })
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async deleteFile(fileName) {
    try {
      const response = await fetch(`${CONFIG.R2_API_URL}/delete/${encodeURIComponent(fileName)}`, {
        method: 'DELETE'
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  async deleteFiles(fileNames) {
    try {
      const response = await fetch(`${CONFIG.R2_API_URL}/delete-multiple`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileNames })
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

window.CONFIG = CONFIG;