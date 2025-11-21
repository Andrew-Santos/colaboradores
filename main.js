document.addEventListener('DOMContentLoaded', async () => {
  // Background animado
  VANTA.WAVES({
    el: "#bg",
    mouseControls: true,
    touchControls: true,
    gyroControls: false,
    minHeight: 200.00,
    minWidth: 200.00,
    scale: 1.00,
    scaleMobile: 1.00,
    color: 0x000000,
    shininess: 25.00,
    waveHeight: 25.00,
    waveSpeed: 1.05,
    zoom: 1.20
  });

  // Verificar auto-login
  const autoLoginResult = await Auth.autoLogin();
  
  if (autoLoginResult.success) {
    console.log('[Main] Auto-login bem-sucedido');
    Auth.showCorrectScreen();
    await Renderer.loadClients();
    setupDateTime();
    Notificacao.show('Bem-vindo de volta!', 'success');
  } else {
    console.log('[Main] Nenhuma sessão válida, mostrando login');
    Auth.showCorrectScreen();
  }

  // Toggle forgot box
  const forgotLink = document.getElementById("forgot-link");
  const forgotBox = document.getElementById("forgot-box");
  forgotLink.addEventListener("click", () => {
    forgotBox.style.display = forgotBox.style.display === "flex" ? "none" : "flex";
  });

  // Login form
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    // Mostrar loading
    Notificacao.show('Fazendo login...', 'info');

    const result = await Auth.login(email, password);

    if (result.success) {
      // Login bem-sucedido
      Auth.showCorrectScreen();
      
      // Carregar clientes
      await Renderer.loadClients();
      
      // Configurar data/hora
      setupDateTime();

      Notificacao.show('Login realizado com sucesso!', 'success');

    } else {
      Notificacao.show(result.error || 'Login falhou. Verifique suas credenciais.', 'error');
    }
  });
   // Botão abrir Drive
  document.getElementById('open-drive-btn')?.addEventListener('click', () => {
    const clientId = document.getElementById('client-select').value;
    if (clientId) {
      DriveManager.openDrive(parseInt(clientId));
    } else {
      Notificacao.show('Selecione um cliente primeiro', 'warning');
    }
  });

  // Botão fechar Drive
  document.getElementById('close-drive-btn')?.addEventListener('click', () => {
    DriveManager.closeDrive();
  });

  // Fechar modal clicando fora
  document.getElementById('drive-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'drive-modal') {
      DriveManager.closeDrive();
    }
  });

  // Logout
  document.getElementById('btn-logout').addEventListener('click', async () => {
    await Auth.logout();
    Auth.showCorrectScreen();
    document.getElementById('login-email').value = '';
    document.getElementById('login-password').value = '';
    Renderer.resetForm();
    Notificacao.show('Logout realizado', 'info');
  });

  // Seleção de cliente
  document.getElementById('client-select').addEventListener('change', (e) => {
    Renderer.selectClient(e.target.value);
  });

  // Seleção de tipo de post
  document.querySelectorAll('.post-type').forEach(el => {
    el.addEventListener('click', (e) => {
      const type = e.currentTarget.dataset.type;
      Renderer.selectPostType(type);
    });
  });

  // Upload de mídia
  const uploadArea = document.getElementById('media-upload-area');
  const fileInput = document.getElementById('media-files');

  uploadArea.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      Renderer.handleFileUpload(e.target.files);
      e.target.value = '';
    }
  });

  // Drag and drop
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
      Renderer.handleFileUpload(e.dataTransfer.files);
    }
  });

  // Remover mídia
  document.addEventListener('click', (e) => {
    if (e.target.closest('.remove-media-btn')) {
      const id = parseInt(e.target.closest('.remove-media-btn').dataset.id);
      Renderer.removeMediaFile(id);
    }
  });

  // Contador de caracteres
  document.getElementById('caption').addEventListener('input', (e) => {
    const length = e.target.value.length;
    document.getElementById('caption-counter').textContent = `${length} / 2200 caracteres`;
  });

  // Botão cancelar
  document.getElementById('cancel-btn').addEventListener('click', () => {
    if (confirm('Deseja realmente cancelar? Todos os dados serão perdidos.')) {
      Renderer.resetForm();
      Notificacao.show('Formulário cancelado', 'info');
    }
  });

  // Botão enviar
  document.getElementById('submit-btn').addEventListener('click', () => {
    Send.schedulePost();
  });

  // Função auxiliar para configurar data/hora
  function setupDateTime() {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    const defaultDate = new Date(now.getTime() + 60 * 60 * 1000);
    document.getElementById('schedule-datetime').value = defaultDate.toISOString().slice(0, 16);
    document.getElementById('schedule-datetime').min = now.toISOString().slice(0, 16);
  }
});