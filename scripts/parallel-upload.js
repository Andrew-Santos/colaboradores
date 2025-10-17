/**
 * ParallelUpload - Upload de arquivos com chunks paralelos otimizado para R2
 * 
 * Características:
 * - Chunks de 40MB (adaptável)
 * - 3 uploads simultâneos (não sobrecarrega)
 * - Retry automático com backoff exponencial
 * - Integração perfeita com window.r2API existente
 * - Sem mudanças no backend
 */

const ParallelUpload = {
  // ===== CONFIGURAÇÕES =====
  CHUNK_SIZE: 40 * 1024 * 1024, // 40MB por chunk (reduz overhead vs 5MB)
  MAX_CONCURRENT: 3, // 3 uploads simultâneos (3.3 Mbps * 3 ≈ 10 Mbps por arquivo)
  MAX_RETRIES: 2, // 2 tentativas é suficiente com boa conexão
  
  // ===== UTILITÁRIOS =====
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

  /**
   * Dividir arquivo em chunks
   */
  createChunks(file) {
    const chunks = [];
    const totalChunks = Math.ceil(file.size / this.CHUNK_SIZE);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * this.CHUNK_SIZE;
      const end = Math.min(start + this.CHUNK_SIZE, file.size);

      chunks.push({
        index: i,
        blob: file.slice(start, end),
        size: end - start,
        start: start,
        end: end
      });
    }

    return chunks;
  },

  /**
   * Upload de um chunk único via presigned URL
   */
  async uploadChunk(chunkBlob, uploadUrl, chunkIndex, totalChunks) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const CHUNK_START = Date.now();
      let lastProgressTime = CHUNK_START;
      let lastLoaded = 0;

      // Timeout: 60 segundos por chunk (40MB a ~3 Mbps = ~100 segundos, com margem)
      xhr.timeout = 120000;

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const now = Date.now();
          const timeDiff = (now - lastProgressTime) / 1000;
          const bytesDiff = e.loaded - lastLoaded;
          const speedBps = timeDiff > 0 ? bytesDiff / timeDiff : 0;
          
          // Log apenas a cada 20% ou 10 segundos
          if (e.loaded === e.total || now - lastProgressTime > 10000 || e.loaded / e.total > 0.2) {
            const progress = (e.loaded / e.total) * 100;
            console.log(`[ParallelUpload] Chunk ${chunkIndex + 1}/${totalChunks}: ${progress.toFixed(0)}% - ${this.formatSpeed(speedBps)}`);
            lastProgressTime = now;
            lastLoaded = e.loaded;
          }
        }
      });

      xhr.addEventListener('load', () => {
        const CHUNK_TIME = Date.now() - CHUNK_START;
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ success: true, time: CHUNK_TIME });
        } else {
          reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Erro de rede no chunk'));
      });

      xhr.addEventListener('timeout', () => {
        reject(new Error('Timeout no chunk (120s)'));
      });

      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.send(chunkBlob);
    });
  },

  /**
   * Upload com retry automático
   */
  async uploadChunkWithRetry(chunkBlob, uploadUrl, chunkIndex, totalChunks) {
    let lastError;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        if (attempt > 1) {
          const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 3000);
          console.warn(`[ParallelUpload] Chunk ${chunkIndex + 1}: Tentativa ${attempt}/${this.MAX_RETRIES}, aguardando ${waitTime}ms...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        return await this.uploadChunk(chunkBlob, uploadUrl, chunkIndex, totalChunks);
      } catch (error) {
        lastError = error;
      }
    }

    throw new Error(`Chunk ${chunkIndex + 1} falhou após ${this.MAX_RETRIES} tentativas: ${lastError.message}`);
  },

  /**
   * Gerenciar fila de uploads paralelos
   */
  async uploadChunksInParallel(chunks, uploadUrls, onProgress = null) {
    const QUEUE_START = Date.now();
    const totalChunks = chunks.length;
    const totalSize = chunks.reduce((acc, c) => acc + c.size, 0);
    let completedChunks = 0;
    let uploadedBytes = 0;

    console.log(`\n[ParallelUpload] Iniciando upload paralelo: ${totalChunks} chunks, máx ${this.MAX_CONCURRENT} simultâneos`);

    const results = [];
    const executing = [];
    let queueIndex = 0;

    const processNext = async () => {
      if (queueIndex >= totalChunks) return;

      const currentIndex = queueIndex++;
      const chunk = chunks[currentIndex];
      const uploadUrl = uploadUrls[currentIndex];

      const promise = this.uploadChunkWithRetry(chunk.blob, uploadUrl, currentIndex, totalChunks)
        .then(result => {
          completedChunks++;
          uploadedBytes += chunk.size;

          const progress = (uploadedBytes / totalSize) * 100;
          const elapsed = (Date.now() - QUEUE_START) / 1000;
          const avgSpeedBps = elapsed > 0 ? uploadedBytes / elapsed : 0;

          if (onProgress) {
            onProgress(progress, completedChunks, totalChunks, avgSpeedBps);
          }

          results[currentIndex] = result;
        })
        .finally(() => {
          executing.splice(executing.indexOf(promise), 1);
          return processNext();
        });

      executing.push(promise);

      if (executing.length >= this.MAX_CONCURRENT) {
        await Promise.race(executing);
      }

      return promise;
    };

    // Iniciar primeiros processsos
    const initialPromises = [];
    for (let i = 0; i < Math.min(this.MAX_CONCURRENT, totalChunks); i++) {
      initialPromises.push(processNext());
    }

    // Aguardar todos
    await Promise.all([...initialPromises, ...executing]);

    const QUEUE_TIME = Date.now() - QUEUE_START;
    const finalSpeed = totalSize / (QUEUE_TIME / 1000);

    console.log(`[ParallelUpload] Todos os chunks concluídos: ${this.formatTime(QUEUE_TIME)} - Velocidade média: ${this.formatSpeed(finalSpeed)}`);

    return { totalTime: QUEUE_TIME, avgSpeedBps: finalSpeed, results };
  },

  /**
   * Função principal: Upload paralelo de arquivo
   */
  async uploadFile(file, fileName, onProgress = null) {
    const TOTAL_START = Date.now();

    try {
      console.log('\n' + '━'.repeat(60));
      console.log(`[ParallelUpload] INICIANDO UPLOAD: ${fileName}`);
      console.log(`[ParallelUpload] Tamanho: ${(file.size / (1024 * 1024)).toFixed(2)} MB`);
      console.log('━'.repeat(60));

      // ETAPA 1: Dividir em chunks
      console.log('\n[ParallelUpload] Etapa 1: Dividindo arquivo em chunks...');
      const chunks = this.createChunks(file);
      console.log(`[ParallelUpload] ${chunks.length} chunks criados (${(this.CHUNK_SIZE / (1024 * 1024)).toFixed(0)}MB cada)`);

      // ETAPA 2: Gerar presigned URLs para cada chunk
      console.log('\n[ParallelUpload] Etapa 2: Gerando presigned URLs...');
      const URL_START = Date.now();

      const urlRequests = chunks.map((chunk, index) => {
        const chunkFileName = `${fileName}.part${index}`;
        return window.r2API.generateUploadUrl(chunkFileName, 'application/octet-stream', chunk.size);
      });

      const urlResults = await Promise.all(urlRequests);
      const URL_TIME = Date.now() - URL_START;

      const failedUrls = urlResults.filter(r => !r.success);
      if (failedUrls.length > 0) {
        throw new Error(`Falha ao gerar ${failedUrls.length} presigned URLs`);
      }

      const uploadUrls = urlResults.map(r => r.uploadUrl);
      console.log(`[ParallelUpload] ${uploadUrls.length} URLs geradas em ${this.formatTime(URL_TIME)}`);

      // ETAPA 3: Upload paralelo
      console.log('\n[ParallelUpload] Etapa 3: Upload paralelo dos chunks...');
      const uploadResult = await this.uploadChunksInParallel(chunks, uploadUrls, onProgress);

      // ETAPA 4: Verificar upload
      console.log('\n[ParallelUpload] Etapa 4: Verificando uploads...');
      const VERIFY_START = Date.now();

      const verifyResults = await Promise.all(
        uploadUrls.map((_, index) => 
          window.r2API.verifyUpload(`${fileName}.part${index}`)
        )
      );

      const VERIFY_TIME = Date.now() - VERIFY_START;
      const failedVerifications = verifyResults.filter((r, i) => !r.success || !r.exists);

      if (failedVerifications.length > 0) {
        throw new Error(`${failedVerifications.length} chunk(s) não verificado(s) no R2`);
      }

      console.log(`[ParallelUpload] Todos os chunks verificados em ${this.formatTime(VERIFY_TIME)}`);

      // RESULTADO FINAL
      const TOTAL_TIME = Date.now() - TOTAL_START;
      const finalSpeed = file.size / (TOTAL_TIME / 1000);

      console.log('\n' + '━'.repeat(60));
      console.log('✅ UPLOAD CONCLUÍDO COM SUCESSO');
      console.log('━'.repeat(60));
      console.log(`[ParallelUpload] Arquivo: ${fileName}`);
      console.log(`[ParallelUpload] Tamanho: ${(file.size / (1024 * 1024)).toFixed(2)} MB`);
      console.log(`[ParallelUpload] Tempo total: ${this.formatTime(TOTAL_TIME)}`);
      console.log(`[ParallelUpload] Velocidade média: ${this.formatSpeed(finalSpeed)}`);
      console.log(`[ParallelUpload] Chunks: ${chunks.length} em ${this.MAX_CONCURRENT} paralelos`);
      console.log('━'.repeat(60) + '\n');

      return {
        success: true,
        fileName: fileName,
        chunks: chunks.length,
        totalTime: TOTAL_TIME,
        avgSpeed: finalSpeed,
        uploadUrls: uploadUrls
      };

    } catch (error) {
      const TOTAL_TIME = Date.now() - TOTAL_START;
      console.error('\n' + '━'.repeat(60));
      console.error('❌ ERRO NO UPLOAD');
      console.error('━'.repeat(60));
      console.error(`[ParallelUpload] Tempo até erro: ${this.formatTime(TOTAL_TIME)}`);
      console.error(`[ParallelUpload] Erro: ${error.message}`);
      console.error('━'.repeat(60) + '\n');

      return {
        success: false,
        error: error.message,
        timeUntilError: TOTAL_TIME
      };
    }
  }
};

// Tornar global
window.ParallelUpload = ParallelUpload;