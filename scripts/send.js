const Send = {
  async uploadToR2(file, fileName, onProgress = null) {
    try {
      console.log(`[Send] Upload R2 iniciado: ${fileName}`);

      // 1. Gerar presigned URL
      const urlResult = await window.r2API.generateUploadUrl(
        fileName,
        file.type,
        file.size
      );

      if (!urlResult.success) {
        throw new Error(urlResult.error || 'Erro ao gerar URL de upload');
      }

      const { uploadUrl, publicUrl } = urlResult;
      console.log('[Send] Presigned URL obtida');
      console.log('[Send] Upload URL:', uploadUrl);
      console.log('[Send] Public URL:', publicUrl);

      // 2. Upload direto para R2 usando a Presigned URL
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
            console.error('[Send] Status de resposta:', xhr.status);
            console.error('[Send] Resposta:', xhr.responseText);
            reject(new Error(`Upload falhou: ${xhr.status} - ${xhr.statusText}`));
          }
        });

        xhr.addEventListener('error', () => {
          console.error('[Send] Erro de rede no upload');
          reject(new Error('Erro de rede no upload'));
        });
        
        xhr.addEventListener('timeout', () => {
          console.error('[Send] Timeout no upload');
          reject(new Error('Timeout no upload'));
        });

        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.timeout = 300000; // 5 minutos
        xhr.send(file);
      });

      console.log(`[Send] Upload R2 concluído: ${fileName}`);

      // 3. Verificar se o arquivo foi enviado com sucesso
      try {
        const verifyResult = await window.r2API.verifyUpload(fileName);
        
        if (!verifyResult.exists) {
          console.warn('[Send] Aviso: Arquivo pode não ter sido enviado corretamente');
        } else {
          console.log('[Send] Arquivo verificado com sucesso no R2');
        }
      } catch (verifyError) {
        console.warn('[Send] Não foi possível verificar o upload:', verifyError);
      }

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

    console.log(`[Send] Iniciando upload de ${files.length} arquivo(s)`);
    console.log(`[Send] Tamanho total: ${(totalSize / (1024 * 1024)).toFixed(2)} MB`);

    for (let i = 0; i < files.length; i++) {
      const { file, fileName } = files[i];

      console.log(`[Send] Fazendo upload ${i + 1}/${files.length}: ${fileName}`);

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
      
      console.log(`[Send] Upload ${i + 1}/${files.length} concluído`);
    }

    console.log(`[Send] Todos os uploads concluídos: ${uploadResults.length} arquivo(s)`);
    return uploadResults;
  },

  async createPost(postData) {
    try {
      console.log('[Send] Criando post no backend:', postData);

      const result = await window.supabaseAPI.schedulePost(postData);

      if (!result.success) {
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
      console.log('[Send] Post ID:', postId);
      console.log('[Send] Mídias:', mediaUrls);
      
      // Chamar a API para salvar as mídias
      const result = await window.supabaseAPI.saveMedia(postId, mediaUrls);
      
      if (!result.success) {
        throw new Error(result.error || 'Erro ao salvar mídias no banco');
      }
      
      console.log('[Send] Mídias salvas com sucesso:', result.count);
      return result;
      
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

      // 3. Preparar dados das mídias para o banco
      const mediaUrls = uploadResults.map((result, index) => ({
        url: result.publicUrl,
        order: index + 1,
        type: Renderer.mediaFiles[index].type
      }));

      console.log('[Send] Salvando mídias no banco de dados...');
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
