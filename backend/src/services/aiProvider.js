export async function synthesizeWithAI({ question, context, localAnswer }) {
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  const base = (process.env.AI_API_URL || '').replace(/\/$/, '');
  const model = process.env.AI_MODEL;
  if (!apiKey || !base || !model) return { answer: localAnswer, provider: 'local-analytics' };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 500,
        messages: [
          {
            role: 'system',
            content:
              'You are HMN Agri Trade ERP business assistant. Answer only from the supplied ERP context. State when data is insufficient. Keep answers concise, numeric and action-oriented. Never expose secrets or infer inaccessible data.',
          },
          { role: 'user', content: JSON.stringify({ question, localAnswer, context }) },
        ],
      }),
    });
    if (!response.ok) throw new Error(`AI provider error ${response.status}`);
    const json = await response.json();
    const answer = json?.choices?.[0]?.message?.content?.trim();
    return { answer: answer || localAnswer, provider: model };
  } catch (error) {
    return { answer: localAnswer, provider: 'local-analytics', providerError: error.message };
  } finally {
    clearTimeout(timeout);
  }
}
