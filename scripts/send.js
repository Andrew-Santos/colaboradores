const Send = {
  // Função auxiliar para formatar tempo
  formatTime(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}min`;
  },

  // Função auxiliar para formatar velocidade
  formatSpeed(bytesPerSecond) {
    const mbps = (bytesPerSecond * 8) / 1000000;
    const kbps = (bytesPerSecond * 8) / 1000;
    if (mbps >= 1) return `${mbps.toFixed(2)} Mbps`;
    return `${kbps.toFixed(2)} Kbps`;
  },

  async uploadToR2(file, fileName, onProgress = null) {
    const UPLOAD_START = Date.now();
    
    try {
      console.log('┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓');
      console.log(`[Send] 🚀 INICIO DO UPLOAD: ${fileName}`);
      console.log(`[Send] 📦 Tamanho: ${(file.size / (1024 * 1024)).toFixed(2)} MB`);
      console.log(`[Send] ⏰ Horário: ${new Date().toLocaleTimeString('pt-BR')}`);
      console.log('┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛');

      // Mostrar progresso inicial imediatamente
      if (onProgress) {
        onProgress(0, 0, file.size);
      }

      // ========================================
      // ETAPA 1: GERAR PRESIGNED URL
      // ========================================
      const URL_START = Date.now();
      console.log(`\n[Send] 🔑 ETAPA 1/4: Gerando presigned URL...`);
      console.log(`[Send] ⏰ Início: ${new Date(URL_START).toLocaleTimeString('pt-BR')}`);

      const urlResult = await window.r2API.generateUploadUrl(
        fileName,
        file.type,
        file.size
      );

      const URL_END = Date.now();
      const URL_TIME = URL_END - URL_START;

      if (!urlResult.success) {
        console.error(`[Send] ❌ FALHA ao gerar presigned URL`);
        console.error(`[Send] ⏱️ Tempo até falha: ${this.formatTime(URL_TIME)}`);
        throw new Error(urlResult.error || 'Erro ao gerar URL de upload');
      }

      console.log(`[Send] ✅ Presigned URL obtida com sucesso`);
      console.log(`[Send] ⏱️ Tempo da etapa: ${this.formatTime(URL_TIME)}`);
      console.log(`[Send] ⏰ Fim: ${new Date(URL_END).toLocaleTimeString('pt-BR')}`);

      const { uploadUrl, publicUrl } = urlResult;

      // ========================================
      // ETAPA 2: UPLOAD PARA R2 (PRINCIPAL)
      // ========================================
      const XHR_START = Date.now();
      console.log(`\n[Send] 📤 ETAPA 2/4: UPLOAD PARA R2...`);
      console.log(`[Send] ⏰ Início: ${new Date(XHR_START).toLocaleTimeString('pt-BR')}`);
      console.log(`[Send] 🌐 URL: ${uploadUrl.substring(0, 80)}...`);

      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        let lastProgressTime = XHR_START;
        let lastLoaded = 0;
        let progressCount = 0;

        if (onProgress) {
          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              progressCount++;
              const now = Date.now();
              const percentComplete = (e.loaded / e.total) * 100;
              
              // Calcular velocidade instantânea
              const timeDiff = (now - lastProgressTime) / 1000; // segundos
              const bytesDiff = e.loaded - lastLoaded;
              const speedBps = timeDiff > 0 ? bytesDiff / timeDiff : 0;
              
              // Calcular velocidade média
              const totalTime = (now - XHR_START) / 1000;
              const avgSpeedBps = totalTime > 0 ? e.loaded / totalTime : 0;
              
              // Estimar tempo restante
              const bytesRemaining = e.total - e.loaded;
              const etaSeconds = avgSpeedBps > 0 ? bytesRemaining / avgSpeedBps : 0;
              
              // Log a cada 10% ou a cada 5 segundos
              if (progressCount === 1 || percentComplete % 10 < 1 || (now - lastProgressTime) > 5000) {
                console.log(`[Send] 📊 Progresso: ${percentComplete.toFixed(1)}%`);
                console.log(`[Send]    ├─ Enviado: ${(e.loaded / (1024 * 1024)).toFixed(2)} MB de ${(e.total / (1024 * 1024)).toFixed(2)} MB`);
                console.log(`[Send]    ├─ Velocidade instantânea: ${this.formatSpeed(speedBps)}`);
                console.log(`[Send]    ├─ Velocidade média: ${this.formatSpeed(avgSpeedBps)}`);
                console.log(`[Send]    ├─ Tempo decorrido: ${this.formatTime(now - XHR_START)}`);
                console.log(`[Send]    └─ Tempo estimado restante: ${this.formatTime(etaSeconds * 1000)}`);
              }
              
              lastProgressTime = now;
              lastLoaded = e.loaded;
              
              // Enviar estatísticas detalhadas para a notificação
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
          const XHR_END = Date.now();
          const XHR_TIME = XHR_END - XHR_START;
          const avgSpeedBps = file.size / (XHR_TIME / 1000);
          
          console.log(`\n[Send] 🏁 XHR concluído`);
          console.log(`[Send] ⏱️ Tempo da etapa: ${this.formatTime(XHR_TIME)}`);
          console.log(`[Send] 📊 Velocidade média final: ${this.formatSpeed(avgSpeedBps)}`);
          console.log(`[Send] 🔢 Status HTTP: ${xhr.status}`);
          console.log(`[Send] ⏰ Fim: ${new Date(XHR_END).toLocaleTimeString('pt-BR')}`);
          
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            console.error('[Send] ❌ Status de resposta inválido:', xhr.status);
            console.error('[Send] ❌ Resposta:', xhr.responseText?.substring(0, 200));
            reject(new Error(`Upload falhou: ${xhr.status} - ${xhr.statusText}`));
          }
        });

        xhr.addEventListener('error', (e) => {
          const XHR_ERROR_TIME = Date.now() - XHR_START;
          console.error(`[Send] ❌❌❌ ERRO DE REDE no upload`);
          console.error(`[Send] ⏱️ Tempo até erro: ${this.formatTime(XHR_ERROR_TIME)}`);
          console.error(`[Send] 📋 Detalhes:`, e);
          reject(new Error('Erro de rede no upload'));
        });
        
        xhr.addEventListener('timeout', () => {
          const XHR_TIMEOUT_TIME = Date.now() - XHR_START;
          console.error(`[Send] ⏰⏰⏰ TIMEOUT no upload`);
          console.error(`[Send] ⏱️ Tempo até timeout: ${this.formatTime(XHR_TIMEOUT_TIME)}`);
          console.error(`[Send] ⚙️ Timeout configurado: 5 minutos (300000ms)`);
          reject(new Error('Timeout no upload após 5 minutos'));
        });

        console.log('[Send] 🚀 Abrindo conexão XHR...');
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.timeout = 300000; // 5 minutos
        
        console.log('[Send] 📡 Enviando arquivo...');
        xhr.send(file);
        console.log('[Send] ✓ Requisição XHR enviada, aguardando resposta...');
      });

      // ========================================
      // ETAPA 3: VERIFICAÇÃO DO UPLOAD
      // ========================================
      const VERIFY_START = Date.now();
      console.log(`\n[Send] 🔍 ETAPA 3/4: Verificando se arquivo foi salvo no R2...`);
      console.log(`[Send] ⏰ Início: ${new Date(VERIFY_START).toLocaleTimeString('pt-BR')}`);

      const verifyWithTimeout = async (fileName, timeoutMs = 30000) => {
        console.log(`[Send] ⏲️ Timeout de verificação: ${this.formatTime(timeoutMs)}`);
        
        let timeoutId;
        
        const timeoutPromise = new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            console.error(`[Send] ⏰ Timeout na verificação após ${this.formatTime(timeoutMs)}`);
            reject(new Error('Timeout na verificação'));
          }, timeoutMs);
        });
        
        try {
          const result = await Promise.race([
            window.r2API.verifyUpload(fileName),
            timeoutPromise
          ]);
        
          // ✅ CANCELAR O TIMEOUT SE DEU CERTO
          clearTimeout(timeoutId);
          
          return result;
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      };
      
      const verifyResult = await verifyWithTimeout(fileName, 30000);
      
      const VERIFY_END = Date.now();
      const VERIFY_TIME = VERIFY_END - VERIFY_START;

      if (!verifyResult.success || !verifyResult.exists) {
        console.error(`[Send] ❌ FALHA na verificação`);
        console.error(`[Send] ⏱️ Tempo até falha: ${this.formatTime(VERIFY_TIME)}`);
        throw new Error(`Falha na verificação: arquivo ${fileName} não foi encontrado no R2`);
      }
      
      console.log(`[Send] ✅ Arquivo verificado e confirmado no R2`);
      console.log(`[Send] ⏱️ Tempo da etapa: ${this.formatTime(VERIFY_TIME)}`);
      console.log(`[Send] ⏰ Fim: ${new Date(VERIFY_END).toLocaleTimeString('pt-BR')}`);

      // ========================================
      // ETAPA 4: VALIDAÇÃO FINAL (OPCIONAL)
      // ========================================
      const VALIDATION_START = Date.now();
      console.log(`\n[Send] 🌐 ETAPA 4/4: Validando URL pública...`);
      console.log(`[Send] ⏰ Início: ${new Date(VALIDATION_START).toLocaleTimeString('pt-BR')}`);
      
      try {
        const headResponse = await fetch(publicUrl, { method: 'HEAD' });
        const VALIDATION_END = Date.now();
        const VALIDATION_TIME = VALIDATION_END - VALIDATION_START;
        
        if (!headResponse.ok) {
          console.warn('[Send] ⚠️ URL pública não está acessível imediatamente');
          console.warn(`[Send] 🔢 Status: ${headResponse.status}`);
        } else {
          console.log('[Send] ✅ URL pública acessível');
        }
        console.log(`[Send] ⏱️ Tempo da etapa: ${this.formatTime(VALIDATION_TIME)}`);
        console.log(`[Send] ⏰ Fim: ${new Date(VALIDATION_END).toLocaleTimeString('pt-BR')}`);
      } catch (e) {
        const VALIDATION_END = Date.now();
        const VALIDATION_TIME = VALIDATION_END - VALIDATION_START;
        console.warn('[Send] ⚠️ Não foi possível validar URL pública:', e.message);
        console.log(`[Send] ⏱️ Tempo até erro: ${this.formatTime(VALIDATION_TIME)}`);
      }

      // ========================================
      // RESUMO FINAL
      // ========================================
      const UPLOAD_END = Date.now();
      const TOTAL_TIME = UPLOAD_END - UPLOAD_START;
      const avgSpeedBps = file.size / (TOTAL_TIME / 1000);

      console.log('\n┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓');
      console.log('✅✅✅ UPLOAD COMPLETO COM SUCESSO ✅✅✅');
      console.log('┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛');
      console.log(`[Send] 📦 Arquivo: ${fileName}`);
      console.log(`[Send] 📊 Tamanho: ${(file.size / (1024 * 1024)).toFixed(2)} MB`);
      console.log(`[Send] ⏱️ TEMPO TOTAL: ${this.formatTime(TOTAL_TIME)}`);
      console.log(`[Send] 🚀 Velocidade média: ${this.formatSpeed(avgSpeedBps)}`);
      console.log(`[Send] ⏰ Início: ${new Date(UPLOAD_START).toLocaleTimeString('pt-BR')}`);
      console.log(`[Send] ⏰ Fim: ${new Date(UPLOAD_END).toLocaleTimeString('pt-BR')}`);
      console.log('\n📋 BREAKDOWN POR ETAPA:');
      console.log(`[Send]    1️⃣ Presigned URL: ${this.formatTime(URL_TIME)}`);
      console.log(`[Send]    2️⃣ Upload XHR: ${this.formatTime(Date.now() - XHR_START)}`);
      console.log(`[Send]    3️⃣ Verificação: ${this.formatTime(VERIFY_TIME)}`);
      console.log(`[Send]    4️⃣ Validação: ${this.formatTime(Date.now() - VALIDATION_START)}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      return {
        success: true,
        path: fileName,
        publicUrl: publicUrl,
        verified: true,
        stats: {
          totalTime: TOTAL_TIME,
          uploadTime: Date.now() - XHR_START,
          avgSpeedBps: avgSpeedBps
        }
      };

    } catch (error) {
      const UPLOAD_END = Date.now();
      const TOTAL_TIME = UPLOAD_END - UPLOAD_START;
      
      console.error('\n┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓');
      console.error('❌❌❌ ERRO NO UPLOAD ❌❌❌');
      console.error('┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛');
      console.error(`[Send] 📦 Arquivo: ${fileName}`);
      console.error(`[Send] ⏱️ Tempo até erro: ${this.formatTime(TOTAL_TIME)}`);
      console.error(`[Send] ⏰ Horário do erro: ${new Date(UPLOAD_END).toLocaleTimeString('pt-BR')}`);
      console.error(`[Send] 📋 Erro: ${error.message}`);
      console.error(`[Send] 📚 Stack:`, error.stack);
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      
      return {
        success: false,
        error: error.message,
        path: fileName,
        stats: {
          timeUntilError: TOTAL_TIME
        }
      };
    }
  },

  async uploadMultipleFiles(files, onProgress = null) {
    const BATCH_START = Date.now();
    const uploadResults = [];
    const failedUploads = [];
    let totalSize = files.reduce((acc, f) => acc + f.file.size, 0);
    let uploadedSize = 0;

    console.log('\n╔═══════════════════════════════════════════════════════╗');
    console.log('║   INICIANDO BATCH DE UPLOADS                       ║');
    console.log('╚═══════════════════════════════════════════════════════╝');
    console.log(`[Send] 📦 Total de arquivos: ${files.length}`);
    console.log(`[Send] 📊 Tamanho total: ${(totalSize / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`[Send] ⏰ Início do batch: ${new Date(BATCH_START).toLocaleTimeString('pt-BR')}`);
    console.log('');

    // Mostrar progresso inicial
    if (onProgress) {
      onProgress(1, 0, files.length);
    }

    for (let i = 0; i < files.length; i++) {
      const { file, fileName } = files[i];
      const FILE_START = Date.now();

      console.log(`\n╭─────────────────────────────────────────────────────╮`);
      console.log(`│ ARQUIVO ${i + 1} DE ${files.length}`);
      console.log(`╰─────────────────────────────────────────────────────╯`);
      console.log(`[Send] 📄 Nome: ${fileName}`);
      console.log(`[Send] 📊 Tamanho: ${(file.size / (1024 * 1024)).toFixed(2)} MB`);
      console.log(`[Send] 📈 Progresso geral: ${((uploadedSize / totalSize) * 100).toFixed(1)}%`);

      const fileProgressCallback = onProgress ? (percentage, loaded, total, stats) => {
        const fileProgress = uploadedSize + loaded;
        const totalProgress = (fileProgress / totalSize) * 80;
        onProgress(totalProgress, i + 1, files.length, stats);
      } : null;

      const result = await this.uploadToR2(file, fileName, fileProgressCallback);

      const FILE_END = Date.now();
      const FILE_TIME = FILE_END - FILE_START;

      if (!result.success) {
        console.error(`\n❌ FALHA NO ARQUIVO ${i + 1}/${files.length}`);
        console.error(`[Send] ⏱️ Tempo até falha: ${this.formatTime(FILE_TIME)}`);
        console.error(`[Send] 📋 Erro: ${result.error}`);
        
        failedUploads.push({
          fileName,
          index: i + 1,
          error: result.error,
          time: FILE_TIME
        });
        
        throw new Error(`Falha no upload do arquivo "${file.name}" (${i + 1}/${files.length}): ${result.error}`);
      }

      uploadedSize += file.size;
      uploadResults.push(result);
      
      console.log(`\n✅ ARQUIVO ${i + 1}/${files.length} CONCLUÍDO`);
      console.log(`[Send] ⏱️ Tempo deste arquivo: ${this.formatTime(FILE_TIME)}`);
      console.log(`[Send] 📈 Progresso do batch: ${((uploadedSize / totalSize) * 100).toFixed(1)}%`);
    }

    // VERIFICAÇÃO FINAL
    const VERIFY_ALL_START = Date.now();
    console.log(`\n╔═══════════════════════════════════════════════════════╗`);
    console.log(`║   VERIFICAÇÃO FINAL DE TODOS OS ARQUIVOS           ║`);
    console.log(`╚═══════════════════════════════════════════════════════╝`);
    console.log(`[Send] ⏰ Início: ${new Date(VERIFY_ALL_START).toLocaleTimeString('pt-BR')}`);
    
    const finalVerification = await this.verifyAllUploads(uploadResults.map(r => r.path));
    
    const VERIFY_ALL_END = Date.now();
    const VERIFY_ALL_TIME = VERIFY_ALL_END - VERIFY_ALL_START;

    if (!finalVerification.success) {
      console.error(`[Send] ❌ Verificação final falhou`);
      console.error(`[Send] ⏱️ Tempo de verificação: ${this.formatTime(VERIFY_ALL_TIME)}`);
      console.error(`[Send] 📋 Arquivos ausentes:`, finalVerification.missingFiles);
      throw new Error(`Verificação final falhou: ${finalVerification.missingFiles.length} arquivo(s) não encontrado(s)`);
    }

    console.log(`[Send] ✅ Todos os arquivos verificados`);
    console.log(`[Send] ⏱️ Tempo de verificação: ${this.formatTime(VERIFY_ALL_TIME)}`);

    const BATCH_END = Date.now();
    const BATCH_TIME = BATCH_END - BATCH_START;
    const avgSpeedBps = totalSize / (BATCH_TIME / 1000);

    console.log(`\n╔═══════════════════════════════════════════════════════╗`);
    console.log(`║   BATCH COMPLETO COM SUCESSO                       ║`);
    console.log(`╚═══════════════════════════════════════════════════════╝`);
    console.log(`[Send] 📦 Arquivos enviados: ${uploadResults.length}/${files.length}`);
    console.log(`[Send] 📊 Total enviado: ${(totalSize / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`[Send] ⏱️ TEMPO TOTAL DO BATCH: ${this.formatTime(BATCH_TIME)}`);
    console.log(`[Send] 🚀 Velocidade média: ${this.formatSpeed(avgSpeedBps)}`);
    console.log(`[Send] ⏰ Início: ${new Date(BATCH_START).toLocaleTimeString('pt-BR')}`);
    console.log(`[Send] ⏰ Fim: ${new Date(BATCH_END).toLocaleTimeString('pt-BR')}`);
    console.log('');

    return uploadResults;
  },

  async verifyAllUploads(fileNames) {
    const VERIFY_START = Date.now();
    const missingFiles = [];
    
    console.log(`[Send] 🔍 Verificando ${fileNames.length} arquivo(s)...`);
    
    for (const fileName of fileNames) {
      try {
        const result = await window.r2API.verifyUpload(fileName);
        if (!result.exists) {
          console.error(`[Send] ❌ Arquivo ausente: ${fileName}`);
          missingFiles.push(fileName);
        } else {
          console.log(`[Send] ✓ ${fileName}`);
        }
      } catch (error) {
        console.error(`[Send] ❌ Erro ao verificar ${fileName}:`, error);
        missingFiles.push(fileName);
      }
    }

    const VERIFY_END = Date.now();
    const VERIFY_TIME = VERIFY_END - VERIFY_START;

    console.log(`[Send] ⏱️ Tempo de verificação: ${this.formatTime(VERIFY_TIME)}`);

    return {
      success: missingFiles.length === 0,
      missingFiles,
      totalChecked: fileNames.length
    };
  },

  async createPost(postData) {
    const POST_START = Date.now();
    
    try {
      console.log('\n[Send] 📝 Criando post no backend...');
      console.log('[Send] ⏰ Início:', new Date(POST_START).toLocaleTimeString('pt-BR'));
      console.log('[Send] 📋 Dados:', postData);

      const result = await window.supabaseAPI.schedulePost(postData);

      const POST_END = Date.now();
      const POST_TIME = POST_END - POST_START;

      if (!result.success) {
        console.error('[Send] ❌ Erro ao criar post');
        console.error('[Send] ⏱️ Tempo até erro:', this.formatTime(POST_TIME));
        throw new Error(result.error || 'Erro ao criar post');
      }

      console.log('[Send] ✅ Post criado com sucesso');
      console.log('[Send] 🆔 Post ID:', result.postId);
      console.log('[Send] ⏱️ Tempo:', this.formatTime(POST_TIME));
      console.log('[Send] ⏰ Fim:', new Date(POST_END).toLocaleTimeString('pt-BR'));

      return result;

    } catch (error) {
      const POST_END = Date.now();
      console.error('[Send] ❌ Erro ao criar post:', error);
      console.error('[Send] ⏱️ Tempo até erro:', this.formatTime(POST_END - POST_START));
      throw error;
    }
  },

  async saveMediaToDatabase(postId, mediaUrls) {
    const MEDIA_START = Date.now();
    
    try {
      console.log('\n[Send] 💾 Salvando URLs das mídias no banco...');
      console.log('[Send] ⏰ Início:', new Date(MEDIA_START).toLocaleTimeString('pt-BR'));
      console.log('[Send] 🆔 Post ID:', postId);
      console.log('[Send] 📊 Quantidade de mídias:', mediaUrls.length);
      
      const result = await window.supabaseAPI.saveMedia(postId, mediaUrls);
      
      const MEDIA_END = Date.now();
      const MEDIA_TIME = MEDIA_END - MEDIA_START;

      if (!result.success) {
        console.error('[Send] ❌ Erro ao salvar mídias');
        console.error('[Send] ⏱️ Tempo até erro:', this.formatTime(MEDIA_TIME));
        throw new Error(result.error || 'Erro ao salvar mídias no banco');
      }
      
      console.log('[Send] ✅ Mídias salvas com sucesso');
      console.log('[Send] 📊 Quantidade salva:', result.count);
      console.log('[Send] ⏱️ Tempo:', this.formatTime(MEDIA_TIME));
      console.log('[Send] ⏰ Fim:', new Date(MEDIA_END).toLocaleTimeString('pt-BR'));
      
      return result;
      
    } catch (error) {
      const MEDIA_END = Date.now();
      console.error('[Send] ❌ Erro ao salvar mídias:', error);
      console.error('[Send] ⏱️ Tempo até erro:', this.formatTime(MEDIA_END - MEDIA_START));
      throw error;
    }
  },

  async rollbackPost(postId, uploadedFiles = []) {
    const ROLLBACK_START = Date.now();
    
    console.log('\n╔═══════════════════════════════════════════════════════╗');
    console.log('║   INICIANDO ROLLBACK                               ║');
    console.log('╚═══════════════════════════════════════════════════════╝');
    console.log(`[Send] ⏰ Início: ${new Date(ROLLBACK_START).toLocaleTimeString('pt-BR')}`);
    console.log(`[Send] 🆔 Post ID: ${postId || 'N/A'}`);
    console.log(`[Send] 📦 Arquivos para deletar: ${uploadedFiles.length}`);
    
    const errors = [];

    // 1. Deletar arquivos do R2
    if (uploadedFiles.length > 0) {
      try {
        const DELETE_R2_START = Date.now();
        console.log(`\n[Send] 🗑️ Deletando ${uploadedFiles.length} arquivo(s) do R2...`);
        
        const deleteResult = await window.r2API.deleteFiles(uploadedFiles);
        
        const DELETE_R2_END = Date.now();
        const DELETE_R2_TIME = DELETE_R2_END - DELETE_R2_START;
        
        if (deleteResult.success) {
          console.log('[Send] ✅ Arquivos deletados do R2');
          console.log(`[Send] ⏱️ Tempo: ${this.formatTime(DELETE_R2_TIME)}`);
        } else {
          console.error('[Send] ❌ Erro ao deletar arquivos do R2:', deleteResult.error);
          console.error(`[Send] ⏱️ Tempo: ${this.formatTime(DELETE_R2_TIME)}`);
          errors.push('Erro ao deletar arquivos do R2');
        }
      } catch (error) {
        console.error('[Send] ❌ Erro ao deletar do R2:', error);
        errors.push('Erro ao deletar do R2: ' + error.message);
      }
    }

    // 2. Deletar post do Supabase
    if (postId) {
      try {
        const DELETE_POST_START = Date.now();
        console.log('\n[Send] 🗑️ Deletando post do Supabase...');
        
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${window.CONFIG.API_URL}/api/delete-post/${postId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        const DELETE_POST_END = Date.now();
        const DELETE_POST_TIME = DELETE_POST_END - DELETE_POST_START;

        if (response.ok) {
          console.log('[Send] ✅ Post deletado do Supabase');
          console.log(`[Send] ⏱️ Tempo: ${this.formatTime(DELETE_POST_TIME)}`);
        } else {
          console.error('[Send] ❌ Erro ao deletar post do Supabase');
          console.error(`[Send] ⏱️ Tempo: ${this.formatTime(DELETE_POST_TIME)}`);
          errors.push('Erro ao deletar post do banco');
        }
      } catch (error) {
        console.error('[Send] ❌ Erro ao deletar post:', error);
        errors.push('Erro ao deletar post: ' + error.message);
      }
    }

    const ROLLBACK_END = Date.now();
    const ROLLBACK_TIME = ROLLBACK_END - ROLLBACK_START;

    if (errors.length > 0) {
      console.warn('\n⚠️ ROLLBACK CONCLUÍDO COM ERROS');
      console.warn(`[Send] ⏱️ Tempo total: ${this.formatTime(ROLLBACK_TIME)}`);
      console.warn('[Send] 📋 Erros:', errors);
      return { success: false, errors };
    }

    console.log('\n✅ ROLLBACK CONCLUÍDO COM SUCESSO');
    console.log(`[Send] ⏱️ Tempo total: ${this.formatTime(ROLLBACK_TIME)}`);
    console.log(`[Send] ⏰ Fim: ${new Date(ROLLBACK_END).toLocaleTimeString('pt-BR')}`);
    
    return { success: true };
  },

  async schedulePost() {
    const SCHEDULE_START = Date.now();
    let postId = null;
    let uploadedFiles = [];
    
    try {
      console.log('\n');
      console.log('╔══════════════════════════════════════════════════════════════╗');
      console.log('║                                                          ║');
      console.log('║           INICIANDO AGENDAMENTO DE POST                  ║');
      console.log('║                                                          ║');
      console.log('╚══════════════════════════════════════════════════════════════╝');
      console.log(`[Send] ⏰ Horário de início: ${new Date(SCHEDULE_START).toLocaleTimeString('pt-BR')}`);
      console.log('');

      // ========================================
      // VALIDAÇÕES
      // ========================================
      console.log('[Send] 🔍 VALIDANDO DADOS...');
      const VALIDATION_START = Date.now();

      if (!Renderer.selectedClient || !Renderer.selectedClient.id) {
        throw new Error('Selecione um cliente');
      }
      console.log('[Send] ✓ Cliente selecionado:', Renderer.selectedClient.users);

      if (!Renderer.postType) {
        throw new Error('Selecione o tipo de postagem');
      }
      console.log('[Send] ✓ Tipo de post:', Renderer.postType);

      if (Renderer.mediaFiles.length === 0) {
        throw new Error('Adicione pelo menos uma mídia');
      }
      console.log('[Send] ✓ Mídias:', Renderer.mediaFiles.length, 'arquivo(s)');

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
      console.log('[Send] ✓ Data de agendamento:', scheduledDate.toLocaleString('pt-BR'));

      const caption = document.getElementById('caption').value || '';
      if (caption.length > 2200) {
        throw new Error('Legenda excede o limite de 2200 caracteres');
      }
      console.log('[Send] ✓ Legenda:', caption.length, 'caracteres');

      const VALIDATION_END = Date.now();
      const VALIDATION_TIME = VALIDATION_END - VALIDATION_START;

      console.log(`[Send] ✅ Validações OK (${this.formatTime(VALIDATION_TIME)})`);
      console.log('');

      Notificacao.show('Iniciando agendamento...', 'info');

      // Mostrar progresso inicial
      Notificacao.showProgress(0, 0, Renderer.mediaFiles.length);
      Notificacao.updateProgressMessage('Preparando arquivos para upload...');

      // Pequena pausa para UI
      await new Promise(resolve => setTimeout(resolve, 100));

      // ========================================
      // ETAPA 1: UPLOAD DE MÍDIAS PARA R2
      // ========================================
      console.log('╔═══════════════════════════════════════════════════════════════╗');
      console.log('║   ETAPA 1/3: UPLOAD DE MÍDIAS PARA R2                    ║');
      console.log('╚═══════════════════════════════════════════════════════════════╝');
      
      const UPLOAD_START = Date.now();
      console.log(`[Send] ⏰ Início: ${new Date(UPLOAD_START).toLocaleTimeString('pt-BR')}`);
      console.log(`[Send] 📦 Arquivos: ${Renderer.mediaFiles.length}`);
      
      const totalSize = Renderer.mediaFiles.reduce((acc, m) => acc + m.file.size, 0);
      console.log(`[Send] 📊 Tamanho total: ${(totalSize / (1024 * 1024)).toFixed(2)} MB`);
      console.log('');

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

      const onProgress = (percentage, current, total, stats) => {
        Notificacao.showProgress(percentage, current, total, stats);
      };

      const uploadResults = await this.uploadMultipleFiles(filesToUpload, onProgress);
      uploadedFiles = uploadResults.map(r => r.path);
      
      const UPLOAD_END = Date.now();
      const UPLOAD_TIME = UPLOAD_END - UPLOAD_START;

      console.log('');
      console.log('✅ ETAPA 1 CONCLUÍDA: Todos os arquivos no R2 e verificados');
      console.log(`[Send] ⏱️ Tempo da etapa: ${this.formatTime(UPLOAD_TIME)}`);
      console.log(`[Send] ⏰ Fim: ${new Date(UPLOAD_END).toLocaleTimeString('pt-BR')}`);
      console.log('');

      // ========================================
      // ETAPA 2: CRIAR POST NO SUPABASE
      // ========================================
      console.log('╔═══════════════════════════════════════════════════════════════╗');
      console.log('║   ETAPA 2/3: CRIAR POST NO SUPABASE                      ║');
      console.log('╚═══════════════════════════════════════════════════════════════╝');
      
      const CREATE_POST_START = Date.now();
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
      
      const CREATE_POST_END = Date.now();
      const CREATE_POST_TIME = CREATE_POST_END - CREATE_POST_START;

      console.log('');
      console.log('✅ ETAPA 2 CONCLUÍDA: Post criado com ID:', postId);
      console.log(`[Send] ⏱️ Tempo da etapa: ${this.formatTime(CREATE_POST_TIME)}`);
      console.log(`[Send] ⏰ Fim: ${new Date(CREATE_POST_END).toLocaleTimeString('pt-BR')}`);
      console.log('');
      
      // Atualizar progresso: Post criado = 90%
      Notificacao.showProgress(90, uploadResults.length, uploadResults.length);

      // ========================================
      // ETAPA 3: SALVAR REFERÊNCIAS DAS MÍDIAS
      // ========================================
      console.log('╔═══════════════════════════════════════════════════════════════╗');
      console.log('║   ETAPA 3/3: SALVAR REFERÊNCIAS DAS MÍDIAS              ║');
      console.log('╚═══════════════════════════════════════════════════════════════╝');
      
      const SAVE_MEDIA_START = Date.now();
      Notificacao.updateProgressMessage('Vinculando mídias ao post...');
      
      const mediaUrls = uploadResults.map((result, index) => ({
        url: result.publicUrl,
        order: index + 1,
        type: Renderer.mediaFiles[index].type
      }));

      await this.saveMediaToDatabase(postId, mediaUrls);
      
      const SAVE_MEDIA_END = Date.now();
      const SAVE_MEDIA_TIME = SAVE_MEDIA_END - SAVE_MEDIA_START;

      console.log('');
      console.log('✅ ETAPA 3 CONCLUÍDA: Mídias salvas no banco');
      console.log(`[Send] ⏱️ Tempo da etapa: ${this.formatTime(SAVE_MEDIA_TIME)}`);
      console.log(`[Send] ⏰ Fim: ${new Date(SAVE_MEDIA_END).toLocaleTimeString('pt-BR')}`);
      console.log('');
      
      // Atualizar progresso: Mídias salvas = 95%
      Notificacao.showProgress(95, uploadResults.length, uploadResults.length);

      // ========================================
      // VERIFICAÇÃO FINAL
      // ========================================
      console.log('╔═══════════════════════════════════════════════════════════════╗');
      console.log('║   VERIFICAÇÃO FINAL                                      ║');
      console.log('╚═══════════════════════════════════════════════════════════════╝');
      
      const FINAL_VERIFY_START = Date.now();
      Notificacao.updateProgressMessage('Verificando integridade dos arquivos...');
      
      const finalCheck = await this.verifyAllUploads(uploadedFiles);
      
      const FINAL_VERIFY_END = Date.now();
      const FINAL_VERIFY_TIME = FINAL_VERIFY_END - FINAL_VERIFY_START;

      if (!finalCheck.success) {
        throw new Error(`Verificação final falhou! ${finalCheck.missingFiles.length} arquivo(s) não encontrado(s) no R2`);
      }

      console.log('');
      console.log('✅ VERIFICAÇÃO FINAL CONCLUÍDA');
      console.log(`[Send] ⏱️ Tempo: ${this.formatTime(FINAL_VERIFY_TIME)}`);
      console.log('');

      // ========================================
      // SUCESSO TOTAL!
      // ========================================
      const SCHEDULE_END = Date.now();
      const SCHEDULE_TIME = SCHEDULE_END - SCHEDULE_START;

      console.log('');
      console.log('╔══════════════════════════════════════════════════════════════╗');
      console.log('║                                                          ║');
      console.log('║   ✅✅✅ AGENDAMENTO CONCLUÍDO COM SUCESSO ✅✅✅         ║');
      console.log('║                                                          ║');
      console.log('╚══════════════════════════════════════════════════════════════╝');
      console.log('');
      console.log('📊 RESUMO GERAL:');
      console.log(`[Send] 🆔 Post ID: ${postId}`);
      console.log(`[Send] 📦 Mídias enviadas: ${uploadResults.length}`);
      console.log(`[Send] 📊 Tamanho total: ${(totalSize / (1024 * 1024)).toFixed(2)} MB`);
      console.log(`[Send] ⏱️ TEMPO TOTAL: ${this.formatTime(SCHEDULE_TIME)}`);
      console.log(`[Send] ⏰ Início: ${new Date(SCHEDULE_START).toLocaleTimeString('pt-BR')}`);
      console.log(`[Send] ⏰ Fim: ${new Date(SCHEDULE_END).toLocaleTimeString('pt-BR')}`);
      console.log('');
      console.log('📋 BREAKDOWN POR ETAPA:');
      console.log(`[Send]    ✓ Validações: ${this.formatTime(VALIDATION_TIME)}`);
      console.log(`[Send]    1️⃣ Upload de mídias: ${this.formatTime(UPLOAD_TIME)}`);
      console.log(`[Send]    2️⃣ Criar post: ${this.formatTime(CREATE_POST_TIME)}`);
      console.log(`[Send]    3️⃣ Salvar mídias: ${this.formatTime(SAVE_MEDIA_TIME)}`);
      console.log(`[Send]    🔍 Verificação final: ${this.formatTime(FINAL_VERIFY_TIME)}`);
      console.log('');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('');

      // Atualizar para 100%
      Notificacao.showProgress(100, uploadResults.length, uploadResults.length);
      Notificacao.updateProgressMessage(`✓ Concluído! ${uploadResults.length} mídia(s)`);
      
      // Aguardar antes de mostrar alerta de conclusão
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Mostrar alerta de conclusão que só some ao tocar
      Notificacao.showCompletionAlert(
        true, 
        `Post agendado com sucesso!`,
        `${uploadResults.length} mídia(s) enviada(s) • ${this.formatTime(SCHEDULE_TIME)}`
      );
      
      // Resetar formulário após fechar o alerta
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

      console.error('');
      console.error('╔══════════════════════════════════════════════════════════════╗');
      console.error('║                                                          ║');
      console.error('║   ❌❌❌ ERRO NO AGENDAMENTO ❌❌❌                       ║');
      console.error('║                                                          ║');
      console.error('╚══════════════════════════════════════════════════════════════╝');
      console.error('');
      console.error(`[Send] ⏱️ Tempo até erro: ${this.formatTime(SCHEDULE_TIME)}`);
      console.error(`[Send] ⏰ Horário do erro: ${new Date(SCHEDULE_END).toLocaleTimeString('pt-BR')}`);
      console.error(`[Send] 📋 Mensagem: ${error.message}`);
      console.error(`[Send] 📚 Stack:`, error.stack);
      console.error('');
      
      // ROLLBACK
      console.error('🔄 Iniciando rollback para reverter alterações...');
      Notificacao.show('Erro detectado! Revertendo alterações...', 'warning');
      
      const rollbackResult = await this.rollbackPost(postId, uploadedFiles);
      
      if (rollbackResult.success) {
        Notificacao.showCompletionAlert(
          false,
          'Erro no agendamento',
          error.message
        );
      } else {
        Notificacao.showCompletionAlert(
          false,
          'Erro no agendamento',
          error.message + ' (Algumas alterações podem não ter sido revertidas)'
        );
        console.error('[Send] Erros no rollback:', rollbackResult.errors);
      }
    }
  }
};

// Tornar Send global
window.Send = Send;
