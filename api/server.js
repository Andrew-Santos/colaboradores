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

// ============ NOVO: DELETAR POST (PARA ROLLBACK) ============
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
    
    // 2. Verificar permissão (opcional - pode remover se quiser permitir qualquer admin deletar)
    if (post.created_by !== userId) {
      console.log('[Delete] Usuário diferente, mas permitindo rollback');
    }
    
    // 3. Deletar mídias associadas primeiro (para manter integridade)
    console.log('[Delete] Deletando mídias do post...');
    const { error: deleteMediaError } = await supabase
      .from('post_media')
      .delete()
      .eq('id_post', postId);
    
    if (deleteMediaError) {
      console.error('[Delete] Erro ao deletar mídias:', deleteMediaError);
      // Continuar mesmo assim, pois o importante é deletar o post
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
    console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📂 Servindo arquivos estáticos`);
    console.log(`🔗 Acesse: http://localhost:${PORT}`);
    console.log('================================\n');
  });
}

// Exportar para Vercel
module.exports = app;


