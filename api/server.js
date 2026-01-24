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

// ============ SERVIR ARQUIVOS ESTÁTICOS ============
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

  console.log('[Server] Supabase inicializado');
} catch (error) {
  console.error('[Server] ERRO Supabase:', error.message);
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
      return res.status(401).json({ 
        success: false,
        error: 'Token inválido' 
      });
    }
    
    req.user = user;
    next();
  } catch (error) {
    console.error('[Auth] Erro:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erro na autenticação' 
    });
  }
};

// ============ ROTAS DE AUTENTICAÇÃO ============

app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        error: 'Email e senha obrigatórios' 
      });
    }

    if (!supabase) {
      return res.status(500).json({ 
        success: false,
        error: 'Serviço indisponível' 
      });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return res.status(401).json({ 
        success: false,
        error: 'Credenciais inválidas' 
      });
    }

    res.json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email
      },
      session: data.session
    });

  } catch (error) {
    console.error('[Login] Erro:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erro no servidor' 
    });
  }
});

app.post('/auth/logout', verifyToken, async (req, res) => {
  res.json({ success: true });
});

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

    if (error) throw error;

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

app.post('/api/schedule-post', verifyToken, async (req, res) => {
  try {
    const { clientId, type, caption, scheduledDate } = req.body;

    if (!clientId || !type || !scheduledDate) {
      return res.status(400).json({ 
        success: false,
        error: 'Dados incompletos' 
      });
    }

    const scheduled = new Date(scheduledDate);
    if (isNaN(scheduled.getTime()) || scheduled <= new Date()) {
      return res.status(400).json({ 
        success: false,
        error: 'Data inválida' 
      });
    }

    if (!supabase) {
      return res.status(500).json({ 
        success: false,
        error: 'Supabase não disponível' 
      });
    }

    const postData = {
      id_client: clientId,
      type: type,
      caption: caption || null,
      status: 'PENDENTE',
      agendamento: scheduled.toISOString(),
      created_by: req.user.id
    };

    const { data: post, error: postError } = await supabase
      .from('post')
      .insert([postData])
      .select()
      .single();

    if (postError) throw postError;

    res.json({
      success: true,
      postId: post.id,
      post: post
    });

  } catch (error) {
    console.error('[Post] Erro:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erro ao agendar post' 
    });
  }
});

app.post('/api/save-media', verifyToken, async (req, res) => {
  try {
    const { postId, mediaFiles } = req.body;

    if (!postId || !mediaFiles || !Array.isArray(mediaFiles)) {
      return res.status(400).json({ 
        success: false,
        error: 'Dados inválidos' 
      });
    }

    if (!supabase) {
      return res.status(500).json({ 
        success: false,
        error: 'Supabase não disponível' 
      });
    }

    const mediaData = mediaFiles.map(media => ({
      id_post: postId,
      type: media.type,
      url_media: media.url,
      order: String(media.order),
    }));

    const { data, error } = await supabase
      .from('post_media')
      .insert(mediaData)
      .select();

    if (error) throw error;

    res.json({
      success: true,
      count: data.length,
      media: data
    });

  } catch (error) {
    console.error('[Media] Erro:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erro ao salvar mídias' 
    });
  }
});

app.delete('/api/delete-post/:postId', verifyToken, async (req, res) => {
  try {
    const { postId } = req.params;
    
    if (!supabase) {
      return res.status(500).json({ 
        success: false,
        error: 'Supabase não disponível' 
      });
    }
    
    const { data: post, error: fetchError } = await supabase
      .from('post')
      .select('id')
      .eq('id', postId)
      .single();
    
    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
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
    
    await supabase
      .from('post_media')
      .delete()
      .eq('id_post', postId);
    
    const { error: deletePostError } = await supabase
      .from('post')
      .delete()
      .eq('id', postId);
    
    if (deletePostError) throw deletePostError;
    
    res.json({
      success: true,
      message: 'Post deletado'
    });
    
  } catch (error) {
    console.error('[Delete] Erro:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao deletar post'
    });
  }
});

// ============ ROTAS DO DRIVE (SIMPLIFICADAS - SEM PASTAS) ============

