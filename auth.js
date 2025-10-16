const Auth = {
  SESSION_KEY: 'portal_session',
  SESSION_DURATION: 7 * 24 * 60 * 60 * 1000, // 7 dias em milissegundos

  // Salvar sessão
  saveSession(userData) {
    const session = {
      user: userData,
      timestamp: Date.now(),
      expiresAt: Date.now() + this.SESSION_DURATION
    };
    
    try {
      localStorage.setItem(this.SESSION_KEY, JSON.stringify(session));
      console.log('[Auth] Sessão salva com sucesso');
      return true;
    } catch (error) {
      console.error('[Auth] Erro ao salvar sessão:', error);
      return false;
    }
  },

  // Verificar se sessão existe e é válida
  checkSession() {
    try {
      const sessionData = localStorage.getItem(this.SESSION_KEY);
      
      if (!sessionData) {
        console.log('[Auth] Nenhuma sessão encontrada');
        return null;
      }

      const session = JSON.parse(sessionData);
      const now = Date.now();

      // Verificar se a sessão expirou
      if (now > session.expiresAt) {
        console.log('[Auth] Sessão expirada');
        this.clearSession();
        return null;
      }

      console.log('[Auth] Sessão válida encontrada');
      return session.user;
    } catch (error) {
      console.error('[Auth] Erro ao verificar sessão:', error);
      this.clearSession();
      return null;
    }
  },

  // Limpar sessão
  clearSession() {
    try {
      localStorage.removeItem(this.SESSION_KEY);
      console.log('[Auth] Sessão removida');
      return true;
    } catch (error) {
      console.error('[Auth] Erro ao remover sessão:', error);
      return false;
    }
  },

  // Renovar sessão (adiciona mais 7 dias)
  renewSession() {
    const session = this.checkSession();
    if (session) {
      this.saveSession(session);
      console.log('[Auth] Sessão renovada');
      return true;
    }
    return false;
  },

  // Login com Supabase
  async login(email, password) {
    try {
      console.log('[Auth] Tentando fazer login...');

      // Verificar se supabase está disponível
      if (typeof supabase === 'undefined') {
        throw new Error('Supabase não inicializado. Verifique o config.js');
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password
      });

      if (error) {
        console.error('[Auth] Erro no login:', error.message);
        throw new Error(error.message || 'Credenciais inválidas');
      }

      if (!data.user) {
        throw new Error('Nenhum usuário retornado');
      }

      // Salvar dados do usuário na sessão
      const userData = {
        id: data.user.id,
        email: data.user.email,
        metadata: data.user.user_metadata || {}
      };

      this.saveSession(userData);
      console.log('[Auth] Login bem-sucedido');

      return {
        success: true,
        user: userData
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
      
      // Fazer logout no Supabase
      if (typeof supabase !== 'undefined') {
        const { error } = await supabase.auth.signOut();
        
        if (error) {
          console.warn('[Auth] Erro ao fazer logout no Supabase:', error);
        }
      }

      // Limpar sessão local
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
    return this.checkSession() !== null;
  },

  // Obter dados do usuário da sessão
  getCurrentUser() {
    return this.checkSession();
  },

  // Auto-login se sessão válida
  async autoLogin() {
    const user = this.checkSession();
    
    if (user) {
      console.log('[Auth] Sessão válida encontrada, fazendo auto-login');
      return {
        success: true,
        user: user
      };
    }

    return {
      success: false,
      error: 'Nenhuma sessão válida'
    };
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
