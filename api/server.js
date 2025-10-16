require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// CORS seguro - apenas seu domínio
app.use(cors({
  origin: process.env.CORS_ORIGIN,
  credentials: true
}));

app.use(express.json());

// Inicializar Supabase no backend
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // Service key no backend!
);

// Middleware de autenticação
const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      return res.status(401).json({ error: 'Token inválido' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Erro na autenticação' });
  }
};

// ============ ROTAS DE AUTENTICAÇÃO ============

// Login
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validações
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha obrigatórios' });
    }

    if (email.length > 255 || password.length > 255) {
      return res.status(400).json({ error: 'Campos muito grandes' });
    }

    // Rate limiting (implementar com Redis em produção)
    // Por enquanto, validação básica

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return res.status(401).json({ error: error.message });
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
    res.status(500).json({ error: 'Erro no servidor' });
  }
});

// Logout (validar token)
app.post('/auth/logout', verifyToken, async (req, res) => {
  try {
    // Logout no Supabase
    await supabase.auth.signOut();
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao fazer logout' });
  }
});

// Verificar sessão
app.post('/auth/verify', verifyToken, (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

// ============ ROTAS DE CLIENTES ============

// Carregar clientes (apenas usuários autenticados)
app.get('/api/clients', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('client')
      .select('*')
      .order('users', { ascending: true });

    if (error) throw error;

    res.json({ success: true, data });

  } catch (error) {
    res.status(500).json({ error: 'Erro ao carregar clientes' });
  }
});

// ============ ROTAS DE UPLOAD ============

// Gerar URL de upload (apenas usuários autenticados)
app.post('/api/generate-upload-url', verifyToken, async (req, res) => {
  try {
    const { fileName, contentType, fileSize } = req.body;

    // Validações
    if (!fileName || !contentType) {
      return res.status(400).json({ error: 'Parâmetros obrigatórios' });
    }

    // Limitar tamanho de arquivo (ex: 500MB)
    if (fileSize > 500 * 1024 * 1024) {
      return res.status(400).json({ error: 'Arquivo muito grande' });
    }

    // Validar tipos permitidos
    const allowedTypes = ['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime'];
    if (!allowedTypes.includes(contentType)) {
      return res.status(400).json({ error: 'Tipo de arquivo não permitido' });
    }

    // Implementar lógica de geração de presigned URL
    // Isso varia conforme seu serviço (R2, S3, etc)
    
    res.json({
      success: true,
      uploadUrl: 'url_de_upload_gerada_com_seguranca',
      publicUrl: 'url_publica_do_arquivo'
    });

  } catch (error) {
    res.status(500).json({ error: 'Erro ao gerar URL' });
  }
});

// ============ ROTAS DE POSTS ============

// Agendar post
app.post('/api/schedule-post', verifyToken, async (req, res) => {
  try {
    const { clientId, type, caption, scheduledDate, mediaFiles } = req.body;

    // Validações SEVERAS
    if (!clientId || !type || !scheduledDate) {
      return res.status(400).json({ error: 'Dados incompletos' });
    }

    const scheduled = new Date(scheduledDate);
    if (scheduled <= new Date()) {
      return res.status(400).json({ error: 'Data deve ser no futuro' });
    }

    if (caption && caption.length > 2200) {
      return res.status(400).json({ error: 'Legenda muito longa' });
    }

    // Criar post no banco
    const { data: post, error: postError } = await supabase
      .from('post')
      .insert([{
        id_client: clientId,
        type: type,
        caption: caption || null,
        status: 'PENDENTE',
        agendamento: scheduled.toISOString(),
        user_id: req.user.id // Rastrear quem criou
      }])
      .select()
      .single();

    if (postError) throw postError;

    res.json({
      success: true,
      postId: post.id
    });

  } catch (error) {
    console.error('[API] Erro:', error);
    res.status(500).json({ error: 'Erro ao agendar post' });
  }
});

// ============ INICIAR SERVIDOR ============

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});