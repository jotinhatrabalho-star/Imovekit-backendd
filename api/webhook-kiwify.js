// /api/webhook-kiwify.js
// Recebe notificações da Kiwify quando um utilizador paga
// e atualiza automaticamente o plano no Supabase

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

// IDs dos produtos na Kiwify — substitui pelos teus IDs reais
const PLANOS_KIWIFY = {
  '4szbryo': 'pro',     // link do plano Pro
  'jCbdVdd': 'equipa',  // link do plano Equipa
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  try {
    const body = req.body;

    // A Kiwify envia o email do comprador e o status do pedido
    const email = body?.Customer?.email || body?.customer?.email;
    const status = body?.order_status || body?.status;
    const productId = body?.Product?.id || body?.product?.id || '';

    console.log('Webhook Kiwify recebido:', { email, status, productId });

    if (!email) return res.status(400).json({ error: 'Email não encontrado no webhook.' });

    // Só processar pagamentos aprovados
    if (status !== 'paid' && status !== 'approved' && status !== 'complete') {
      return res.status(200).json({ message: 'Status ignorado: ' + status });
    }

    // Determinar plano com base no produto
    // Kiwify envia o slug do produto na URL — verificamos por aproximação
    let novoPlano = 'pro'; // default: Pro
    for (const [slug, plano] of Object.entries(PLANOS_KIWIFY)) {
      if (productId.includes(slug) || JSON.stringify(body).includes(slug)) {
        novoPlano = plano;
        break;
      }
    }

    // Verificar se o utilizador já existe na tabela user_plans
    const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/user_plans?email=eq.${encodeURIComponent(email)}&select=email`, {
      headers: {
        'apikey': SUPABASE_SECRET_KEY,
        'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`,
      },
    });
    const existing = await checkRes.json();

    if (existing && existing.length > 0) {
      // Atualizar plano existente
      await fetch(`${SUPABASE_URL}/rest/v1/user_plans?email=eq.${encodeURIComponent(email)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SECRET_KEY,
          'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ plano: novoPlano, updated_at: new Date().toISOString() }),
      });
    } else {
      // Criar registo novo (utilizador pagou sem criar conta ainda)
      await fetch(`${SUPABASE_URL}/rest/v1/user_plans`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SECRET_KEY,
          'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ email, plano: novoPlano }),
      });
    }

    console.log(`✅ Plano atualizado: ${email} → ${novoPlano}`);
    return res.status(200).json({ success: true, email, plano: novoPlano });

  } catch (err) {
    console.error('Erro webhook:', err);
    return res.status(500).json({ error: 'Erro interno no webhook.' });
  }
}
