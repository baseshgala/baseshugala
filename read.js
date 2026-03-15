export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const { prompt, tier, stream = true } = await req.json();

    const maxTokens={
      'seeker':400,
      'booster':600,
      'rise':900,
      'wise':1000,
      'promax':1200
    }[tier]||400;

    const body = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      stream: stream,
      messages: [{ role: 'user', content: prompt }]
    };

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    });

    if (!stream) {
      const json = await res.json();
      const text = json.content?.[0]?.text || '';
      return new Response(JSON.stringify({ text }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Stream response
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) { controller.close(); break; }
          const chunk = decoder.decode(value);
          for (const line of chunk.split('\n')) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') { controller.enqueue(encoder.encode('data: [DONE]\n\n')); break; }
              try {
                const json = JSON.parse(data);
                if (json.type === 'content_block_delta') {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: { text: json.delta?.text || '' } })}\n\n`));
                }
              } catch (e) {}
            }
          }
        }
      }
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
