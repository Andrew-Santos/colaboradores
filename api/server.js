require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// ============ CONFIGURAÇÃO CORS ============
const allowedOrigins = [
  'https://colaboradores.teamcriativa.com',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:3000'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('[CORS] Origem bloqueada:', origin);
      callback(null, true);
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));

// ============ SERVIR ARQUIVOS ESTÁTICOS (APENAS EM DEV) ============
if (process.env.NODE_ENV !== 'production') {
  app.use(express.static(path.join(__dirname, '..')));
}

// ============ INICIALIZAR SUPABASE ============
let supabase;

try {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    throw new Error('Variáveis SUPABASE não configuradas');
  }

  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );

  console.log('[Server] Supabase inicializado com sucesso');
} catch (error) {
  console.error('[Server] ERRO ao inicializar Supabase:', error.message);
}

// ============ MIDDLEWARE DE AUTENTICAÇÃO ============
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false,
        error: 'Token não fornecido' 
      });
    }

    const token = authHeader.split(' ')[1];
    
    if (!supabase) {
      return res.status(500).json({ 
        success: false,
        error: 'Supabase não inicializado' 
      });
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      console.error('[Auth] Token inválido:', error?.message);
      return res.status(401).json({ 
        success: false,
        error: 'Token inválido' 
      });
    }
    
    req.user = user;
    next();
  } catch (error) {
    console.error('[Auth] Erro no middleware:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erro na autenticação' 
    });
  }
};

// ============ ROTAS DE AUTENTICAÇÃO ============

// LOGIN
app.post('/auth/login', async (req, res) => {
  try {
    console.log('[Login] Requisição recebida');
    
    const { email, password } = req.body;

    if (!email || !password) {
      console.log('[Login] Dados faltando');
      return res.status(400).json({ 
        success: false,
        error: 'Email e senha obrigatórios' 
      });
    }

    if (!supabase) {
      console.error('[Login] Supabase não disponível');
      return res.status(500).json({ 
        success: false,
        error: 'Serviço indisponível' 
      });
    }

    console.log('[Login] Tentando autenticar:', email);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      console.error('[Login] Erro Supabase:', error.message);
      return res.status(401).json({ 
        success: false,
        error: 'Credenciais inválidas' 
      });
    }

    console.log('[Login] Sucesso para:', email);

    res.json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email
      },
      session: data.session
    });

  } catch (error) {
    console.error('[Login] Erro fatal:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erro no servidor: ' + error.message 
    });
  }
});

// LOGOUT
app.post('/auth/logout', verifyToken, async (req, res) => {
  try {
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'Erro ao fazer logout' 
    });
  }
});

// VERIFICAR TOKEN
app.post('/auth/verify', verifyToken, (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user.id,
      email: req.user.email
    }
  });
});

// ============ ROTAS DE CLIENTES ============

// LISTAR CLIENTES
app.get('/api/clients', verifyToken, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ 
        success: false,
        error: 'Supabase não disponível' 
      });
    }

    const { data, error } = await supabase
      .from('client')
      .select('*')
      .order('users', { ascending: true });

    if (error) {
      console.error('[Clients] Erro:', error);
      throw error;
    }

    console.log('[Clients] Retornando', data?.length || 0, 'clientes');

    res.json({ 
      success: true, 
      data: data || []
    });

  } catch (error) {
    console.error('[Clients] Erro:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erro ao carregar clientes' 
    });
  }
});

// ============ ROTAS DE POSTS ============

