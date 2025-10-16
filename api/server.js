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
    // Sempre permitir se não houver origin (requisições do mesmo domínio)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('[CORS] Origem bloqueada:', origin);
      callback(null, true); // Permitir mesmo assim para debug
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));

// ============ SERVIR ARQUIVOS ESTÁTICOS ============
app.use(express.static(path.join(__dirname, '..')));

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

// ============ ROTAS DE UPLOAD ============

// GERAR URL DE UPLOAD
app.post('/api/generate-upload-url', verifyToken, async (req, res) => {
  try {
    const { fileName, contentType, fileSize } = req.body;

    if (!fileName || !contentType) {
      return res.status(400).json({ 
        success: false,
        error: 'fileName e contentType são obrigatórios' 
      });
    }

    if (fileSize > 500 * 1024 * 1024) {
      return res.status(400).json({ 
        success: false,
        error: 'Arquivo muito grande (máx 500MB)' 
      });
    }

    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/quicktime', 'video/x-msvideo'
    ];
    
    if (!allowedTypes.includes(contentType)) {
      return res.status(400).json({ 
        success: false,
        error: 'Tipo de arquivo não permitido' 
      });
    }

    const uploadUrl = `${process.env.R2_API_URL}/upload?file=${fileName}`;
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileName}`;

    res.json({
      success: true,
      uploadUrl,
      publicUrl
    });

  } catch (error) {
    console.error('[Upload] Erro:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erro ao gerar URL' 
    });
  }
});

// ============ ROTAS DE POSTS ============

// AGENDAR POST
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
    if (scheduled <= new Date()) {
      return res.status(400).json({ 
        success: false,
        error: 'Data deve ser no futuro' 
      });
    }

    if (caption && caption.length > 2200) {
      return res.status(400).json({ 
        success: false,
        error: 'Legenda muito longa' 
      });
    }

    if (!supabase) {
      return res.status(500).json({ 
        success: false,
        error: 'Supabase não disponível' 
      });
    }

    const { data: post, error: postError } = await supabase
      .from('post')
      .insert([{
        id_client: clientId,
        type: type,
        caption: caption || null,
        status: 'PENDENTE',
        agendamento: scheduled.toISOString(),
        user_id: req.user.id
      }])
      .select()
      .single();

    if (postError) throw postError;

    console.log('[Post] Criado:', post.id);

    res.json({
      success: true,
      postId: post.id
    });

  } catch (error) {
    console.error('[Post] Erro:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erro ao agendar post' 
    });
  }
});

// ============ HEALTH CHECK ============
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK',
    timestamp: new Date().toISOString(),
    supabase: process.env.SUPABASE_URL ? 'Configurado' : 'Não configurado',
    r2: process.env.R2_API_URL ? 'Configurado' : 'Não configurado',
    env: process.env.NODE_ENV || 'development'
  });
});

// ============ ROTA PRINCIPAL (FRONTEND) ============
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
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
