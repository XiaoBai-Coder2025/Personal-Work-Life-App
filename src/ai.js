export async function chatProxy({ settings, messages, fetchImpl }) {
  const baseUrl = (settings?.aiBaseUrl ?? '').trim();
  const key = (settings?.aiKey ?? '').trim();
  const model = (settings?.aiModel ?? '').trim();
  if (!key) throw new Error('还没有配置 AI Key，请到「数据与设置」里填写。');
  if (!baseUrl) throw new Error('还没有配置 AI 服务地址，请到「数据与设置」里填写。');
  if (!Array.isArray(messages) || !messages.length) throw new Error('消息不能为空');

  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model: model || 'gpt-4o-mini', messages, stream: false }),
  });
  const text = await response.text();
  return { status: response.status ?? 200, text };
}

export function pickReply(text) {
  try {
    const data = JSON.parse(text);
    return data?.choices?.[0]?.message?.content ?? '';
  } catch {
    return '';
  }
}
