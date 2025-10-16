const Send = {
  async uploadToR2(file, fileName, onProgress = null) {
    try {
      console.log(`[Send] Upload R2 iniciado: ${fileName}`);

      // 1. Solicitar Presigned URL
      const presignedResponse = await fetch(`${CONFIG.R2_API_URL}/generate-upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        xhr.timeout = 300000;
        xhr.send(file);
      });

      // 3. Verificar upload
      const verifyResponse = await fetch(`${CONFIG.R2_API_URL}/verify-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName })
      });

      if (!verifyResponse.ok) {
        throw new Error('Falha na verificação');
      }

      const verification = await verifyResponse.json();
      if (!verification.exists) {
        throw new Error('Arquivo não encontrado após upload');
      }

      console.log(`[Send] Upload R2 concluído: ${fileName}`);

      return {
        success: true,
        path: fileName,
        publicUrl: publicUrl,
        size: verification.size
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
      console.log('[Send] Criando post no Supabase:', postData);

      const { data, error } = await supabase
        .from('post')
        .insert([postData])
        .select()
        .single();

      if (error) throw error;

      console.log('[Send] Post criado:', data);
      return data;

    } catch (error) {
      console.error('[Send] Erro ao criar post:', error);
      throw error;
    }
  },

  async createPostMedia(mediaData) {
    try {
      console.log('[Send] Criando registros de mídia:', mediaData.length);

      const { data, error } = await supabase
        .from('post_media')
        .insert(mediaData)
        .select();

      if (error) throw error;

      console.log('[Send] Registros de mídia criados');
      return data;

    } catch (error) {
      console.error('[Send] Erro ao criar mídia:', error);
      throw error;
    }
  },

  async schedulePost() {
    try {
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

      Notificacao.show('Iniciando upload...', 'info');

      // 1. Criar post no banco
      const postData = {
        id_client: Renderer.selectedClient.id,
        caption: caption || null,
        collaborators: null,
        user_tags: null,
        type: Renderer.postType,
        status: 'PENDENTE',
        agendamento: scheduledDate.toISOString()
      };

      const createdPost = await this.createPost(postData);
      if (!createdPost) {
        throw new Error('Falha ao criar post no banco de dados');
      }

      // 2. Upload de mídias para R2
      const filesToUpload = Renderer.mediaFiles.map((media, index) => {
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(7);
        const fileExtension = media.file.name.split('.').pop().toLowerCase();
        const fileName = `POST/${createdPost.id}/${timestamp}_${randomId}_${index}.${fileExtension}`;

        return { file: media.file, fileName: fileName, originalMedia: media };
      });

      const onProgress = (percentage, current, total) => {
        Notificacao.showProgress(percentage, current, total);
      };

      const uploadResults = await this.uploadMultipleFiles(filesToUpload, onProgress);

      // 3. Criar registros de mídia
      const mediaRecords = uploadResults.map((result, index) => ({
        id_post: createdPost.id,
        type: filesToUpload[index].originalMedia.type,
        url_media: result.publicUrl,
        order: filesToUpload[index].originalMedia.order.toString()
      }));

      await this.createPostMedia(mediaRecords);

      Notificacao.show('Post agendado com sucesso!', 'success');
      
      setTimeout(() => {
        Renderer.resetForm();
      }, 2000);

    } catch (error) {
      console.error('[Send] Erro ao agendar post:', error);
      Notificacao.show(error.message, 'error');
      Notificacao.hideProgress();
    }
  }
};