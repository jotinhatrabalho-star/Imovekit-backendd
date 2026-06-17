export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  try {
    const { tipo, finalidade, bairro, cidade, area, quartos, banheiros, vagas, valor, diferenciais, extras } = req.body;
    if (!bairro || !cidade) {
      return res.status(400).json({ error: 'Bairro e cidade são obrigatórios.' });
    }

    const prompt = `Você é um especialista em marketing imobiliário brasileiro. Com base nos dados abaixo, crie 3 peças de comunicação profissionais em português do Brasil.

DADOS DO IMÓVEL:
- Tipo: ${tipo || 'não informado'}
- Finalidade: ${finalidade || 'não informada'}
- Localização: ${bairro}, ${cidade}
- Área: ${area ? area + 'm²' : 'não informada'}
- Quartos: ${quartos || 'não informado'}
- Banheiros: ${banheiros || 'não informado'}
- Vagas: ${vagas || 'não informado'}
- Valor: ${valor ? 'R$ ' + valor : 'consulte'}
- Diferenciais: ${Array.isArray(diferenciais) && diferenciais.length > 0 ? diferenciais.join(', ') : 'não informados'}
- Observações: ${extras || 'nenhuma'}

Responda APENAS em JSON puro, sem markdown, sem blocos de código, sem texto antes ou depois. Estrutura exata:
{"anuncio":"texto do anúncio para portal imobiliário (3-4 parágrafos, título em maiúsculas na primeira linha, formal e persuasivo)","instagram":"post para Instagram (envolvente, emojis estratégicos, call to action, hashtags no final)","whatsapp":"mensagem para WhatsApp (curta, direta, amigável)"}`;

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error('Erro Anthropic:', errText);
      return res.status(502).json({ error: 'Erro ao gerar o kit. Tenta novamente.' });
    }

    const data = await anthropicRes.json();
    const text = (data.content || []).map(b => b.text || '').join('');
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    return res.status(200).json(parsed);
  } catch (err) {
    console.error('Erro no servidor:', err);
    return res.status(500).json({ error: 'Erro interno ao gerar o kit.' });
  }
}
