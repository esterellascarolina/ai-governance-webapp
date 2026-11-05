/* Cloudflare Worker — Gemini proxy for the AI Assistant tab (js/ai-chat.js)
   Endpoints:
     POST /embed     { text, task_type? } -> { embedding: number[] }
     POST /generate  { prompt }           -> { text: string }
   Secrets / variables (set in Cloudflare dashboard > Worker > Settings > Variables and Secrets):
     GEMINI_API_KEY   (Secret, required)
     ALLOWED_ORIGIN   (Text, comma-separated list, e.g. https://electriai.com,https://www.electriai.com — use * only while testing)
     GEMINI_MODEL     (Text, optional, defaults to gemini-3.8-flash)
*/
const API = 'https://generativelanguage.googleapis.com/v1beta/models';
const EMBED_MODEL = 'gemini-embedding-001'; // must match paper_embeddings.json
const EMBED_DIM = 768;                      // must match paper_embeddings.json
const MAX_PROMPT_CHARS = 60000;

export default {
  async fetch(request, env) {
    const allowed = (env.ALLOWED_ORIGIN || '*').split(',').map(o => o.trim().replace(/\/+$/, ''));
    const reqOrigin = request.headers.get('Origin') || '';
    const origin = allowed.includes('*') ? '*' : (allowed.includes(reqOrigin) ? reqOrigin : allowed[0]);
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
    if (!env.GEMINI_API_KEY) return json({ error: 'GEMINI_API_KEY secret is not set' }, 500);

    const path = new URL(request.url).pathname.replace(/\/+$/, '');
    let body;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

    const headers = { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY };

    try {
      if (path === '/embed') {
        const text = String(body.text || '').slice(0, 4000);
        if (!text) return json({ error: 'Missing text' }, 400);
        const r = await fetch(`${API}/${EMBED_MODEL}:embedContent`, {
          method: 'POST', headers,
          body: JSON.stringify({
            content: { parts: [{ text }] },
            taskType: body.task_type || 'RETRIEVAL_QUERY',
            outputDimensionality: EMBED_DIM,
          }),
        });
        const data = await r.json();
        if (!r.ok) return json({ error: data.error?.message || 'Embedding failed' }, r.status);
        return json({ embedding: data.embedding.values });
      }

      if (path === '/generate') {
        const prompt = String(body.prompt || '');
        if (!prompt) return json({ error: 'Missing prompt' }, 400);
        if (prompt.length > MAX_PROMPT_CHARS) return json({ error: 'Prompt too long' }, 413);
        const model = env.GEMINI_MODEL || 'gemini-3.8-flash';
        const r = await fetch(`${API}/${model}:generateContent`, {
          method: 'POST', headers,
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3 },
          }),
        });
        const data = await r.json();
        if (!r.ok) return json({ error: data.error?.message || 'Generation failed' }, r.status);
        const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
        return json({ text });
      }

      return json({ error: 'Not found. Use /embed or /generate' }, 404);
    } catch (err) {
      return json({ error: String(err) }, 500);
    }
  },
};
