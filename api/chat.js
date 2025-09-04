export default async function handler(req, res) {
    // CORS para llamadas desde tu landing estática
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
      const { prompt } = req.body || {};
      if (!prompt) return res.status(400).json({ error: 'Missing prompt' });
  
      // Llama al endpoint de Responses (modelo a tu elección)
      const r = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4.1-mini',
          input: [
            { role: 'system', content: 'Eres un asistente experto en tendencias de social media.' },
            { role: 'user', content: prompt }
          ]
        })
      });
  
      if (!r.ok) {
        const err = await r.text();
        return res.status(r.status).json({ error: err });
      }
  
      const data = await r.json();
      // El texto suele venir en data.output[0].content[0].text en Responses
      const text =
        data?.output?.[0]?.content?.[0]?.text ??
        data?.content?.[0]?.text ??
        JSON.stringify(data);
  
      return res.status(200).json({ reply: text });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
  