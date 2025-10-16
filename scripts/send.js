const Send = {
  async uploadToR2(file, fileName, onProgress = null) {
    try {
      console.log(`[Send] Upload R2 iniciado: ${fileName}`);
      console.log(`[Send] Tamanho do arquivo: ${(file.size / (1024 * 1024)).toFixed(2)} MB`);

      // Mostrar progresso inicial imediatamente
      if (onProgress) {
        onProgress(0, 0, file.size);
      }

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

      // 3. VERIFICAÇÃO OBRIGATÓRIA - Confirmar que o arquivo existe
      console.log('[Send] Verificando se arquivo foi salvo...');
      
      // Adicionar timeout na verificação
      const verifyWithTimeout = async (fileName, timeoutMs = 10000) => {
        return Promise.race([
          window.r2API.verifyUpload(fileName),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout na verificação')), timeoutMs)
          )
        ]);
      };
      
      const verifyResult = await verifyWithTimeout(fileName, 10000);
      
      if (!verifyResult.success || !verifyResult.exists) {
        throw new Error(`Falha na verificação: arquivo ${fileName} não foi encontrado no R2`);
      }
      
      console.log('[Send] ✓ Arquivo verificado e confirmado no R2');

      // 4. VALIDAÇÃO EXTRA - Tentar acessar a URL pública
      try {
        const headResponse = await fetch(publicUrl, { method: 'HEAD' });
        if (!headResponse.ok) {
          console.warn('[Send] Aviso: URL pública não está acessível imediatamente');
        } else {
          console.log('[Send] ✓ URL pública acessível');
        }
      } catch (e) {
        console.warn('[Send] Não foi possível validar URL pública:', e.message);
      }

      return {
        success: true,
        path: fileName,
        publicUrl: publicUrl,
        verified: true
      };

    } catch (error) {
      console.error('[Send] Erro no upload R2:', error);
      return {
        success: false,
        error: error.message,
        path: fileName
      };
    }
  },

  async uploadMultipleFiles(files, onProgress = null) {
    const uploadResults = [];
    const failedUploads = [];
    let totalSize = files.reduce((acc, f) => acc + f.file.size, 0);
    let uploadedSize = 0;

    console.log(`[Send] Iniciando upload de ${files.length} arquivo(s)`);
    console.log(`[Send] Tamanho total: ${(totalSize / (1024 * 1024)).toFixed(2)} MB`);

    // Mostrar progresso inicial
    if (onProgress) {
      onProgress(1, 0, files.length);
    }

    for (let i = 0; i < files.length; i++) {
      const { file, fileName } = files[i];

      console.log(`[Send] Fazendo upload ${i + 1}/${files.length}: ${fileName}`);
      console.log(`[Send] Progresso geral: ${((uploadedSize / totalSize) * 100).toFixed(1)}%`);

      const fileProgressCallback = onProgress ? (percentage, loaded, total) => {
        const fileProgress = uploadedSize + loaded;
        const totalProgress = (fileProgress / totalSize) * 100;
        onProgress(totalProgress, i + 1, files.length);
      } : null;

      const result = await this.uploadToR2(file, fileName, fileProgressCallback);

      if (!result.success) {
        console.error(`[Send] ✗ Falha no upload ${i + 1}/${files.length}: ${result.error}`);
        failedUploads.push({
          fileName,
          index: i + 1,
          error: result.error
        });
        
        // Parar imediatamente se houver falha
        throw new Error(`Falha no upload do arquivo "${file.name}" (${i + 1}/${files.length}): ${result.error}`);
      }

      uploadedSize += file.size;
      uploadResults.push(result);
      
      console.log(`[Send] ✓ Upload ${i + 1}/${files.length} concluído e verificado`);
    }

    // VERIFICAÇÃO FINAL - Confirmar que TODOS os arquivos estão acessíveis
    console.log('[Send] Realizando verificação final de todos os arquivos...');
    const finalVerification = await this.verifyAllUploads(uploadResults.map(r => r.path));
    
    if (!finalVerification.success) {
      throw new Error(`Verificação final falhou: ${finalVerification.missingFiles.length} arquivo(s) não encontrado(s)`);
    }

    console.log(`[Send] ✓ Todos os ${uploadResults.length} arquivo(s) verificados e confirmados!`);
    return uploadResults;
  },

  async verifyAllUploads(fileNames) {
    const missingFiles = [];
    
    for (const fileName of fileNames) {
      try {
        const result = await window.r2API.verifyUpload(fileName);
        if (!result.exists) {
          missingFiles.push(fileName);
        }
      } catch (error) {
        console.error(`[Send] Erro ao verificar ${fileName}:`, error);
        missingFiles.push(fileName);
      }
    }

    return {
      success: missingFiles.length === 0,
      missingFiles,
      totalChecked: fileNames.length
    };
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

  async rollbackPost(postId, uploadedFiles = []) {
    console.log('[Send] Iniciando rollback...');
    const errors = [];

    // 1. Deletar arquivos do R2
    if (uploadedFiles.length > 0) {
      try {
        console.log(`[Send] Deletando ${uploadedFiles.length} arquivo(s) do R2...`);
        const deleteResult = await window.r2API.deleteFiles(uploadedFiles);
        
        if (deleteResult.success) {
          console.log('[Send] ✓ Arquivos deletados do R2');
        } else {
          console.error('[Send] ✗ Erro ao deletar arquivos do R2:', deleteResult.error);
          errors.push('Erro ao deletar arquivos do R2');
        }
      } catch (error) {
        console.error('[Send] Erro ao deletar do R2:', error);
        errors.push('Erro ao deletar do R2: ' + error.message);
      }
    }

    // 2. Deletar post do Supabase (se você tiver essa função na API)
    // Você precisará adicionar um endpoint DELETE na sua API
    if (postId) {
      try {
        console.log('[Send] Deletando post do Supabase...');
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${window.CONFIG.API_URL}/api/delete-post/${postId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          console.log('[Send] ✓ Post deletado do Supabase');
        } else {
          console.error('[Send] ✗ Erro ao deletar post do Supabase');
          errors.push('Erro ao deletar post do banco');
        }
      } catch (error) {
        console.error('[Send] Erro ao deletar post:', error);
        errors.push('Erro ao deletar post: ' + error.message);
      }
    }

    if (errors.length > 0) {
      console.warn('[Send] Rollback concluído com erros:', errors);
      return { success: false, errors };
    }

    console.log('[Send] ✓ Rollback concluído com sucesso');
    return { success: true };
  },

  async schedulePost() {
    let postId = null;
    let uploadedFiles = [];
    
    try {
      console.log('[Send] Iniciando agendamento de post...');

      // Validações
      if (!Renderer.selectedClient || !Renderer.selectedClient.id) {
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

      // Mostrar progresso inicial (preparação)
      Notificacao.showProgress(0, 0, Renderer.mediaFiles.length);
      Notificacao.updateProgressMessage('Preparando arquivos para upload...');

      // ETAPA 1: Upload de mídias para R2 PRIMEIRO
      console.log('[Send] ETAPA 1/3: Upload de mídias para R2...');
      
      // Pequena pausa para garantir que a UI foi atualizada
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const filesToUpload = Renderer.mediaFiles.map((media, index) => {
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(7);
        const fileExtension = media.file.name.split('.').pop().toLowerCase();
        const tempPostId = `TEMP_${timestamp}_${randomId}`;
        const fileName = `POST/${tempPostId}/${timestamp}_${randomId}_${index}.${fileExtension}`;

        return { 
          file: media.file, 
          fileName: fileName, 
          originalMedia: media 
        };
      });

      const onProgress = (percentage, current, total) => {
        Notificacao.showProgress(percentage, current, total);
      };

      // Upload com verificação automática
      const uploadResults = await this.uploadMultipleFiles(filesToUpload, onProgress);
      uploadedFiles = uploadResults.map(r => r.path);
      
      console.log('[Send] ✓ ETAPA 1 CONCLUÍDA: Todos os arquivos no R2 e verificados');

      // ETAPA 2: Criar post no Supabase
      console.log('[Send] ETAPA 2/3: Criando post no Supabase...');
      Notificacao.updateProgressMessage('Salvando informações do post...');
      
      const postData = {
        clientId: Renderer.selectedClient.id,
        type: Renderer.postType,
        caption: caption || null,
        scheduledDate: scheduledDate.toISOString()
      };

      const createdPost = await this.createPost(postData);
      
      if (!createdPost.success) {
        throw new Error('Falha ao criar post no banco de dados');
      }

      postId = createdPost.postId;
      console.log('[Send] ✓ ETAPA 2 CONCLUÍDA: Post criado com ID:', postId);

      // ETAPA 3: Salvar referências das mídias no banco
      console.log('[Send] ETAPA 3/3: Salvando referências das mídias...');
      Notificacao.updateProgressMessage('Vinculando mídias ao post...');
      
      const mediaUrls = uploadResults.map((result, index) => ({
        url: result.publicUrl,
        order: index + 1,
        type: Renderer.mediaFiles[index].type
      }));

      await this.saveMediaToDatabase(postId, mediaUrls);
      console.log('[Send] ✓ ETAPA 3 CONCLUÍDA: Mídias salvas no banco');

      // VERIFICAÇÃO FINAL
      console.log('[Send] Realizando verificação final completa...');
      Notificacao.updateProgressMessage('Verificando integridade dos arquivos...');
      
      const finalCheck = await this.verifyAllUploads(uploadedFiles);
      
      if (!finalCheck.success) {
        throw new Error(`Verificação final falhou! ${finalCheck.missingFiles.length} arquivo(s) não encontrado(s) no R2`);
      }

      // SUCESSO TOTAL!
      console.log('[Send] ✓✓✓ AGENDAMENTO CONCLUÍDO COM SUCESSO! ✓✓✓');
      console.log(`[Send] Post ID: ${postId}`);
      console.log(`[Send] Mídias: ${uploadResults.length} arquivo(s)`);
      console.log(`[Send] Status: Todos os arquivos verificados e salvos`);
      
      Notificacao.show(`Post agendado com sucesso! ${uploadResults.length} mídia(s) enviada(s)`, 'success');
      
      setTimeout(() => {
        Renderer.resetForm();
        Notificacao.hideProgress();
      }, 2000);

    } catch (error) {
      console.error('[Send] ✗✗✗ ERRO NO AGENDAMENTO ✗✗✗');
      console.error('[Send]', error);
      
      // ROLLBACK - Desfazer tudo
      Notificacao.show('Erro detectado! Revertendo alterações...', 'warning');
      
      const rollbackResult = await this.rollbackPost(postId, uploadedFiles);
      
      if (rollbackResult.success) {
        Notificacao.show(`Erro: ${error.message}. Todas as alterações foram revertidas.`, 'error');
      } else {
        Notificacao.show(`Erro: ${error.message}. Atenção: algumas alterações podem não ter sido revertidas.`, 'error');
        console.error('[Send] Erros no rollback:', rollbackResult.errors);
      }
      
      Notificacao.hideProgress();
    }
  }
};

// Tornar Send global
window.Send = Send;