// Storage Usage
app.get('/api/drive/storage-usage', verifyToken, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ 
        success: false,
        error: 'Supabase não disponível' 
      });
    }

    const { data, error } = await supabase
      .from('drive_files')
      .select('id_client, file_size_kb');

    if (error) throw error;

    const storageByClient = {};
    
    if (data && data.length > 0) {
      data.forEach(file => {
        if (file.id_client) {
          if (!storageByClient[file.id_client]) {
            storageByClient[file.id_client] = 0;
          }
          storageByClient[file.id_client] += (file.file_size_kb || 0);
        }
      });
    }

    const result = Object.entries(storageByClient).map(([id_client, total_size_kb]) => ({
      id_client: parseInt(id_client),
      total_size_kb
    }));

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('[Drive Storage] Erro:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao calcular armazenamento' 
    });
  }
});

// Listar arquivos do cliente (sem pastas)
app.get('/api/drive/contents', verifyToken, async (req, res) => {
  try {
    const { clientId } = req.query;

    if (!clientId) {
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

    // Buscar apenas arquivos do cliente
    const { data: files, error: filesError } = await supabase
      .from('drive_files')
      .select('*')
      .eq('id_client', clientId)
      .order('created_at', { ascending: false });

    if (filesError) throw filesError;

    res.json({
      success: true,
      files: files || []
    });

  } catch (error) {
    console.error('[Drive] Erro:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao listar conteúdo' 
    });
  }
});

// Salvar arquivo (sem pasta)
app.post('/api/drive/file', verifyToken, async (req, res) => {
  try {
    const { 
      clientId, path, name, urlMedia, urlThumbnail, 
      dimensions, duration, fileType, mimeType, fileSizeKb, dataDeCaptura 
    } = req.body;

    if (!clientId || !path || !name || !urlMedia) {
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

    const { data, error } = await supabase
      .from('drive_files')
      .insert([fileData])
      .select()
      .single();

    if (error) throw error;

    res.json({ 
      success: true, 
      file: data 
    });

  } catch (error) {
    console.error('[Drive] Erro:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao salvar arquivo' 
    });
  }
});

// Deletar arquivo
app.delete('/api/drive/file/:fileId', verifyToken, async (req, res) => {
  try {
    const { fileId } = req.params;

    if (!supabase) {
      return res.status(500).json({ 
        success: false,
        error: 'Supabase não disponível' 
      });
    }

    const { data: file, error: fetchError } = await supabase
      .from('drive_files')
      .select('path')
      .eq('id', fileId)
      .single();

    if (fetchError) {
      return res.status(404).json({
        success: false,
        error: 'Arquivo não encontrado'
      });
    }

    const { error } = await supabase
      .from('drive_files')
      .delete()
      .eq('id', fileId);

    if (error) throw error;

    res.json({ 
      success: true,
      deletedFiles: file.path ? [file.path] : []
    });

  } catch (error) {
    console.error('[Drive] Erro:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao deletar arquivo' 
    });
  }
});

// ============ ROTAS DO DESIGNER ============

app.get('/api/designer/requests/pending', verifyToken, async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ 
        success: false,
        error: 'Supabase não disponível' 
      });
    }

    const { data, error } = await supabase
      .from('designer_request')
      .select(`
        *,
        client:id_client (
          id,
          users,
          profile_photo
        )
      `)
      .in('status', ['PENDENTE', 'RECUSADO'])
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ 
      success: true, 
      data: data || []
    });

  } catch (error) {
    console.error('[Designer] Erro ao listar pendentes:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erro ao carregar solicitações' 
    });
  }
});

app.get('/api/designer/requests/approved', verifyToken, async (req, res) => {
  try {
    const { month, year } = req.query;

    if (!supabase) {
      return res.status(500).json({ 
        success: false,
        error: 'Supabase não disponível' 
      });
    }

    let query = supabase
      .from('designer_request')
      .select(`
        *,
        client:id_client (
          id,
          users,
          profile_photo
        )
      `)
      .eq('status', 'APROVADO')
      .order('created_at', { ascending: false });

    if (month && year) {
      const startDate = new Date(year, month - 1, 1).toISOString();
      const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();
      
      query = query
        .gte('created_at', startDate)
        .lte('created_at', endDate);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({ 
      success: true, 
      data: data || []
    });

  } catch (error) {
    console.error('[Designer] Erro ao listar aprovados:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erro ao carregar solicitações' 
    });
  }
});

