/**
 * ParallelUpload - Upload paralelo com Multipart do R2
 * 
 * Fluxo:
 * 1. Iniciar sessão multipart (uploadId)
 * 2. Dividir arquivo em chunks
 * 3. Fazer upload paralelo dos chunks
 * 4. Registrar ETags de cada chunk
 * 5. Completar multipart (juntar tudo)
 */

const ParallelUpload = {
  CHUNK_SIZE: 40 * 1024 * 1024, // 40MB
  MAX_CONCURRENT: 3,
  MAX_RETRIES: 2,
  
  formatTime(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}min`;
  },

  formatSpeed(bytesPerSecond) {
    const mbps = (bytesPerSecond * 8) / 1000000;
    if (mbps >= 1) return `${mbps.toFixed(2)} Mbps`;
    return `${((bytesPerSecond * 8) / 1000).toFixed(2)} Kbps`;
  },

  createChunks(file) {
    const chunks = [];
    const totalChunks = Math.ceil(file.size / this.CHUNK_SIZE);

    for (let i = 0; i < totalChunks; i++) {
      const start = i * this.CHUNK_SIZE;
      const end = Math.min(start + this.CHUNK_SIZE, file.size);

      chunks.push({
        index: i,
        partNumber: i + 1, // R2 usa 1-based indexing
        blob: file.slice(start, end),
        size: end - start
      });
    }

    return chunks;
  },

  async uploadChunk(chunkBlob, uploadUrl, partNumber, totalChunks) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const CHUNK_START = Date.now();

      xhr.timeout = 120000;

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = (e.loaded / e.total) * 100;
          if (progress % 25 < 1 || e.loaded === e.total) {
            const speedBps = e.loaded / ((Date.now() - CHUNK_START) / 1000);
            console.log(`[ParallelUpload] Part ${partNumber}/${totalChunks}: ${progress.toFixed(0)}% - ${this.formatSpeed(speedBps)}`);
          }
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          // Extrair ETag do response header
          const eTag = xhr.getResponseHeader('ETag');
          console.log(`[ParallelUpload] Part ${partNumber} completo (ETag: ${eTag})`);
          resolve({ 
            success: true, 
            partNumber: partNumber,
            eTag: eTag,
            time: Date.now() - CHUNK_START 
          });
        } else {
          reject(new Error(`HTTP ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Erro de rede')));
      xhr.addEventListener('timeout', () => reject(new Error('Timeout')));

      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.send(chunkBlob);
    });
  },

  async uploadChunkWithRetry(chunkBlob, uploadUrl, partNumber, totalChunks) {
    let lastError;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        if (attempt > 1) {
          const wait = Math.min(1000 * Math.pow(2, attempt - 1), 3000);
          console.warn(`[ParallelUpload] Part ${partNumber}: Tentativa ${attempt}/${this.MAX_RETRIES}, aguardando ${wait}ms`);
          await new Promise(resolve => setTimeout(resolve, wait));
        }
        return await this.uploadChunk(chunkBlob, uploadUrl, partNumber, totalChunks);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  },

  async uploadChunksInParallel(chunks, uploadId, onProgress = null) {
    const QUEUE_START = Date.now();
    const totalChunks = chunks.length;
    const totalSize = chunks.reduce((acc, c) => acc + c.size, 0);
    let completedChunks = 0;
    let uploadedBytes = 0;

    console.log(`[ParallelUpload] Iniciando ${totalChunks} chunks com até ${this.MAX_CONCURRENT} paralelos`);

    const results = [];
    const executing = [];
    let queueIndex = 0;

    const processNext = async () => {
      if (queueIndex >= totalChunks) return;

      const currentIndex = queueIndex++;
      const chunk = chunks[currentIndex];

      const promise = (async () => {
        // Obter presigned URL para este chunk
        console.log(`[ParallelUpload] Obtendo URL para part ${chunk.partNumber}...`);
        const urlResult = await window.r2API.getMultipartPartUrl(uploadId, chunk.partNumber);
        
        if (!urlResult.success) {
          throw new Error(`Erro ao obter URL: ${urlResult.error}`);
        }

        // Fazer upload do chunk
        const uploadResult = await this.uploadChunkWithRetry(
          chunk.blob,
          urlResult.uploadUrl,
          chunk.partNumber,
          totalChunks
        );

        // Registrar o ETag no backend
        console.log(`[ParallelUpload] Registrando ETag para part ${chunk.partNumber}...`);
        const registerResult = await window.r2API.registerMultipartPart(
          uploadId,
          chunk.partNumber,
          uploadResult.eTag
        );

        if (!registerResult.success) {
          throw new Error(`Erro ao registrar part: ${registerResult.error}`);
        }

        // Atualizar progresso
        completedChunks++;
        uploadedBytes += chunk.size;

        const progress = (uploadedBytes / totalSize) * 100;
        const elapsed = (Date.now() - QUEUE_START) / 1000;
        const avgSpeed = elapsed > 0 ? uploadedBytes / elapsed : 0;

        if (onProgress) {
          onProgress(progress, completedChunks, totalChunks, avgSpeed);
        }

        results[currentIndex] = uploadResult;
      })()
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

    const initialPromises = [];
    for (let i = 0; i < Math.min(this.MAX_CONCURRENT, totalChunks); i++) {
      initialPromises.push(processNext());
    }

    await Promise.all([...initialPromises, ...executing]);

    const QUEUE_TIME = Date.now() - QUEUE_START;
    const finalSpeed = totalSize / (QUEUE_TIME / 1000);

    console.log(`[ParallelUpload] Todos chunks completos: ${this.formatTime(QUEUE_TIME)} - Média: ${this.formatSpeed(finalSpeed)}`);

    return { totalTime: QUEUE_TIME, avgSpeedBps: finalSpeed, results, totalChunks };
  },

  async uploadFile(file, fileName, onProgress = null) {
    const TOTAL_START = Date.now();
    let uploadId = null;

    try {
      console.log('\n' + '━'.repeat(60));
      console.log(`[ParallelUpload] INICIANDO: ${fileName}`);
      console.log(`[ParallelUpload] Tamanho: ${(file.size / (1024 * 1024)).toFixed(2)} MB | Tipo: ${file.type}`);
      console.log('━'.repeat(60));

      // ETAPA 1: Dividir em chunks
      console.log('\n[ParallelUpload] Etapa 1: Dividindo em chunks...');
      const chunks = this.createChunks(file);
      console.log(`[ParallelUpload] ${chunks.length} chunks criados (${(this.CHUNK_SIZE / (1024 * 1024)).toFixed(0)}MB cada)`);

      // ETAPA 2: Iniciar multipart upload
      console.log('\n[ParallelUpload] Etapa 2: Iniciando multipart upload...');
      const INIT_START = Date.now();

      const initiateResult = await window.r2API.initiateMultipartUpload(fileName, file.type, file.size);
      
      if (!initiateResult.success) {
        throw new Error(`Erro ao iniciar: ${initiateResult.error}`);
      }

      uploadId = initiateResult.uploadId;
      console.log(`[ParallelUpload] Upload ID: ${uploadId}`);
      console.log(`[ParallelUpload] Iniciado em ${this.formatTime(Date.now() - INIT_START)}`);

      // ETAPA 3: Upload paralelo dos chunks
      console.log('\n[ParallelUpload] Etapa 3: Upload paralelo dos chunks...');
      const uploadResult = await this.uploadChunksInParallel(chunks, uploadId, onProgress);

      // ETAPA 4: Completar multipart upload
      console.log('\n[ParallelUpload] Etapa 4: Completando multipart upload...');
      const COMPLETE_START = Date.now();

      const completeResult = await window.r2API.completeMultipartUpload(uploadId);
      
      if (!completeResult.success) {
        throw new Error(`Erro ao completar: ${completeResult.error}`);
      }

      console.log(`[ParallelUpload] Completado em ${this.formatTime(Date.now() - COMPLETE_START)}`);

      const TOTAL_TIME = Date.now() - TOTAL_START;
      const finalSpeed = file.size / (TOTAL_TIME / 1000);

      console.log('\n' + '━'.repeat(60));
      console.log('✅ UPLOAD CONCLUÍDO COM SUCESSO');
      console.log('━'.repeat(60));
      console.log(`[ParallelUpload] Arquivo: ${completeResult.fileName}`);
      console.log(`[ParallelUpload] Tamanho: ${(file.size / (1024 * 1024)).toFixed(2)} MB`);
      console.log(`[ParallelUpload] Tempo total: ${this.formatTime(TOTAL_TIME)}`);
      console.log(`[ParallelUpload] Velocidade média: ${this.formatSpeed(finalSpeed)}`);
      console.log(`[ParallelUpload] Parts: ${uploadResult.totalChunks}`);
      console.log(`[ParallelUpload] URL: ${completeResult.publicUrl}`);
      console.log('━'.repeat(60) + '\n');

      return {
        success: true,
        fileName: fileName,
        publicUrl: completeResult.publicUrl,
        uploadId: uploadId,
        chunks: uploadResult.totalChunks,
        totalTime: TOTAL_TIME,
        avgSpeed: finalSpeed
      };

    } catch (error) {
      const TOTAL_TIME = Date.now() - TOTAL_START;
      console.error('\n' + '━'.repeat(60));
      console.error('❌ ERRO: ' + error.message);
      console.error(`Tempo até erro: ${this.formatTime(TOTAL_TIME)}`);
      console.error('━'.repeat(60) + '\n');

      // Tentar abortar se upload foi iniciado
      if (uploadId) {
        try {
          console.log('[ParallelUpload] Abortando upload...');
          await window.r2API.abortMultipartUpload(uploadId);
          console.log('[ParallelUpload] Upload abortado com sucesso');
        } catch (abortError) {
          console.error('[ParallelUpload] Erro ao abortar:', abortError.message);
        }
      }

      return {
        success: false,
        error: error.message,
        uploadId: uploadId,
        timeUntilError: TOTAL_TIME
      };
    }
  }
};

window.ParallelUpload = ParallelUpload;
