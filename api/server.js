require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// ============ CONFIGURAÇÃO CORS ============
const allowedOrigins = [
  process.env.CORS_ORIGIN,
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:3000'
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS não permitido'));
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));

// ============ INICIALIZAR SUPABASE ============
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

console.log('[Server] Configuração carregada:');
console.log('  - SUPABASE_URL:', process.env.SUPABASE_URL ? '✓' : '✗');
console.log('  - SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? '✓' : '✗');
console.log('  - R2_API_URL:', process.env.R2_API_URL ? '✓' : '✗');
console.log('  - CORS_ORIGIN:', process.env.CORS_ORIGIN || 'não definido');

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
    res.status(401).json({ 
      success: false,
      error: 'Erro na autenticação' 
    });
  }
};

// ============ ROTAS DE AUTENTICAÇÃO ============

// LOGIN
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false,
        error: 'Email e senha obrigatórios' 
      });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      console.error('[Login] Erro:', error.message);
      return res.status(401).json({ 
        success: false,
        error: 'Credenciais inválidas' 
      });
    }

    console.log('[Login] Sucesso:', email);

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
    const { data, error } = await supabase
      .from('client')
      .select('*')
      .order('users', { ascending: true });

    if (error) throw error;

    console.log('[Clients] Retornando', data.length, 'clientes');

    res.json({ 
      success: true, 
      data 
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

    // Aqui você chamaria sua API do Cloudflare R2
    // Por enquanto, retornando estrutura esperada
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
    r2: process.env.R2_API_URL ? 'Configurado' : 'Não configurado'
  });
});

// ============ INICIAR SERVIDOR ============
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('\n================================');
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log('================================\n');
});

module.exports = app;
