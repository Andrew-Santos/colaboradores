const Send = {
  async uploadToR2(file, fileName, onProgress = null) {
    try {
      console.log(`[Send] Upload R2 iniciado: ${fileName}`);

      const token = Auth.getToken();

      // 1. Solicitar Presigned URL ao backend
      const presignedResponse = await fetch(`${CONFIG.API_URL}/api/generate-upload-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          fileName: fileName,
          contentType: file.type,
          fileSize: file.size
        })
      });

      if (!presignedResponse.ok) {
        const error = await presignedResponse.json();
        throw new Error(error.error || 'Erro ao gerar URL de upload');
      }

      const { uploadUrl, publicUrl } = await presignedResponse.json();

      // 2. Upload direto para R2
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        if (onProgress) {
          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              const percentComplete = (e.loaded / e.total) * 100;
              onProgress(percentComplete, e.loaded, e.total);
            }
          });
        }

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload falhou: ${xhr.status}`));
          }
        });

        xhr.addEventListener('error', () => reject(new Error('Erro de rede')));
        xhr.addEventListener('timeout', () => reject(new Error('Timeout')));

        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.timeout = 300000; // 5 minutos
        xhr.send(file);
      });

      console.log(`[Send] Upload R2 concluído: ${fileName}`);

      return {
        success: true,
        path: fileName,
        publicUrl: publicUrl
      };

    } catch (error) {
      console.error('[Send] Erro no upload R2:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  async uploadMultipleFiles(files, onProgress = null) {
    const uploadResults = [];
    let totalSize = files.reduce((acc, f) => acc + f.file.size, 0);
    let uploadedSize = 0;

    for (let i = 0; i < files.length; i++) {
      const { file, fileName } = files[i];

      const fileProgressCallback = onProgress ? (percentage, loaded, total) => {
        const fileProgress = uploadedSize + loaded;
        const totalProgress = (fileProgress / totalSize) * 100;
        onProgress(totalProgress, i + 1, files.length);
      } : null;

      const result = await this.uploadToR2(file, fileName, fileProgressCallback);

      if (!result.success) {
        throw new Error(result.error || `Falha no upload do arquivo ${fileName}`);
      }

      uploadedSize += file.size;
      uploadResults.push(result);
    }

    return uploadResults;
  },

  async createPost(postData) {
    try {
      console.log('[Send] Criando post no backend:', postData);

      const token = Auth.getToken();

      const response = await fetch(`${CONFIG.API_URL}/api/schedule-post`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(postData)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao criar post');
      }

      console.log('[Send] Post criado:', result);
      return result;

    } catch (error) {
      console.error('[Send] Erro ao criar post:', error);
      throw error;
    }
  },

  async saveMediaToDatabase(postId, mediaUrls) {
    try {
      console.log('[Send] Salvando URLs das mídias no banco...');
      
      // Aqui você pode adicionar uma rota no backend para salvar as URLs
      // Por enquanto, vamos apenas logar
      console.log('[Send] Post ID:', postId);
      console.log('[Send] Mídias:', mediaUrls);
      
      // TODO: Implementar endpoint /api/save-media
      // Estrutura sugerida:
      // POST /api/save-media
      // Body: { postId, mediaUrls: [{ url, order, type }] }
      
      return true;
    } catch (error) {
      console.error('[Send] Erro ao salvar mídias:', error);
      throw error;
    }
  },

  async schedulePost() {
    try {
      console.log('[Send] Iniciando agendamento de post...');

      // Validações
      if (!Renderer.selectedClient) {
        throw new Error('Selecione um cliente');
      }

      if (!Renderer.postType) {
        throw new Error('Selecione o tipo de postagem');
      }

      if (Renderer.mediaFiles.length === 0) {
        throw new Error('Adicione pelo menos uma mídia');
      }

      if (Renderer.postType === 'carousel' && Renderer.mediaFiles.length < 2) {
        throw new Error('Carousel precisa de pelo menos 2 arquivos');
      }

      const datetimeInput = document.getElementById('schedule-datetime');
      if (!datetimeInput.value) {
        throw new Error('Selecione a data e hora do agendamento');
      }

      const scheduledDate = new Date(datetimeInput.value);
      const now = new Date();

      if (scheduledDate <= now) {
        throw new Error('A data deve ser no futuro');
      }

      const caption = document.getElementById('caption').value || '';
      if (caption.length > 2200) {
        throw new Error('Legenda excede o limite de 2200 caracteres');
      }

      console.log('[Send] Validações OK');
      Notificacao.show('Iniciando agendamento...', 'info');

      // 1. Criar post no backend
      const postData = {
        clientId: Renderer.selectedClient.id,
        type: Renderer.postType,
        caption: caption || null,
        scheduledDate: scheduledDate.toISOString()
      };

      console.log('[Send] Criando post...');
      const createdPost = await this.createPost(postData);
      
      if (!createdPost.success) {
        throw new Error('Falha ao criar post');
      }

      const postId = createdPost.postId;
      console.log('[Send] Post criado com ID:', postId);

      // 2. Upload de mídias para R2
      console.log('[Send] Iniciando upload de mídias...');
      const filesToUpload = Renderer.mediaFiles.map((media, index) => {
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(7);
        const fileExtension = media.file.name.split('.').pop().toLowerCase();
        const fileName = `POST/${postId}/${timestamp}_${randomId}_${index}.${fileExtension}`;

        return { 
          file: media.file, 
          fileName: fileName, 
          originalMedia: media 
        };
      });

      const onProgress = (percentage, current, total) => {
        Notificacao.showProgress(percentage, current, total);
      };

      const uploadResults = await this.uploadMultipleFiles(filesToUpload, onProgress);
      console.log('[Send] Uploads concluídos:', uploadResults.length);

      // 3. Salvar URLs das mídias (opcional, dependendo da sua estrutura)
      const mediaUrls = uploadResults.map((result, index) => ({
        url: result.publicUrl,
        order: index + 1,
        type: Renderer.mediaFiles[index].type
      }));

      await this.saveMediaToDatabase(postId, mediaUrls);

      // Sucesso!
      console.log('[Send] Agendamento concluído com sucesso!');
      Notificacao.show('Post agendado com sucesso!', 'success');
      
      setTimeout(() => {
        Renderer.resetForm();
        Notificacao.hideProgress();
      }, 2000);

    } catch (error) {
      console.error('[Send] Erro ao agendar post:', error);
      Notificacao.show(error.message, 'error');
      Notificacao.hideProgress();
    }
  }
};

// Tornar Send global
window.Send = Send;
