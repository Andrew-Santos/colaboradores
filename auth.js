const Auth = {
  TOKEN_KEY: 'auth_token',
  SESSION_DURATION: 7 * 24 * 60 * 60 * 1000,

  saveToken(token) {
    try {
      localStorage.setItem(this.TOKEN_KEY, token);
      return true;
    } catch (error) {
      console.error('[Auth] Erro ao salvar token:', error);
      return false;
    }
  },

  getToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  },

  async login(email, password) {
    try {
      const result = await window.supabaseAPI.login(email, password);

      if (!result.success) {
        throw new Error(result.error);
      }

      // Salvar token
      this.saveToken(result.session.access_token);

      return { success: true, user: result.user };

    } catch (error) {
      console.error('[Auth] Erro no login:', error);
      return { success: false, error: error.message };
    }
  },

  async logout() {
    try {
      await window.supabaseAPI.logout();
      localStorage.removeItem(this.TOKEN_KEY);
      return true;
    } catch (error) {
      console.error('[Auth] Erro no logout:', error);
      return false;
    }
  },

  isAuthenticated() {
    return !!this.getToken();
  }
};

window.Auth = Auth;