const Auth = {
  TOKEN_KEY: 'auth_token',
  USER_KEY: 'auth_user',
  SESSION_DURATION: 7 * 24 * 60 * 60 * 1000, // 7 dias em milissegundos

  // Salvar token
  saveToken(token) {
    try {
      localStorage.setItem(this.TOKEN_KEY, token);
      console.log('[Auth] Token salvo com sucesso');
      return true;
    } catch (error) {
      console.error('[Auth] Erro ao salvar token:', error);
      return false;
    }
  },

  // Obter token
  getToken() {
    try {
      return localStorage.getItem(this.TOKEN_KEY);
    } catch (error) {
      console.error('[Auth] Erro ao obter token:', error);
      return null;
    }
  },

  // Salvar dados do usuário
  saveUser(userData) {
    try {
      localStorage.setItem(this.USER_KEY, JSON.stringify(userData));
      console.log('[Auth] Usuário salvo com sucesso');
      return true;
    } catch (error) {
      console.error('[Auth] Erro ao salvar usuário:', error);
      return false;
    }
  },

  // Obter usuário
  getUser() {
    try {
      const userData = localStorage.getItem(this.USER_KEY);
      return userData ? JSON.parse(userData) : null;
    } catch (error) {
      console.error('[Auth] Erro ao obter usuário:', error);
      return null;
    }
  },

  // Limpar sessão
  clearSession() {
    try {
      localStorage.removeItem(this.TOKEN_KEY);
      localStorage.removeItem(this.USER_KEY);
      console.log('[Auth] Sessão removida');
      return true;
    } catch (error) {
      console.error('[Auth] Erro ao remover sessão:', error);
      return false;
    }
  },

  // Login com backend
  async login(email, password) {
    try {
      console.log('[Auth] Tentando fazer login...');

      // Validações básicas
      if (!email || !password) {
        throw new Error('Email e senha são obrigatórios');
      }

      if (!email.includes('@')) {
        throw new Error('Email inválido');
      }

      if (password.length < 6) {
        throw new Error('Senha deve ter pelo menos 6 caracteres');
      }

      // Chamar API de login
      const result = await window.supabaseAPI.login(email, password);

      if (!result.success) {
        throw new Error(result.error || 'Credenciais inválidas');
      }

      // Salvar token e usuário
      this.saveToken(result.session.access_token);
      this.saveUser(result.user);

      console.log('[Auth] Login bem-sucedido');

      return {
        success: true,
        user: result.user
      };

    } catch (error) {
      console.error('[Auth] Falha no login:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Logout
  async logout() {
    try {
      console.log('[Auth] Fazendo logout...');

      const token = this.getToken();
      if (token) {
        await window.supabaseAPI.logout();
      }

      this.clearSession();
      console.log('[Auth] Logout concluído');
      return true;

    } catch (error) {
      console.error('[Auth] Erro no logout:', error);
      // Mesmo com erro, limpar sessão local
      this.clearSession();
      return false;
    }
  },

  // Verificar se usuário está autenticado
  isAuthenticated() {
    return !!this.getToken();
  },

  // Obter usuário atual
  getCurrentUser() {
    return this.getUser();
  },

  // Renovar sessão (fazer requisição ao backend para validar token)
  async renewSession() {
    try {
      const token = this.getToken();
      if (!token) {
        return false;
      }

      const response = await fetch(`${CONFIG.API_URL}/auth/verify`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        this.clearSession();
        return false;
      }

      const result = await response.json();

      if (result.success) {
        this.saveUser(result.user);
        console.log('[Auth] Sessão renovada');
        return true;
      }

      return false;

    } catch (error) {
      console.error('[Auth] Erro ao renovar sessão:', error);
      return false;
    }
  },

  // Auto-login se houver token válido
  async autoLogin() {
    try {
      const token = this.getToken();

      if (!token) {
        console.log('[Auth] Nenhum token encontrado');
        return {
          success: false,
          error: 'Nenhuma sessão válida'
        };
      }

      console.log('[Auth] Token encontrado, validando...');

      // Validar token com o backend
      const isValid = await this.renewSession();

      if (isValid) {
        const user = this.getUser();
        console.log('[Auth] Auto-login bem-sucedido');
        return {
          success: true,
          user: user
        };
      }

      // Token inválido, limpar
      this.clearSession();
      return {
        success: false,
        error: 'Sessão expirada'
      };

    } catch (error) {
      console.error('[Auth] Erro no auto-login:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  // Exibir tela apropriada baseado na autenticação
  showCorrectScreen() {
    const loginScreen = document.getElementById('login-screen');
    const postSystem = document.getElementById('post-system');

    if (!loginScreen || !postSystem) {
      console.error('[Auth] Elementos de tela não encontrados');
      return false;
    }

    if (this.isAuthenticated()) {
      loginScreen.style.display = 'none';
      postSystem.classList.add('active');
      return true;
    } else {
      loginScreen.style.display = 'block';
      postSystem.classList.remove('active');
      return false;
    }
  }
};

// Tornar Auth global para outros scripts
window.Auth = Auth;