// /api/auth.js
// Registo e login de utilizadores via Supabase Auth

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

async function supabaseFetch(path, method, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SECRET_KEY,
      'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  const { action, email, password } = req.body;

  if (!email || !password) return res.status(400).json({ error: 'Email e password são obrigatórios.' });

  try {
    if (action === 'register') {
      const data = await supabaseFetch('/signup', 'POST', { email, password });
      if (data.error) return res.status(400).json({ error: data.error.message || 'Erro ao criar conta.' });

      // Criar registo na tabela user_plans com plano gratis
      await fetch(`${SUPABASE_URL}/rest/v1/user_plans`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SECRET_KEY,
          'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ email, plano: 'gratis' }),
      });

      return res.status(200).json({ success: true, message: 'Conta criada com sucesso!', user: { email, id: data.user?.id } });
    }

    if (action === 'login') {
      const data = await supabaseFetch('/token?grant_type=password', 'POST', { email, password });
      if (data.error) return res.status(401).json({ error: 'Email ou password incorretos.' });

      // Buscar plano do utilizador
      const planRes = await fetch(`${SUPABASE_URL}/rest/v1/user_plans?email=eq.${encodeURIComponent(email)}&select=plano`, {
        headers: {
          'apikey': SUPABASE_SECRET_KEY,
          'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`,
        },
      });
      const planData = await planRes.json();
      const plano = planData?.[0]?.plano || 'gratis';

      return res.status(200).json({
        success: true,
        token: data.access_token,
        user: { email, plano }
      });
    }

    return res.status(400).json({ error: 'Ação inválida.' });

  } catch (err) {
    console.error('Erro auth:', err);
    return res.status(500).json({ error: 'Erro interno.' });
  }
}
