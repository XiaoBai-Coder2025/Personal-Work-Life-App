export async function post(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    let message = `请求失败（${res.status}）`;
    try {
      message = JSON.parse(text).error ?? message;
    } catch {
      /* 保持默认提示 */
    }
    throw new Error(message);
  }
  return text;
}

export async function askAI(messages) {
  const text = await post('/api/ai/chat', { messages });
  let reply = '';
  try {
    reply = JSON.parse(text)?.choices?.[0]?.message?.content ?? '';
  } catch {
    reply = '';
  }
  if (!reply) throw new Error('AI 没有返回内容，请检查服务地址与模型名');
  return reply;
}

export async function parseFile(filename, base64) {
  const text = await post('/api/import/parse', { filename, base64 });
  return JSON.parse(text).text;
}

export async function fileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const size = 0x8000;
  for (let i = 0; i < bytes.length; i += size) {
    binary += String.fromCharCode(...bytes.subarray(i, i + size));
  }
  return btoa(binary);
}