// AGENDAR POST
app.post('/api/schedule-post', verifyToken, async (req, res) => {
  try {
    console.log('[Post] Requisição recebida');
    console.log('[Post] Body:', JSON.stringify(req.body, null, 2));
    console.log('[Post] User:', req.user.id);

    const { clientId, type, caption, scheduledDate } = req.body;

    // Validações detalhadas
    if (!clientId) {
      console.error('[Post] clientId não fornecido');
      return res.status(400).json({ 
        success: false,
        error: 'Cliente não selecionado' 
      });
    }

    if (!type) {
      console.error('[Post] type não fornecido');
      return res.status(400).json({ 
        success: false,
        error: 'Tipo de post não selecionado' 
      });
    }

    if (!scheduledDate) {
      console.error('[Post] scheduledDate não fornecido');
      return res.status(400).json({ 
        success: false,
        error: 'Data de agendamento não fornecida' 
      });
    }

    const scheduled = new Date(scheduledDate);
    if (isNaN(scheduled.getTime())) {
      console.error('[Post] Data inválida:', scheduledDate);
      return res.status(400).json({ 
        success: false,
        error: 'Data de agendamento inválida' 
      });
    }

    if (scheduled <= new Date()) {
      console.error('[Post] Data no passado:', scheduledDate);
      return res.status(400).json({ 
        success: false,
        error: 'Data deve ser no futuro' 
      });
    }

    if (caption && caption.length > 2200) {
      console.error('[Post] Legenda muito longa:', caption.length);
      return res.status(400).json({ 
        success: false,
        error: 'Legenda muito longa' 
      });
    }

    if (!supabase) {
      console.error('[Post] Supabase não inicializado');
      return res.status(500).json({ 
        success: false,
        error: 'Supabase não disponível' 
      });
    }

    console.log('[Post] Tentando inserir no banco...');

    const postData = {
      id_client: clientId,
      type: type,
      caption: caption || null,
      status: 'PENDENTE',
      agendamento: scheduled.toISOString(),
      created_by: req.user.id
    };

    console.log('[Post] Dados a inserir:', JSON.stringify(postData, null, 2));

    const { data: post, error: postError } = await supabase
      .from('post')
      .insert([postData])
      .select()
      .single();

    if (postError) {
      console.error('[Post] Erro do Supabase:', postError);
      throw postError;
    }

    console.log('[Post] Post criado com sucesso:', post.id);

    res.json({
      success: true,
      postId: post.id,
      post: post
    });

  } catch (error) {
    console.error('[Post] Erro fatal:', error);
    console.error('[Post] Stack:', error.stack);
    res.status(500).json({ 
      success: false,
      error: 'Erro ao agendar post: ' + error.message 
    });
  }
});

// SALVAR MÍDIAS DO POST
app.post('/api/save-media', verifyToken, async (req, res) => {
  try {
    console.log('[Media] Requisição recebida');
    console.log('[Media] Body:', JSON.stringify(req.body, null, 2));

    const { postId, mediaFiles } = req.body;

    // Validações
    if (!postId) {
      console.error('[Media] postId não fornecido');
      return res.status(400).json({ 
        success: false,
        error: 'ID do post não fornecido' 
      });
    }

    if (!mediaFiles || !Array.isArray(mediaFiles) || mediaFiles.length === 0) {
      console.error('[Media] mediaFiles inválido');
      return res.status(400).json({ 
        success: false,
        error: 'Arquivos de mídia não fornecidos' 
      });
    }

    if (!supabase) {
      console.error('[Media] Supabase não inicializado');
      return res.status(500).json({ 
        success: false,
        error: 'Supabase não disponível' 
      });
    }

    console.log('[Media] Tentando inserir', mediaFiles.length, 'mídias...');

    // Preparar dados para inserção
    const mediaData = mediaFiles.map(media => ({
      id_post: postId,
      type: media.type,
      url_media: media.url,
      order: String(media.order),
    }));

    console.log('[Media] Dados a inserir:', JSON.stringify(mediaData, null, 2));

    // Inserir no banco
    const { data, error } = await supabase
      .from('post_media')
      .insert(mediaData)
      .select();

    if (error) {
      console.error('[Media] Erro do Supabase:', error);
      throw error;
    }

    console.log('[Media] Mídias salvas com sucesso:', data.length);

    res.json({
      success: true,
      count: data.length,
      media: data
    });

  } catch (error) {
    console.error('[Media] Erro fatal:', error);
    console.error('[Media] Stack:', error.stack);
    res.status(500).json({ 
      success: false,
      error: 'Erro ao salvar mídias: ' + error.message 
    });
  }
});

