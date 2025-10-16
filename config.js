// Configuração da API
const CONFIG = {
  // API principal (autenticação e posts)
  API_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : '', // Vazio = mesma origem (colaboradores.teamcriativa.com)
  
  // API do Cloudflare R2 (uploads)
  R2_API_URL: 'https://portal.teamcriativa.com/api/cloudflare'
};

console.log('[Config] API URL:', CONFIG.API_URL || 'Mesma origem');
console.log('[Config] R2 API URL:', CONFIG.R2_API_URL);

// Wrapper para chamadas à API principal
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

// Wrapper para chamadas à API do R2
window.r2API = {
  // GERAR PRESIGNED URL PARA UM ARQUIVO
  async generateUploadUrl(fileName, contentType, fileSize) {
    try {
      console.log('[R2 API] Gerando presigned URL para:', fileName);
      
      const response = await fetch(`${CONFIG.R2_API_URL}/generate-upload-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fileName,
          contentType,
          fileSize
        })
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Erro ao gerar URL');
      }

      console.log('[R2 API] Presigned URL gerada com sucesso');
      return result;

    } catch (error) {
      console.error('[R2 API] Erro ao gerar URL:', error);
      return { success: false, error: error.message };
    }
  },

  // GERAR PRESIGNED URLs PARA MÚLTIPLOS ARQUIVOS
  async generateUploadUrls(files) {
    try {
      console.log('[R2 API] Gerando presigned URLs para', files.length, 'arquivos');
      
      const response = await fetch(`${CONFIG.R2_API_URL}/generate-upload-urls`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ files })
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Erro ao gerar URLs');
      }

      console.log('[R2 API] Presigned URLs geradas com sucesso');
      return result;

    } catch (error) {
      console.error('[R2 API] Erro ao gerar URLs:', error);
      return { success: false, error: error.message };
    }
  },

  // VERIFICAR SE ARQUIVO FOI ENVIADO
  async verifyUpload(fileName) {
    try {
      console.log('[R2 API] Verificando upload de:', fileName);
      
      const response = await fetch(`${CONFIG.R2_API_URL}/verify-upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fileName })
      });

      const result = await response.json();
      
      console.log('[R2 API] Verificação concluída');
      return result;

    } catch (error) {
      console.error('[R2 API] Erro ao verificar upload:', error);
      return { success: false, error: error.message };
    }
  },

  // DELETAR ARQUIVO
  async deleteFile(fileName) {
    try {
      console.log('[R2 API] Deletando arquivo:', fileName);
      
      const response = await fetch(`${CONFIG.R2_API_URL}/delete/${encodeURIComponent(fileName)}`, {
        method: 'DELETE'
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Erro ao deletar arquivo');
      }

      console.log('[R2 API] Arquivo deletado com sucesso');
      return result;

    } catch (error) {
      console.error('[R2 API] Erro ao deletar arquivo:', error);
      return { success: false, error: error.message };
    }
  },

  // DELETAR MÚLTIPLOS ARQUIVOS
  async deleteFiles(fileNames) {
    try {
      console.log('[R2 API] Deletando', fileNames.length, 'arquivos');
      
      const response = await fetch(`${CONFIG.R2_API_URL}/delete-multiple`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fileNames })
      });

      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Erro ao deletar arquivos');
      }

      console.log('[R2 API] Arquivos deletados com sucesso');
      return result;

    } catch (error) {
      console.error('[R2 API] Erro ao deletar arquivos:', error);
      return { success: false, error: error.message };
    }
  }
};

window.CONFIG = CONFIG;
