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
    return `client_${clientId}/post_${postId}`;
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
        // Progresso do upload vai de 10% a 85% (75% do total)
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

    // Progresso: 85% após todos os uploads
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

    // 1. Deletar post do Supabase (CASCADE vai deletar as mídias automaticamente)
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

    // 2. Deletar arquivos do R2
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
      
      // Progresso: 0% - Iniciando
      Notificacao.showProgress(0, 0, Renderer.mediaFiles.length);
      Notificacao.updateProgressMessage('Preparando post...');

      await new Promise(resolve => setTimeout(resolve, 100));

      // ========================================
      // ETAPA 1: CRIAR POST NO SUPABASE (5%)
      // ========================================
      console.log('\n📝 ETAPA 1/3: Criando post no Supabase...');
      
      Notificacao.showProgress(5, 0, Renderer.mediaFiles.length);
      Notificacao.updateProgressMessage('Criando registro do post...');
      
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

      // Progresso: 10% - Post criado
      Notificacao.showProgress(10, 0, Renderer.mediaFiles.length);
      Notificacao.updateProgressMessage('Post criado! Iniciando upload...');

      // ========================================
      // ETAPA 2: UPLOAD DE MÍDIAS PARA R2 (10% → 85%)
      // ========================================
      console.log('\n📤 ETAPA 2/3: Upload de mídias para R2...');
      
      const postFolder = this.generatePostFolder(Renderer.selectedClient.id, postId);
      console.log(`📁 Pasta: ${postFolder}`);
      
      const totalSize = Renderer.mediaFiles.reduce((acc, m) => acc + m.file.size, 0);
      console.log(`📊 Tamanho total: ${(totalSize / (1024 * 1024)).toFixed(2)} MB`);

      const filesToUpload = Renderer.mediaFiles.map((media, index) => {
        const fileExtension = media.file.name.split('.').pop().toLowerCase();
        const fileName = `${postFolder}/file_${index + 1}.${fileExtension}`;

        return { 
          file: media.file, 
          fileName: fileName, 
          originalMedia: media 
        };
      });

      const onProgress = (percentage, current, total, stats) => {
        Notificacao.showProgress(percentage, current, total, stats);
      };

      const uploadResults = await this.uploadMultipleFiles(filesToUpload, onProgress);
      uploadedFiles = uploadResults.map(r => r.path);
      
      console.log(`✅ Todos os arquivos no R2 verificados`);

      // Progresso: 90% - Uploads completos, salvando mídias
      Notificacao.showProgress(90, Renderer.mediaFiles.length, Renderer.mediaFiles.length);
      Notificacao.updateProgressMessage('Uploads completos! Vinculando mídias...');

      // ========================================
      // ETAPA 3: SALVAR REFERÊNCIAS DAS MÍDIAS (90% → 95%)
      // ========================================
      console.log('\n💾 ETAPA 3/3: Salvando referências das mídias...');
      
      const mediaUrls = uploadResults.map((result, index) => ({
        url: result.publicUrl,
        order: index + 1,
        type: Renderer.mediaFiles[index].type
      }));

      await this.saveMediaToDatabase(postId, mediaUrls);
      
      // Progresso: 95% - Mídias salvas, verificando integridade
      Notificacao.showProgress(95, Renderer.mediaFiles.length, Renderer.mediaFiles.length);
      Notificacao.updateProgressMessage('Verificando integridade final...');

      // ========================================
      // VERIFICAÇÃO FINAL (95% → 98%)
      // ========================================
      const finalCheck = await this.verifyAllUploads(uploadedFiles);

      if (!finalCheck.success) {
        throw new Error(`Verificação final falhou! ${finalCheck.missingFiles.length} arquivo(s) não encontrado(s) no R2`);
      }

      // Progresso: 98% - Verificação completa
      Notificacao.showProgress(98, Renderer.mediaFiles.length, Renderer.mediaFiles.length);
      Notificacao.updateProgressMessage('Finalizando...');

      const SCHEDULE_END = Date.now();
      const SCHEDULE_TIME = SCHEDULE_END - SCHEDULE_START;

      console.log('\n═══════════════════════════════════════════════════════════════');
      console.log('✅✅✅ AGENDAMENTO CONCLUÍDO COM SUCESSO ✅✅✅');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log(`🆔 Post ID: ${postId}`);
      console.log(`📁 Pasta: ${postFolder}`);
      console.log(`📦 Mídias: ${uploadResults.length}`);
      console.log(`📊 Tamanho: ${(totalSize / (1024 * 1024)).toFixed(2)} MB`);
      console.log(`⏱️ Tempo total: ${this.formatTime(SCHEDULE_TIME)}`);
      console.log('═══════════════════════════════════════════════════════════════\n');

      // Progresso: 100% - TUDO CONCLUÍDO!
      Notificacao.showProgress(100, uploadResults.length, uploadResults.length);
      Notificacao.updateProgressMessage(`✓ Concluído! ${uploadResults.length} mídia(s)`);
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      Notificacao.showCompletionAlert(
        true, 
        `Post agendado com sucesso!`,
        `${uploadResults.length} mídia(s) enviada(s) • ${this.formatTime(SCHEDULE_TIME)}`
      );
      
      const waitForClose = setInterval(() => {
        const container = document.getElementById('progress-container');
        if (!container || !container.classList.contains('show')) {
          clearInterval(waitForClose);
          Renderer.resetForm();
        }
      }, 100);

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
      Notificacao.show('Erro detectado! Revertendo todas as alterações...', 'warning');
      
      const rollbackResult = await this.rollbackPost(postId, uploadedFiles);
      
      if (rollbackResult.success) {
        Notificacao.showCompletionAlert(
          false,
          'Erro no agendamento',
          error.message
        );
        console.log('✅ Rollback completo: todas as alterações foram revertidas');
      } else {
        Notificacao.showCompletionAlert(
          false,
          'Erro no agendamento',
          error.message + ' (Algumas alterações podem não ter sido revertidas)'
        );
        console.error('⚠️ Erros no rollback:', rollbackResult.errors);
      }
    }
  }
};

window.Send = Send;
