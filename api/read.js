// Switch to nodejs runtime — 60s timeout vs edge 10s
// Required for non-streaming Claude API calls which take 15-30s
export const config = { runtime: 'nodejs', maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { prompt, tier } = req.body;

    if (!prompt) return res.status(400).json({ error: 'No prompt provided' });

    // Non-streaming — complete text in one response, no chunk corruption
    const maxTokens = {
      'seeker':  1500,
      'booster': 2500,
      'rise':    3500,
      'wise':    4500,
      'promax':  6000
    }[tier] || 1500;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: maxTokens,
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