// DELETAR POST (PARA ROLLBACK)
app.delete('/api/delete-post/:postId', verifyToken, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user.id;
    
    console.log(`[Delete] Iniciando rollback do post ${postId} por usuário ${userId}`);
    
    if (!supabase) {
      return res.status(500).json({ 
        success: false,
        error: 'Supabase não disponível' 
      });
    }
    
    // 1. Verificar se o post existe
    const { data: post, error: fetchError } = await supabase
      .from('post')
      .select('id, created_by')
      .eq('id', postId)
      .single();
    
    if (fetchError) {
      console.error('[Delete] Erro ao buscar post:', fetchError);
      
      // Se o post não existe, considerar como sucesso (já foi deletado)
      if (fetchError.code === 'PGRST116') {
        console.log('[Delete] Post já não existe, considerando sucesso');
        return res.json({
          success: true,
          message: 'Post já estava deletado'
        });
      }
      
      return res.status(404).json({
        success: false,
        error: 'Post não encontrado'
      });
    }
    
    // 2. Verificar permissão (opcional)
    if (post.created_by !== userId) {
      console.log('[Delete] Usuário diferente, mas permitindo rollback');
    }
    
    // 3. Deletar mídias associadas primeiro
    console.log('[Delete] Deletando mídias do post...');
    const { error: deleteMediaError } = await supabase
      .from('post_media')
      .delete()
      .eq('id_post', postId);
    
    if (deleteMediaError) {
      console.error('[Delete] Erro ao deletar mídias:', deleteMediaError);
    } else {
      console.log('[Delete] Mídias deletadas com sucesso');
    }
    
    // 4. Deletar o post
    console.log('[Delete] Deletando post...');
    const { error: deletePostError } = await supabase
      .from('post')
      .delete()
      .eq('id', postId);
    
    if (deletePostError) {
      console.error('[Delete] Erro ao deletar post:', deletePostError);
      throw deletePostError;
    }
    
    console.log(`[Delete] ✓ Post ${postId} e suas mídias deletados com sucesso`);
    
    res.json({
      success: true,
      message: 'Post deletado com sucesso'
    });
    
  } catch (error) {
    console.error('[Delete] Erro fatal:', error);
    console.error('[Delete] Stack:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Erro ao deletar post: ' + error.message
    });
  }
});

// ============ ROTAS DO DRIVE ============

// LISTAR CONTEÚDO DE PASTA
app.get('/api/drive/contents', verifyToken, async (req, res) => {
  try {
    console.log('[Drive] Requisição de conteúdo recebida');
    
    const { clientId, folderId } = req.query;

    if (!clientId) {
      console.error('[Drive] clientId não fornecido');
      return res.status(400).json({ 
        success: false, 
        error: 'Cliente não informado' 
      });
    }

    if (!supabase) {
      return res.status(500).json({ 
        success: false,
        error: 'Supabase não disponível' 
      });
    }

    // Buscar pastas
    console.log('[Drive] Buscando pastas...');
    let foldersQuery = supabase
      .from('drive_folders')
      .select('*')
      .eq('id_client', clientId)
      .order('name', { ascending: true });

    if (folderId) {
      foldersQuery = foldersQuery.eq('id_parent', folderId);
    } else {
      foldersQuery = foldersQuery.is('id_parent', null);
    }

    const { data: folders, error: foldersError } = await foldersQuery;
    
    if (foldersError) {
      console.error('[Drive] Erro ao buscar pastas:', foldersError);
      throw foldersError;
    }

    // Buscar arquivos
    console.log('[Drive] Buscando arquivos...');
    let filesQuery = supabase
      .from('drive_files')
      .select('*')
      .eq('id_client', clientId)
      .order('created_at', { ascending: false });

    if (folderId) {
      filesQuery = filesQuery.eq('id_folders', folderId);
    } else {
      filesQuery = filesQuery.is('id_folders', null);
    }

    const { data: files, error: filesError } = await filesQuery;
    
    if (filesError) {
      console.error('[Drive] Erro ao buscar arquivos:', filesError);
      throw filesError;
    }

    console.log(`[Drive] Cliente ${clientId}: ${folders?.length || 0} pastas, ${files?.length || 0} arquivos`);

    res.json({
      success: true,
      folders: folders || [],
      files: files || []
    });

  } catch (error) {
    console.error('[Drive] Erro fatal:', error);
    console.error('[Drive] Stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao listar conteúdo' 
    });
  }
});

