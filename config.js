const CONFIG = {
  // Aponta para seu backend seguro
  API_URL: 'https://colaboradores.teamcriativa.com/api', // Seu backend
  // Remover todas as chaves de aqui!
};

// Usar API do backend
window.supabaseAPI = {
  async login(email, password) {
    const response = await fetch(`${CONFIG.API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    return response.json();
  },

  async logout() {
    const response = await fetch(`${CONFIG.API_URL}/auth/logout`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${localStorage.getItem('token')}`,
        'Content-Type': 'application/json'
      }
    });
    return response.json();
  },

  async getClients() {
    const response = await fetch(`${CONFIG.API_URL}/api/clients`, {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    return response.json();
  }
};