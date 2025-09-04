export default async function handler(req, res) {
  // CORS
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // --- parseo robusto del body (req.body puede venir undefined)
  let bodyTxt = '';
  try {
    if (req.body && typeof req.body === 'object') {
      // Next.js / runtimes que ya parsean
      bodyTxt = JSON.stringify(req.body);
    } else {
      bodyTxt = await new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => (data += chunk));
        req.on('end', () => resolve(data || '{}'));
        req.on('error', reject);
      });
    }
  } catch (e) {
    console.error('Body parse error:', e);
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  let payload = {};
  try {
    payload = JSON.parse(bodyTxt || '{}');
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const {
    mode = 'tendencias',
    platform = 'all',
    region = 'MX',
    days = 30,
    topic = ''
  } = payload;

  if (mode !== 'tendencias') {
    return res.status(400).json({ error: 'Unsupported mode' });
  }

  try {
    const systemPrompt =
      'Eres un analista senior de tendencias en social media. Entrega hallazgos accionables, claros y sin relleno. Responde exclusivamente en JSON con los campos solicitados.';

    const userPrompt = `
Parámetros:
- Plataforma: ${platform}
- Región: ${region}
- Ventana: últimos ${days} días
- Tema (opcional): ${topic || '—'}

Entrega:
- "top5": 5 bullets concretos sobre lo que más creció/funcionó en la ventana indicada.
- "forecast": 3 bullets con hipótesis para el próximo mes (temas/formatos a apostar).
- Evita números inventados; usa lenguaje de tendencia.
- Tono ejecutivo.
    `.trim();

    // Construimos un ÚNICO input string (más compatible)
    const fullInput = `${systemPrompt}\n\n${userPrompt}`;

    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: fullInput,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'trends_report',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['top5', 'forecast'],
              properties: {
                top5: { type: 'array', minItems: 5, maxItems: 5, items: { type: 'string' } },
                forecast: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'string' } }
              }
            }
          }
        }
      })
    });

    if (!r.ok) {
      const errText = await r.text();
      console.error('OpenAI error:', r.status, errText);
      return res.status(r.status).json({ error: `OpenAI ${r.status}: ${errText}` });
    }

    const data = await r.json();
    const jsonText =
      data?.output?.[0]?.content?.[0]?.text ??
      data?.content?.[0]?.text ??
      '{}';

    let out = { top5: [], forecast: [] };
    try { out = JSON.parse(jsonText); } catch (e) {
      console.error('JSON parse from model failed:', e, jsonText);
    }

    return res.status(200).json(out);
  } catch (e) {
    console.error('Handler error:', e);
    return res.status(500).json({ error: e.message });
  }
}
