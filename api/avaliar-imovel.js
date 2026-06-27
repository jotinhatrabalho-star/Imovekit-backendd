// /api/avaliar-imovel.js
// Vercel Serverless Function — estima o preço de mercado de um imóvel
// Requer plano Pro ou Equipa (verificado via Supabase).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

async function verificarPlano(token) {
  if (!token) return null;
  try {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'apikey': SUPABASE_SECRET_KEY,
        'Authorization': `Bearer ${token}`,
      },
    });
    const userData = await userRes.json();
    const email = userData?.email;
    if (!email) return null;

    const planRes = await fetch(`${SUPABASE_URL}/rest/v1/user_plans?email=eq.${encodeURIComponent(email)}&select=plano`, {
      headers: {
        'apikey': SUPABASE_SECRET_KEY,
        'Authorization': `Bearer ${SUPABASE_SECRET_KEY}`,
      },
    });
    const planData = await planRes.json();
    return planData?.[0]?.plano || 'gratis';
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Verificar plano Pro
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const plano = await verificarPlano(token);

  if (!plano || plano === 'gratis') {
    return res.status(403).json({
      error: 'A Avaliação de Imóvel é exclusiva dos planos Pro e Equipa.',
      upgrade: true
    });
  }

  try {
    const { tipo, finalidade, bairro, cidade, area, quartos, banheiros, vagas, diferenciais, fotos } = req.body;

    if (!bairro || !cidade) return res.status(400).json({ error: 'Bairro e cidade são obrigatórios.' });

    const temFotos = Array.isArray(fotos) && fotos.length > 0;

    const promptTexto = `Você é um avaliador imobiliário brasileiro experiente. Pesquise na web por imóveis semelhantes ao descrito abaixo, à venda ou alugados na mesma região, em portais como ZAP Imóveis, OLX, Viva Real e QuintoAndar. ${temFotos ? 'Além disso, analise as fotos anexadas do imóvel — observe o estado de conservação, qualidade do acabamento, iluminação natural e padrão do imóvel — para ajustar a estimativa.' : ''} Use tudo isso para estimar um preço justo.

IMÓVEL A AVALIAR:
- Tipo: ${tipo || 'não informado'}
- Finalidade: ${finalidade || 'Venda'}
- Localização: ${bairro}, ${cidade}
- Área: ${area ? area + 'm²' : 'não informada'}
- Quartos: ${quartos || 'não informado'}
- Banheiros: ${banheiros || 'não informado'}
- Vagas: ${vagas || 'não informado'}
- Diferenciais: ${Array.isArray(diferenciais) && diferenciais.length > 0 ? diferenciais.join(', ') : 'nenhum'}
- Fotos: ${temFotos ? fotos.length : 'nenhuma'}

Responda APENAS em JSON puro, sem markdown. Estrutura exata:
{"preco_min":"R$ XXX.XXX","preco_max":"R$ XXX.XXX","preco_m2":"R$ X.XXX/m²","analise_fotos":"${temFotos ? 'observação sobre as fotos' : 'null'}","justificativa":"2-3 frases com base na pesquisa","confianca":"Alta, Média ou Baixa"}`;

    const content = [{ type: 'text', text: promptTexto }];
    if (temFotos) {
      fotos.slice(0, 3).forEach(foto => {
        content.push({ type: 'image', source: { type: 'base64', media_type: foto.mediaType || 'image/jpeg', data: foto.base64 } });
      });
    }

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{ role: 'user', content }],
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      }),
    });

    if (!anthropicRes.ok) return res.status(502).json({ error: 'Erro ao avaliar o imóvel.' });

    const data = await anthropicRes.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text || '').join('');
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Erro:', err);
    return res.status(500).json({ error: 'Erro interno ao avaliar o imóvel.' });
  }
}
