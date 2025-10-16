// Configuração da API
const CONFIG = {
  API_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://colaboradores.teamcriativa.com/api'
};

console.log('[Config] API URL:', CONFIG.API_URL);

// Wrapper para chamadas à API
window.supabaseAPI = {
  // LOGIN
  async login(email, password) {
    try {
      const response = await fetch(`${CONFIG.API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      return await response.json();
    } catch (error) {
      console.error('[API] Erro no login:', error);
      return { success: false, error: error.message };
    }
  },

  // LOGOUT
  async logout() {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${CONFIG.API_URL}/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      return await response.json();
    } catch (error) {
      console.error('[API] Erro no logout:', error);
      return { success: false, error: error.message };
    }
  },

  // VERIFICAR TOKEN
  async verifyToken() {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${CONFIG.API_URL}/auth/verify`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      return await response.json();
    } catch (error) {
      console.error('[API] Erro ao verificar token:', error);
      return { success: false, error: error.message };
    }
  },

  // OBTER CLIENTES
  async getClients() {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${CONFIG.API_URL}/api/clients`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      return await response.json();
    } catch (error) {
      console.error('[API] Erro ao obter clientes:', error);
      return { success: false, error: error.message };
    }
  },

  // GERAR URL DE UPLOAD
  async generateUploadUrl(fileName, contentType, fileSize) {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${CONFIG.API_URL}/api/generate-upload-url`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fileName, contentType, fileSize })
      });
      return await response.json();
    } catch (error) {
      console.error('[API] Erro ao gerar URL:', error);
      return { success: false, error: error.message };
    }
  },

  // AGENDAR POST
  async schedulePost(postData) {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${CONFIG.API_URL}/api/schedule-post`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(postData)
      });
      return await response.json();
    } catch (error) {
      console.error('[API] Erro ao agendar post:', error);
      return { success: false, error: error.message };
    }
  }
};

window.CONFIG = CONFIG;
