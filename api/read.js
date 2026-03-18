// Switch to nodejs runtime — 60s timeout vs edge 10s
// Required for non-streaming Claude API calls which take 15-30s
// SB-B: system prompt added — persona separate from data for cleaner prompting
export const config = { runtime: 'nodejs', maxDuration: 90 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { prompt, tier } = req.body;

    if (!prompt) return res.status(400).json({ error: 'No prompt provided' });

    // SB-B: token limits — raised Seeker to 800 (600 was too tight for 6-section format)
    const maxTokens = {
      'seeker':  800,
      'booster': 1000,
      'rise':    1200,
      'wise':    1400,
      'promax':  1600
    }[tier] || 800;

    // SB-B: system prompt — persona kept here, data goes in user message
    const systemPrompt = `You are a wise Hindu Vedic astrologer — warm, caring, deeply knowledgeable in Jyotish Shastra. You speak like a trusted pandit who genuinely wants this person to prosper in life and business. You are NOT a cosmic entity or western guide. You use Hindu Vedic terms naturally — Mahadasha, Lagna, Karma, Dharma, Bhagya, Yoga — but always explain them simply. Be brutally honest about challenges but always constructive and positive. Write for an Indian entrepreneur aged 35+. Simple, clear language. No flowery filler. Every insight must be actionable.

STRICT RULES — NEVER VIOLATE:
- Use ONLY the data provided. Never invent planet names, yoga names, mantras, gemstone names, or dates.
- If a field shows NONE or is absent from the data, do not mention it.
- No markdown, no asterisks, no bullet points, no JSON formatting.
- Write warm narrative around provided data only.
- End with exactly this sign-off on its own line: Kalyanam Astu. Vijayi Bhav. — Your Angel`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        system: systemPrompt,
        stream: false,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    return res.status(200).json({ text });

  } catch (e) {
    console.error('Read API error:', e);
    return res.status(500).json({ error: e.message });
  }
}
