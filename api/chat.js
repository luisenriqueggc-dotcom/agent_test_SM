export default async function handler(req, res) {
  // CORS básico (si luego lo quieres limitar a tu dominio, cámbialo)
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

  try {
    const { mode = 'tendencias', platform = 'all', region = 'MX', days = 30, topic = '' } = req.body || {};
    if (mode !== 'tendencias') return res.status(400).json({ error: 'Unsupported mode' });

    // 1) Prompt (rol del modelo + consigna)
    const systemPrompt =
      'Eres un analista senior de tendencias en social media. Entregas hallazgos accionables, claros y sin relleno. Responde exclusivamente en JSON con los campos solicitados.';

    const userPrompt = `
Genera un mini-reporte de tendencias para social media.

Parámetros:
- Plataforma: ${platform}
- Región: ${region}
- Ventana: últimos ${days} días
- Tema (opcional): ${topic || '—'}

Entrega:
- "top5": 5 bullets concretos sobre lo que más creció/funcionó en la ventana indicada.
- "forecast": 3 bullets con hipótesis para el próximo mes (temas/formatos a apostar).
- Evita citar datos inventados; usa lenguaje de tendencia (no números exactos).
- Tono ejecutivo, útil para marketer.
    `.trim();

    // 2) Llamada al endpoint "Responses" de OpenAI con JSON Schema estricto
    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
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
      const err = await r.text();
      return res.status(r.status).json({ error: err });
    }

    const data = await r.json();
    const jsonText =
      data?.output?.[0]?.content?.[0]?.text ??
      data?.content?.[0]?.text ??
      '{}';

    // 3) Te devolvemos un JSON directo que la UI puede pintar
    let payload;
    try { payload = JSON.parse(jsonText); }
    catch { payload = { top5: [], forecast: [] }; }

    return res.status(200).json(payload);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
