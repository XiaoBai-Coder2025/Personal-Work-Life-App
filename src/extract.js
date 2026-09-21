import path from 'node:path';

const NATIVE = ['.txt', '.md', '.csv', '.json'];

export async function extractText(filename, buffer) {
  const ext = path.extname(filename ?? '').toLowerCase();
  if (NATIVE.includes(ext)) return buffer.toString('utf8');
  if (ext === '.docx') return fromDocx(buffer);
  if (ext === '.pdf') return fromPdf(buffer);
  throw new Error(`暂不支持 ${ext || '这种'} 格式，请用 txt、md、csv、pdf 或 docx。`);
}

async function fromDocx(buffer) {
  let mammoth;
  try {
    mammoth = await import('mammoth');
  } catch {
    throw new Error('Word 正文提取库没有装好，请先把内容另存为 txt 或 csv。');
  }
  const lib = mammoth.default ?? mammoth;
  try {
    const result = await lib.extractRawText({ buffer });
    const text = (result?.value ?? '').trim();
    if (!text) throw new Error('empty');
    return text;
  } catch {
    throw new Error('这个 Word 文件读不出正文，可能是扫描件或已损坏；可以另存为 txt 再导入。');
  }
}

async function fromPdf(buffer) {
  let pdfjs;
  try {
    pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  } catch {
    throw new Error('PDF 正文提取库没有装好，请先把内容另存为 txt 再导入。');
  }
  try {
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: false,
      isEvalSupported: false,
      useWorkerFetch: false,
    }).promise;
    const chunks = [];
    for (let page = 1; page <= doc.numPages; page += 1) {
      const content = await (await doc.getPage(page)).getTextContent();
      chunks.push(content.items.map((item) => item.str ?? '').join(''));
    }
    const text = chunks.join('\n').trim();
    if (!text) throw new Error('empty');
    return text;
  } catch {
    throw new Error('这个 PDF 读不出文字（可能是扫描件或加密文件），我不会猜内容；可以换成 txt 或手动粘贴。');
  }
}