// CRIAR PASTA
app.post('/api/drive/folder', verifyToken, async (req, res) => {
  try {
    console.log('[Drive] Criando nova pasta');
    console.log('[Drive] Body:', JSON.stringify(req.body, null, 2));
    
    const { name, clientId, parentId } = req.body;

    if (!name || !clientId) {
      console.error('[Drive] Dados obrigatórios faltando');
      return res.status(400).json({ 
        success: false, 
        error: 'Nome e cliente são obrigatórios' 
      });
    }

    if (!supabase) {
      return res.status(500).json({ 
        success: false,
        error: 'Supabase não disponível' 
      });
    }

    // Gerar path único
    let path = `client-${clientId}`;
    
    if (parentId) {
      console.log('[Drive] Buscando pasta pai:', parentId);
      const { data: parent, error: parentError } = await supabase
        .from('drive_folders')
        .select('path')
        .eq('id', parentId)
        .single();
      
      if (parentError) {
        console.error('[Drive] Erro ao buscar pasta pai:', parentError);
      }
      
      if (parent) {
        path = parent.path;
      }
    }
    
    path += `/${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now()}`;
    console.log('[Drive] Path gerado:', path);

    const folderData = {
      name,
      id_client: clientId,
      id_parent: parentId || null,
      path
    };

    console.log('[Drive] Inserindo pasta:', JSON.stringify(folderData, null, 2));

    const { data, error } = await supabase
      .from('drive_folders')
      .insert([folderData])
      .select()
      .single();

    if (error) {
      console.error('[Drive] Erro ao criar pasta:', error);
      throw error;
    }

    console.log(`[Drive] Pasta criada com sucesso: ${name} (ID: ${data.id})`);

    res.json({ 
      success: true, 
      folder: data 
    });

  } catch (error) {
    console.error('[Drive] Erro fatal:', error);
    console.error('[Drive] Stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao criar pasta' 
    });
  }
});

// DELETAR PASTA (CASCADE deleta subpastas e arquivos)
app.delete('/api/drive/folder/:folderId', verifyToken, async (req, res) => {
  try {
    const { folderId } = req.params;
    
    console.log(`[Drive] Deletando pasta ${folderId}`);

    if (!supabase) {
      return res.status(500).json({ 
        success: false,
        error: 'Supabase não disponível' 
      });
    }

    // Buscar todos os arquivos da pasta para possível limpeza no R2
    const { data: files, error: filesError } = await supabase
      .from('drive_files')
      .select('path')
      .eq('id_folders', folderId);

    if (filesError) {
      console.error('[Drive] Erro ao buscar arquivos da pasta:', filesError);
    } else {
      console.log(`[Drive] Encontrados ${files?.length || 0} arquivos na pasta`);
    }

    // Deletar pasta (CASCADE vai deletar arquivos do banco)
    const { error } = await supabase
      .from('drive_folders')
      .delete()
      .eq('id', folderId);

    if (error) {
      console.error('[Drive] Erro ao deletar pasta:', error);
      throw error;
    }

    // TODO: Deletar arquivos do R2 se necessário
    // if (files && files.length > 0) {
    //   const filePaths = files.map(f => f.path);
    //   console.log('[Drive] Arquivos para deletar do R2:', filePaths);
    //   // await r2API.deleteFiles(filePaths);
    // }

    console.log(`[Drive] ✓ Pasta ${folderId} deletada com sucesso`);

    res.json({ success: true });

  } catch (error) {
    console.error('[Drive] Erro fatal:', error);
    console.error('[Drive] Stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao deletar pasta' 
    });
  }
});