app.get('/api/designer/request/:requestId', verifyToken, async (req, res) => {
  try {
    const { requestId } = req.params;

    if (!supabase) {
      return res.status(500).json({ 
        success: false,
        error: 'Supabase não disponível' 
      });
    }

    const { data: request, error: requestError } = await supabase
      .from('designer_request')
      .select(`
        *,
        client:id_client (
          id,
          users,
          profile_photo,
          id_instagram
        )
      `)
      .eq('id', requestId)
      .single();

    if (requestError) throw requestError;

    const { data: medias, error: mediasError } = await supabase
      .from('designer_media')
      .select('*')
      .eq('id_request', requestId)
      .order('created_at', { ascending: true });

    if (mediasError) throw mediasError;

    const { data: messages, error: messagesError } = await supabase
      .from('designer_mensagem')
      .select('*')
      .eq('id_request', requestId)
      .order('created_at', { ascending: true });

    if (messagesError) throw messagesError;

    res.json({ 
      success: true, 
      request: request,
      medias: medias || [],
      messages: messages || []
    });

  } catch (error) {
    console.error('[Designer] Erro ao buscar detalhes:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erro ao carregar detalhes' 
    });
  }
});

app.post('/api/designer/upload-media', verifyToken, async (req, res) => {
  try {
    const { requestId, mediaUrls } = req.body;

    if (!requestId || !mediaUrls || !Array.isArray(mediaUrls)) {
      return res.status(400).json({ 
        success: false,
        error: 'Dados inválidos' 
      });
    }

    if (!supabase) {
      return res.status(500).json({ 
        success: false,
        error: 'Supabase não disponível' 
      });
    }

    const mediaData = mediaUrls.map(url => ({
      id_request: requestId,
      url_media: url,
      atualizado_em: new Date().toISOString()
    }));

    const { data: medias, error: mediaError } = await supabase
      .from('designer_media')
      .insert(mediaData)
      .select();

    if (mediaError) throw mediaError;

    const { error: updateError } = await supabase
      .from('designer_request')
      .update({ status: 'EM_ANDAMENTO' })
      .eq('id', requestId);

    if (updateError) throw updateError;

    res.json({ 
      success: true, 
      medias: medias,
      message: 'Mídias enviadas com sucesso'
    });

  } catch (error) {
    console.error('[Designer] Erro no upload:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erro ao enviar mídias' 
    });
  }
});

app.post('/api/designer/add-message', verifyToken, async (req, res) => {
  try {
    const { requestId, type, content } = req.body;

    if (!requestId || !type || !content) {
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

    const messageData = {
      id_request: requestId,
      type: type,
      url_ou_text: content,
      admin_or_users: 'users'
    };

    const { data, error } = await supabase
      .from('designer_mensagem')
      .insert([messageData])
      .select()
      .single();

    if (error) throw error;

    res.json({ 
      success: true, 
      message: data
    });

  } catch (error) {
    console.error('[Designer] Erro ao adicionar mensagem:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erro ao enviar mensagem' 
    });
  }
});

app.delete('/api/designer/media/:mediaId', verifyToken, async (req, res) => {
  try {
    const { mediaId } = req.params;

    if (!supabase) {
      return res.status(500).json({ 
        success: false,
        error: 'Supabase não disponível' 
      });
    }

    const { data: media, error: fetchError } = await supabase
      .from('designer_media')
      .select('url_media')
      .eq('id', mediaId)
      .single();

    if (fetchError) {
      return res.status(404).json({
        success: false,
        error: 'Mídia não encontrada'
      });
    }

    const { error } = await supabase
      .from('designer_media')
      .delete()
      .eq('id', mediaId);

    if (error) throw error;

    res.json({ 
      success: true,
      deletedUrl: media.url_media
    });

  } catch (error) {
    console.error('[Designer] Erro ao deletar mídia:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erro ao deletar mídia' 
    });
  }
});

// ============ HEALTH CHECK ============
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development'
  });
});

// ============ TRATAMENTO DE ERROS ============
app.use((err, req, res, next) => {
  console.error('[Server] Erro:', err);
  res.status(500).json({ 
    success: false,
    error: 'Erro interno do servidor'
  });
});

// ============ INICIAR SERVIDOR ============
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`\n🚀 Servidor rodando na porta ${PORT}`);
    console.log(`🔗 http://localhost:${PORT}\n`);
  });
}

module.exports = app;
