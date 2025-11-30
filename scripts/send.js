const Send = {
  formatTime(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}min`;
  },

  formatSpeed(bytesPerSecond) {
    const mbps = (bytesPerSecond * 8) / 1000000;
    const kbps = (bytesPerSecond * 8) / 1000;
    if (mbps >= 1) return `${mbps.toFixed(2)} Mbps`;
    return `${kbps.toFixed(2)} Kbps`;
  },

  generatePostFolder(clientId, postId) {
    return `client-${clientId}/post-${postId}`;
  },

  async uploadToR2(file, fileName, onProgress = null) {
    const UPLOAD_START = Date.now();
    
    try {
      if (onProgress) {
        onProgress(0, 0, file.size);
      }

      const urlResult = await window.r2API.generateUploadUrl(
        fileName,
        file.type,
        file.size
      );

      if (!urlResult.success) {
        throw new Error(urlResult.error || 'Erro ao gerar URL de upload');
      }

      const { uploadUrl, publicUrl } = urlResult;

      const XHR_START = Date.now();

      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        let lastProgressTime = XHR_START;
        let lastLoaded = 0;

        if (onProgress) {
          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              const now = Date.now();
              const percentComplete = (e.loaded / e.total) * 100;
              
              const timeDiff = (now - lastProgressTime) / 1000;
              const bytesDiff = e.loaded - lastLoaded;
              const speedBps = timeDiff > 0 ? bytesDiff / timeDiff : 0;
              
              const totalTime = (now - XHR_START) / 1000;
              const avgSpeedBps = totalTime > 0 ? e.loaded / totalTime : 0;
              
              const bytesRemaining = e.total - e.loaded;
              const etaSeconds = avgSpeedBps > 0 ? bytesRemaining / avgSpeedBps : 0;
              
              lastProgressTime = now;
              lastLoaded = e.loaded;
              
              onProgress(percentComplete, e.loaded, e.total, {
                loaded: e.loaded,
                total: e.total,
                speed: this.formatSpeed(avgSpeedBps),
                elapsed: this.formatTime(now - XHR_START),
                eta: this.formatTime(etaSeconds * 1000)
              });
            }
          });
        }

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload falhou: ${xhr.status} - ${xhr.statusText}`));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Erro de rede no upload'));
        });
        
        xhr.addEventListener('timeout', () => {
          reject(new Error('Timeout no upload após 5 minutos'));
        });

        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.timeout = 300000;
        xhr.send(file);
      });

      const verifyResult = await this.verifyWithTimeout(fileName, 30000);

      if (!verifyResult.success || !verifyResult.exists) {
        throw new Error(`Arquivo ${fileName} não foi encontrado no R2`);
      }

      const UPLOAD_END = Date.now();
      const TOTAL_TIME = UPLOAD_END - UPLOAD_START;
      const avgSpeedBps = file.size / (TOTAL_TIME / 1000);

      console.log(`✅ Upload completo: ${fileName} (${this.formatTime(TOTAL_TIME)} - ${this.formatSpeed(avgSpeedBps)})`);

      return {
        success: true,
        path: fileName,
        publicUrl: publicUrl,
        verified: true,
        stats: {
          totalTime: TOTAL_TIME,
          avgSpeedBps: avgSpeedBps
        }
      };

    } catch (error) {
      console.error(`❌ Erro no upload de ${fileName}:`, error.message);
      
      return {
        success: false,
        error: error.message,
        path: fileName
      };
    }
  },

  async verifyWithTimeout(fileName, timeoutMs = 30000) {
    let timeoutId;
    
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Timeout na verificação'));
      }, timeoutMs);
    });
    
    try {
      const result = await Promise.race([
        window.r2API.verifyUpload(fileName),
        timeoutPromise
      ]);
    
      clearTimeout(timeoutId);
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  },

  async uploadMultipleFiles(files, onProgress = null) {
    const BATCH_START = Date.now();
    const uploadResults = [];
    let totalSize = files.reduce((acc, f) => acc + f.file.size, 0);
    let uploadedSize = 0;

    console.log(`📦 Iniciando upload de ${files.length} arquivo(s) - ${(totalSize / (1024 * 1024)).toFixed(2)} MB`);

    for (let i = 0; i < files.length; i++) {
      const { file, fileName } = files[i];

      const fileProgressCallback = onProgress ? (percentage, loaded, total, stats) => {
        const fileProgress = uploadedSize + loaded;
        const totalProgress = 10 + ((fileProgress / totalSize) * 75);
        onProgress(totalProgress, i + 1, files.length, stats);
      } : null;

      const result = await this.uploadToR2(file, fileName, fileProgressCallback);

      if (!result.success) {
        throw new Error(`Falha no upload do arquivo "${file.name}" (${i + 1}/${files.length}): ${result.error}`);
      }

      uploadedSize += file.size;
      uploadResults.push(result);
    }

    if (onProgress) {
      onProgress(85, files.length, files.length);
    }

    const finalVerification = await this.verifyAllUploads(uploadResults.map(r => r.path));

    if (!finalVerification.success) {
      throw new Error(`Verificação final falhou: ${finalVerification.missingFiles.length} arquivo(s) não encontrado(s)`);
    }

    const BATCH_END = Date.now();
    const BATCH_TIME = BATCH_END - BATCH_START;
    const avgSpeedBps = totalSize / (BATCH_TIME / 1000);

    console.log(`✅ Batch completo: ${uploadResults.length} arquivo(s) - ${this.formatTime(BATCH_TIME)} - ${this.formatSpeed(avgSpeedBps)}`);

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
      const result = await window.supabaseAPI.schedulePost(postData);

      if (!result.success) {
        throw new Error(result.error || 'Erro ao criar post');
      }

      console.log(`✅ Post criado: ID ${result.postId}`);
      return result;

    } catch (error) {
      console.error('❌ Erro ao criar post:', error.message);
      throw error;
    }
  },

  async saveMediaToDatabase(postId, mediaUrls) {
    try {
      const result = await window.supabaseAPI.saveMedia(postId, mediaUrls);

      if (!result.success) {
        throw new Error(result.error || 'Erro ao salvar mídias no banco');
      }
      
      console.log(`✅ Mídias salvas: ${result.count} arquivo(s)`);
      return result;
      
    } catch (error) {
      console.error('❌ Erro ao salvar mídias:', error.message);
      throw error;
    }
  },

  async rollbackPost(postId, uploadedFiles = []) {
    console.log(`🔄 Iniciando rollback - Post ID: ${postId || 'N/A'}, Arquivos: ${uploadedFiles.length}`);
    
    const errors = [];

    if (postId) {
      try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${window.CONFIG.API_URL}/api/delete-post/${postId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          console.log('✅ Post e mídias deletados do Supabase');
        } else {
          console.error('❌ Erro ao deletar post do Supabase');
          errors.push('Erro ao deletar post do banco');
        }
      } catch (error) {
        console.error('❌ Erro ao deletar post:', error.message);
        errors.push('Erro ao deletar post: ' + error.message);
      }
    }

    if (uploadedFiles.length > 0) {
      try {
        const deleteResult = await window.r2API.deleteFiles(uploadedFiles);
        
        if (deleteResult.success) {
          console.log('✅ Arquivos deletados do R2');
        } else {
          console.error('❌ Erro ao deletar arquivos do R2:', deleteResult.error);
          errors.push('Erro ao deletar arquivos do R2');
        }
      } catch (error) {
        console.error('❌ Erro ao deletar do R2:', error.message);
        errors.push('Erro ao deletar do R2: ' + error.message);
      }
    }

    if (errors.length > 0) {
      console.warn('⚠️ Rollback concluído com erros:', errors);
      return { success: false, errors };
    }

    console.log('✅ Rollback concluído com sucesso');
    return { success: true };
  },

  async schedulePost() {
    const SCHEDULE_START = Date.now();
    let postId = null;
    let uploadedFiles = [];
    
    try {
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('🚀 INICIANDO AGENDAMENTO DE POST');
      console.log('═══════════════════════════════════════════════════════════════');

      // VALIDAÇÕES
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

      console.log(`✓ Cliente: ${Renderer.selectedClient.users}`);
      console.log(`✓ Tipo: ${Renderer.postType}`);
      console.log(`✓ Mídias: ${Renderer.mediaFiles.length} arquivo(s)`);
      console.log(`✓ Agendamento: ${scheduledDate.toLocaleString('pt-BR')}`);

      Notificacao.show('Iniciando agendamento...', 'info');

      // USAR O SISTEMA MULTI-PROGRESS
      const postFolder = this.generatePostFolder(Renderer.selectedClient.id, Date.now());
      
      const filesToUpload = Renderer.mediaFiles.map((media, index) => {
        const fileExtension = media.file.name.split('.').pop().toLowerCase();
        const fileName = `${postFolder}/file-${index + 1}.${fileExtension}`;

        return { 
          file: media.file, 
          fileName: fileName, 
          originalMedia: media,
          name: media.file.name,
          type: media.file.type,
          size: media.file.size
        };
      });

      // Mostrar interface de progresso multi-arquivo
      Notificacao.multiProgress.show(filesToUpload);

      await new Promise(resolve => setTimeout(resolve, 100));

      // ========================================
      // ETAPA 1: CRIAR POST NO SUPABASE
      // ========================================
      console.log('\n📝 ETAPA 1/3: Criando post no Supabase...');
      
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
      console.log(`✅ Post criado com ID: ${postId}`);

      // ========================================
      // ETAPA 2: UPLOAD DE MÍDIAS PARA R2
      // ========================================
      console.log('\n📤 ETAPA 2/3: Upload de mídias para R2...');
      
      const uploadResults = [];
      
      for (let i = 0; i < filesToUpload.length; i++) {
        const { file, fileName } = filesToUpload[i];
        
        // Marcar arquivo como fazendo upload
        Notificacao.multiProgress.setFileUploading(i);
        
        // Callback de progresso do arquivo
        const fileProgressCallback = (percentage, loaded, total, stats) => {
          Notificacao.multiProgress.updateFileProgress(i, loaded, total, stats.speed || 0);
        };
        
        const result = await this.uploadToR2(file, fileName, fileProgressCallback);
        
        if (!result.success) {
          throw new Error(`Falha no upload do arquivo "${file.name}"`);
        }
        
        uploadResults.push(result);
        uploadedFiles.push(result.path);
        
        // Marcar como concluído
        Notificacao.multiProgress.setFileCompleted(i);
      }
      
      console.log(`✅ Todos os arquivos no R2 verificados`);

      // ========================================
      // ETAPA 3: SALVAR REFERÊNCIAS DAS MÍDIAS
      // ========================================
      console.log('\n💾 ETAPA 3/3: Salvando referências das mídias...');
      
      const mediaUrls = uploadResults.map((result, index) => ({
        url: result.publicUrl,
        order: index + 1,
        type: Renderer.mediaFiles[index].type
      }));

      await this.saveMediaToDatabase(postId, mediaUrls);

      const SCHEDULE_END = Date.now();
      const SCHEDULE_TIME = SCHEDULE_END - SCHEDULE_START;
      const totalSize = filesToUpload.reduce((acc, f) => acc + f.file.size, 0);

      console.log('\n═══════════════════════════════════════════════════════════════');
      console.log('✅✅✅ AGENDAMENTO CONCLUÍDO COM SUCESSO ✅✅✅');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log(`🆔 Post ID: ${postId}`);
      console.log(`📁 Pasta: ${postFolder}`);
      console.log(`📦 Mídias: ${uploadResults.length}`);
      console.log(`📊 Tamanho: ${(totalSize / (1024 * 1024)).toFixed(2)} MB`);
      console.log(`⏱️ Tempo total: ${this.formatTime(SCHEDULE_TIME)}`);
      console.log('═══════════════════════════════════════════════════════════════\n');

      // Aguardar 2 segundos antes de fechar
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      Notificacao.multiProgress.hide();
      Notificacao.show(`Post agendado com sucesso! ${uploadResults.length} mídia(s) enviada(s)`, 'success');
      
      // Resetar formulário após fechar notificação
      setTimeout(() => {
        Renderer.resetForm();
      }, 500);

    } catch (error) {
      const SCHEDULE_END = Date.now();
      const SCHEDULE_TIME = SCHEDULE_END - SCHEDULE_START;

      console.error('\n═══════════════════════════════════════════════════════════════');
      console.error('❌❌❌ ERRO NO AGENDAMENTO ❌❌❌');
      console.error('═══════════════════════════════════════════════════════════════');
      console.error(`⏱️ Tempo até erro: ${this.formatTime(SCHEDULE_TIME)}`);
      console.error(`📋 Erro: ${error.message}`);
      console.error('═══════════════════════════════════════════════════════════════\n');
      
      console.log('🔄 Iniciando rollback completo...');
      
      Notificacao.multiProgress.hide();
      Notificacao.show('Erro detectado! Revertendo alterações...', 'warning');
      
      const rollbackResult = await this.rollbackPost(postId, uploadedFiles);
      
      if (rollbackResult.success) {
        Notificacao.show(`Erro: ${error.message}`, 'error');
        console.log('✅ Rollback completo: todas as alterações foram revertidas');
      } else {
        Notificacao.show(`Erro: ${error.message}. Algumas alterações podem não ter sido revertidas.`, 'error');
        console.error('⚠️ Erros no rollback:', rollbackResult.errors);
      }
    }
  }
};

window.Send = Send;
