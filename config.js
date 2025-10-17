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
  },

  // SALVAR MÍDIAS DO POST
  async saveMedia(postId, mediaFiles) {
    try {
      console.log('[API] Salvando mídias - Post ID:', postId);
      console.log('[API] Número de arquivos:', mediaFiles.length);
      
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${CONFIG.API_URL}/api/save-media`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ postId, mediaFiles })
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Erro ao salvar mídias');
      }
      
      console.log('[API] Mídias salvas com sucesso');
      return result;
      
    } catch (error) {
      console.error('[API] Erro ao salvar mídias:', error);
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
      console.log('[R2 API] Endpoint:', `${CONFIG.R2_API_URL}/generate-upload-url`);
      
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

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[R2 API] Resposta de erro:', errorText);
        throw new Error(`Erro HTTP ${response.status}: ${errorText.substring(0, 100)}`);
      }

      const result = await response.json();

      console.log('[R2 API] Presigned URL gerada com sucesso');
      return { success: true, ...result };

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
  },
  /**
 * COPIAR E COLAR isso no seu config.js existente (no objeto window.r2API)
 * 
 * Não remova as funções existentes, apenas adicione essas
 */

// ===== FUNÇÕES MULTIPART (ADICIONAR AO window.r2API) =====

async initiateMultipartUpload(fileName, contentType, fileSize) {
  try {
    console.log('[R2 API] Iniciando multipart upload');
    console.log('[R2 API] Arquivo:', fileName);
    console.log('[R2 API] Tipo:', contentType);
    console.log('[R2 API] Tamanho:', (fileSize / 1024 / 1024).toFixed(2), 'MB');

    const response = await fetch(`${this.apiUrl}/multipart/initiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fileName: fileName,
        contentType: contentType,
        fileSize: fileSize
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[R2 API] Erro ao iniciar multipart:', data.error);
      return { success: false, error: data.error || 'Erro ao iniciar multipart' };
    }

    console.log('[R2 API] Multipart iniciado, uploadId:', data.uploadId);
    return { success: true, uploadId: data.uploadId };

  } catch (error) {
    console.error('[R2 API] Erro ao iniciar multipart:', error);
    return { success: false, error: error.message };
  }
},

async getMultipartPartUrl(uploadId, partNumber) {
  try {
    console.log(`[R2 API] Obtendo URL para part ${partNumber}`);

    const response = await fetch(`${this.apiUrl}/multipart/get-part-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        uploadId: uploadId,
        partNumber: partNumber
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`[R2 API] Erro ao obter URL para part:`, data.error);
      return { success: false, error: data.error };
    }

    console.log(`[R2 API] URL obtida para part ${partNumber}`);
    return { 
      success: true, 
      uploadUrl: data.uploadUrl,
      expiresIn: data.expiresIn
    };

  } catch (error) {
    console.error('[R2 API] Erro ao obter URL:', error);
    return { success: false, error: error.message };
  }
},

async registerMultipartPart(uploadId, partNumber, eTag) {
  try {
    console.log(`[R2 API] Registrando part ${partNumber} (ETag: ${eTag})`);

    const response = await fetch(`${this.apiUrl}/multipart/register-part`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        uploadId: uploadId,
        partNumber: partNumber,
        eTag: eTag
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[R2 API] Erro ao registrar part:', data.error);
      return { success: false, error: data.error };
    }

    console.log(`[R2 API] Part ${partNumber} registrada (${data.totalParts} total)`);
    return { success: true, totalParts: data.totalParts };

  } catch (error) {
    console.error('[R2 API] Erro ao registrar part:', error);
    return { success: false, error: error.message };
  }
},

async completeMultipartUpload(uploadId) {
  try {
    console.log('[R2 API] Completando multipart upload');

    const response = await fetch(`${this.apiUrl}/multipart/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        uploadId: uploadId
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[R2 API] Erro ao completar multipart:', data.error);
      return { success: false, error: data.error };
    }

    console.log('[R2 API] Multipart completado');
    console.log('[R2 API] Arquivo:', data.fileName);
    console.log('[R2 API] URL:', data.publicUrl);
    
    return { 
      success: true, 
      fileName: data.fileName,
      publicUrl: data.publicUrl,
      message: data.message
    };

  } catch (error) {
    console.error('[R2 API] Erro ao completar multipart:', error);
    return { success: false, error: error.message };
  }
},

async abortMultipartUpload(uploadId) {
  try {
    console.log('[R2 API] Abortando multipart upload');

    const response = await fetch(`${this.apiUrl}/multipart/abort`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        uploadId: uploadId
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[R2 API] Erro ao abortar:', data.error);
      return { success: false, error: data.error };
    }

    console.log('[R2 API] Upload abortado com sucesso');
    return { success: true, message: data.message };

  } catch (error) {
    console.error('[R2 API] Erro ao abortar:', error);
    return { success: false, error: error.message };
  }
}
};

window.CONFIG = CONFIG;