// SALVAR ARQUIVO
app.post('/api/drive/file', verifyToken, async (req, res) => {
  try {
    console.log('[Drive] Salvando arquivo');
    console.log('[Drive] Body:', JSON.stringify(req.body, null, 2));
    
    const { 
      clientId, 
      folderId, 
      path, 
      name, 
      urlMedia, 
      urlThumbnail, 
      dimensions, 
      duration, 
      fileType, 
      mimeType, 
      fileSizeKb, 
      dataDeCaptura 
    } = req.body;

    if (!clientId || !path || !name || !urlMedia) {
      console.error('[Drive] Dados obrigatórios faltando');
      return res.status(400).json({ 
        success: false, 
        error: 'Dados incompletos' 
      });
    }

    if (!supabase) {
      return res.status(500).json({ 
        success: false,
        error: 'Supabase não disponível' 
      });
    }

    const fileData = {
      id_client: clientId,
      id_folders: folderId || null,
      path,
      name,
      url_media: urlMedia,
      url_thumbnail: urlThumbnail || null,
      dimensions: dimensions || null,
      duration: duration || null,
      file_type: fileType,
      mime_type: mimeType,
      file_size_kb: fileSizeKb,
      data_de_captura: dataDeCaptura || null
    };

    console.log('[Drive] Inserindo arquivo:', JSON.stringify(fileData, null, 2));

    const { data, error } = await supabase
      .from('drive_files')
      .insert([fileData])
      .select()
      .single();

    if (error) {
      console.error('[Drive] Erro ao salvar arquivo:', error);
      throw error;
    }

    console.log(`[Drive] ✓ Arquivo salvo: ${name} (ID: ${data.id})`);

    res.json({ 
      success: true, 
      file: data 
    });

  } catch (error) {
    console.error('[Drive] Erro fatal:', error);
    console.error('[Drive] Stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao salvar arquivo' 
    });
  }
});

// DELETAR ARQUIVO
app.delete('/api/drive/file/:fileId', verifyToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    
    console.log(`[Drive] Deletando arquivo ${fileId}`);

    if (!supabase) {
      return res.status(500).json({ 
        success: false,
        error: 'Supabase não disponível' 
      });
    }

    // Buscar path para deletar do R2
    const { data: file, error: fetchError } = await supabase
      .from('drive_files')
      .select('path, name')
      .eq('id', fileId)
      .single();

    if (fetchError) {
      console.error('[Drive] Erro ao buscar arquivo:', fetchError);
    } else {
      console.log(`[Drive] Arquivo encontrado: ${file?.name}`);
    }

    // Deletar do banco
    const { error } = await supabase
      .from('drive_files')
      .delete()
      .eq('id', fileId);

    if (error) {
      console.error('[Drive] Erro ao deletar arquivo:', error);
      throw error;
    }

    // TODO: Deletar do R2 se necessário
    // if (file && file.path) {
    //   console.log('[Drive] Deletando do R2:', file.path);
    //   // await r2API.deleteFile(file.path);
    // }

    console.log(`[Drive] ✓ Arquivo ${fileId} deletado com sucesso`);

    res.json({ success: true });

  } catch (error) {
    console.error('[Drive] Erro fatal:', error);
    console.error('[Drive] Stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao deletar arquivo' 
    });
  }
});

// ============ HEALTH CHECK ============
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK',
    timestamp: new Date().toISOString(),
    supabase: process.env.SUPABASE_URL ? 'Configurado' : 'Não configurado',
    env: process.env.NODE_ENV || 'development'
  });
});

// ============ TRATAMENTO DE ERROS ============
app.use((err, req, res, next) => {
  console.error('[Server] Erro não tratado:', err);
  res.status(500).json({ 
    success: false,
    error: 'Erro interno do servidor',
    details: err.message 
  });
});

// ============ INICIAR SERVIDOR (apenas local) ============
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log('\n================================');
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`🌐 Ambiente: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📂 Servindo arquivos estáticos`);
    console.log(`🔗 Acesse: http://localhost:${PORT}`);
    console.log('================================\n');
  });
}

// Exportar para Vercel
module.exports = app;