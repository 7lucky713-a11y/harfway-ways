import { getVercelOidcToken } from '@vercel/oidc';
import { archiveCors, authorizeArchiveRequest } from './archive-core.js';

const MODEL = 'openai/gpt-5.6-luna';
const MAX_BODY = 30000;
const MAX_TITLE = 280;
const MAX_SUGGESTIONS = 12;
const KINDS = new Set(['typo','missing','duplicate','grammar','punctuation','notation']);

function clean(value, max) {
  return String(value ?? '').slice(0, max);
}
function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body); } catch { return {}; }
}
function gatewayError(status) {
  if (status === 401 || status === 403) return 'ai_gateway_auth_unavailable';
  if (status === 402) return 'ai_budget_exceeded';
  if (status === 429) return 'ai_rate_limited';
  if (status >= 500) return 'ai_gateway_unavailable';
  return 'ai_proofread_failed';
}
function outputText(data) {
  if (typeof data?.output_text === 'string') return data.output_text;
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') return content.text;
    }
  }
  return '';
}
function sanitizeSuggestions(raw, fields) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const field = item.field === 'title' ? 'title' : item.field === 'body' ? 'body' : '';
    const before = clean(item.before, 500);
    const after = clean(item.after, 500);
    const reason = clean(item.reason, 220);
    const kind = KINDS.has(item.kind) ? item.kind : 'typo';
    if (!field || !before || before === after || !fields[field]?.includes(before)) continue;
    const key = field + '\n' + before + '\n' + after;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ field, kind, before, after, reason });
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}

const schema = {
  type: 'object',
  properties: {
    suggestions: {
      type: 'array',
      maxItems: MAX_SUGGESTIONS,
      items: {
        type: 'object',
        properties: {
          field: { type: 'string', enum: ['title','body'] },
          kind: { type: 'string', enum: ['typo','missing','duplicate','grammar','punctuation','notation'] },
          before: { type: 'string' },
          after: { type: 'string' },
          reason: { type: 'string' }
        },
        required: ['field','kind','before','after','reason'],
        additionalProperties: false
      }
    }
  },
  required: ['suggestions'],
  additionalProperties: false
};

const instructions = `あなたは日本語の文章校正者です。HARF-WAYの非公開プレイノートで、書き手本人の文体を壊さず「明確な誤字脱字」だけを検出してください。

対象:
- タイポ、文字の抜け・余分な文字
- 同じ助詞・単語の明らかな重複
- 文意を損なう明確な文法ミス
- 括弧や句読点の明らかな欠落・対応漏れ
- 同一文章内で明らかに同じ固有名詞を別表記している場合の表記ゆれ

禁止:
- 文体改善、言い換え、簡潔化、語尾変更
- 「もっと自然」「読みやすい」だけを理由にした修正
- 口語、断片文、独特なリズム、意図的な崩しの修正
- 一般知識を根拠にゲーム固有名詞・キャラクター名を勝手に直すこと
- 確信がない指摘

各候補の before は、入力された title または body に実在する連続文字列をそのまま返してください。可能なら同じfield内で一意になる長さにしてください。after はその箇所だけを置換した文字列にしてください。全文を書き直さないでください。最大12件。問題がなければ suggestions は空配列です。`;

async function callProofreader(title, body) {
  const token = process.env.AI_GATEWAY_API_KEY || await getVercelOidcToken();
  if (!token) {
    const error = new Error('ai_gateway_auth_unavailable');
    error.status = 503;
    throw error;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch('https://ai-gateway.vercel.sh/v1/responses', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json'
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        instructions,
        input: `[title]\n${title || '(空欄)'}\n\n[body]\n${body}`,
        reasoning: { effort: 'none' },
        max_output_tokens: 2200,
        text: {
          format: {
            type: 'json_schema',
            name: 'harfway_proofreading',
            strict: true,
            schema
          }
        }
      })
    });

    if (!response.ok) {
      const error = new Error(gatewayError(response.status));
      error.status = response.status >= 500 ? 503 : response.status;
      throw error;
    }

    const data = await response.json();
    const raw = outputText(data);
    if (!raw) {
      const error = new Error('ai_proofread_empty');
      error.status = 502;
      throw error;
    }

    let parsed;
    try { parsed = JSON.parse(raw); }
    catch {
      const error = new Error('ai_proofread_invalid_json');
      error.status = 502;
      throw error;
    }

    return sanitizeSuggestions(parsed.suggestions, { title, body });
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  archiveCors(res);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const previewSelfTest = process.env.VERCEL_ENV !== 'production' && req.method === 'GET' && String(req.query?.selftest || '') === '1';
  if (req.method !== 'POST' && !previewSelfTest) return res.status(405).json({ ok:false, error:'method_not_allowed' });

  try {
    if (process.env.VERCEL_ENV === 'production') {
      const auth = await authorizeArchiveRequest(req);
      if (!auth.ok) return res.status(auth.status || 401).json({ ok:false, error:auth.error || 'unauthorized' });
    }

    const input = previewSelfTest
      ? { title:'テスト', body:'ゲームを遊んでいて、なかなか見つけれられなくて困った。' }
      : parseBody(req);
    const title = clean(input.title, MAX_TITLE);
    const body = clean(input.body, MAX_BODY);
    if (!body.trim()) return res.status(400).json({ ok:false, error:'body_required' });
    if (String(input.body ?? '').length > MAX_BODY) return res.status(413).json({ ok:false, error:'body_too_long', maxLength:MAX_BODY });

    const suggestions = await callProofreader(title, body);
    return res.status(200).json({
      ok:true,
      mode:'typo-only',
      model:MODEL,
      suggestions,
      count:suggestions.length,
      ...(previewSelfTest ? { selftest:true } : {})
    });
  } catch (error) {
    if (error?.name === 'AbortError') return res.status(504).json({ ok:false, error:'ai_proofread_timeout' });
    console.error('[game-notes-proofread]', error?.message || error);
    return res.status(error?.status || 500).json({ ok:false, error:error?.message || 'proofread_failed' });
  }
}
