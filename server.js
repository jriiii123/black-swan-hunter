// Black Swan Hunter — Server with Access Key (KaMi) System
require('dotenv').config({ quiet: true });
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const crypto = require('crypto');
const { exec } = require('child_process');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Access Keys (from .env) ───────────
const ACCESS_KEYS = (process.env.ACCESS_KEYS || 'BSH-DEMO-KEY').split(',').map(k => k.trim()).filter(Boolean);
const DEMO_KEYS = (process.env.DEMO_KEYS || 'BSH-DEMO-TEST').split(',').map(k => k.trim()).filter(Boolean);
const VALID_TOKENS = new Map(); // token -> expiry ms

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── Auth Middleware ────────────────────
function requireAuth(req, res, next) {
  // Skip these paths
  if (req.path === '/api/verify' || req.path === '/api/health') return next();

  const token = req.cookies.bsh_token;
  if (token && VALID_TOKENS.has(token)) {
    if (Date.now() < VALID_TOKENS.get(token)) return next();
    VALID_TOKENS.delete(token);
  }

  // API request without auth -> JSON error
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Access denied' });
  }

  // Page request -> login page
  res.send(loginHTML(req.query.error));
}

// ── Login Page HTML ────────────────────
function loginHTML(error) {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Black Swan Hunter — 验证访问</title><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;background:#09090b;color:#f8fafc;min-height:100vh;display:flex;align-items:center;justify-content:center}
.bg{position:fixed;inset:0;z-index:0;pointer-events:none}.bg div{position:absolute;border-radius:50%;filter:blur(140px);opacity:0.1}
.bg div:nth-child(1){width:600px;height:600px;background:radial-gradient(circle,#fbbf24,transparent 70%);top:-200px;right:-150px}
.bg div:nth-child(2){width:500px;height:500px;background:radial-gradient(circle,#ef4444,transparent 70%);bottom:-150px;left:-100px}
.card{position:relative;z-index:1;background:rgba(30,32,48,0.95);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,0.08);border-radius:24px;padding:44px 36px;max-width:400px;width:90%;text-align:center;box-shadow:0 0 60px rgba(251,191,36,0.08)}
.card h1{font-size:26px;font-weight:800;background:linear-gradient(135deg,#fbbf24,#f59e0b,#ef4444);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:6px}
.card .sub{font-size:13px;color:#94a3b8;margin-bottom:28px}
.card input{width:100%;padding:14px 16px;border-radius:12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);color:#f8fafc;font-size:17px;text-align:center;letter-spacing:2px;outline:none;transition:0.3s;font-family:monospace}
.card input:focus{border-color:rgba(251,191,36,0.5);box-shadow:0 0 24px rgba(251,191,36,0.1)}
.card button{width:100%;padding:14px;border-radius:12px;background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#000;font-size:17px;font-weight:700;border:none;cursor:pointer;margin-top:14px;transition:0.3s}
.card button:hover{transform:translateY(-1px);box-shadow:0 8px 24px rgba(251,191,36,0.3)}
.card .hint{font-size:11px;color:#64748b;margin-top:20px}
${error==='invalid'?'<p style="color:#ef4444;font-size:14px;margin-top:14px">❌ 激活码无效，请重试</p>':''}
${error==='expired'?'<p style="color:#fbbf24;font-size:14px;margin-top:14px">⏰ 会话已过期，请重新输入</p>':''}
</style></head><body><div class="bg"><div></div><div></div></div><div class="card">
<div style="font-size:56px;margin-bottom:12px">🦢</div>
<h1>Black Swan Hunter</h1>
<p class="sub">2026世界杯 · 48场小组赛 · AI黑天鹅分析</p>
<form action="/api/verify" method="POST">
<input type="text" name="key" placeholder="输入激活码" autofocus required autocomplete="off">
<button type="submit">🔓 进入系统</button>
</form>
${error==='invalid'?'<p style="color:#ef4444;font-size:14px;margin-top:14px">❌ 激活码无效，请重试</p>':''}
<p class="hint">🔐 需要激活码才能访问 · 联系管理员获取</p>
</div></body></html>`;
}

// ── API: Verify Key ───────────────────
app.post('/api/verify', (req, res) => {
  const key = (req.body.key || '').trim();
  const upperKey = key.toUpperCase();

  // Check demo keys first
  const isDemo = DEMO_KEYS.find(k => k.toUpperCase() === upperKey);
  // Check real keys
  const isReal = ACCESS_KEYS.find(k => k.toUpperCase() === upperKey);

  if (isDemo || isReal) {
    const token = crypto.randomBytes(32).toString('hex');
    VALID_TOKENS.set(token, Date.now() + 30 * 24 * 60 * 60 * 1000);
    res.cookie('bsh_token', token, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax' });
    // Set demo flag cookie (readable by frontend)
    res.cookie('bsh_demo', isDemo ? '1' : '0', { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: false, sameSite: 'lax' });
    console.log(`   ✅ Key: ${key.substring(0,8)}... (${isDemo ? 'DEMO' : 'FULL'})`);
    return res.redirect('/');
  }
  console.log(`   ❌ Bad key: ${key.substring(0,8)}...`);
  res.redirect('/?error=invalid');
});

// ── API: AI Proxy ─────────────────────
app.post('/api/ai/generate', requireAuth, async (req, res) => {
  try {
    const { prompt, matchId } = req.body;
    const apiKey = process.env.DEEPSEEK_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(400).json({ error: 'AI not configured' });

    console.log(`🤖 AI #${matchId}...`);
    let narrative, model;

    if (apiKey.startsWith('sk-ant')) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 500, system: '你是Black Swan Hunter v3.2，专精识别世界杯冷门风险。用中文回复，3-5句话，直接给分析。', messages: [{ role: 'user', content: prompt }] })
      });
      if (!r.ok) { const t = await r.text(); return res.status(r.status).json({ error: t }); }
      narrative = (await r.json()).content[0].text.trim(); model = 'claude';
    } else {
      const r = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({ model: 'deepseek-chat', max_tokens: 500, temperature: 0.7, messages: [{ role: 'system', content: '你是Black Swan Hunter v3.2，专精识别世界杯冷门风险。用中文回复，3-5句话，直接给分析。' }, { role: 'user', content: prompt }] })
      });
      if (!r.ok) { const t = await r.text(); return res.status(r.status).json({ error: t }); }
      narrative = (await r.json()).choices[0].message.content.trim(); model = 'deepseek-chat';
    }
    console.log(`   ✅ ${narrative.length}c via ${model}`);
    res.json({ narrative, model });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Other routes ──────────────────────
app.get('/api/config/status', requireAuth, (req, res) => {
  const p = process.env.DEEPSEEK_API_KEY ? 'DeepSeek' : process.env.ANTHROPIC_API_KEY ? 'Claude' : null;
  res.json({ serverRunning: true, aiAvailable: !!p, provider: p });
});
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// ── Serve static behind auth ──────────
app.use(requireAuth, express.static(path.join(__dirname)));

app.get('*', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'BlackSwanHunter.html'));
});

// ── Start ─────────────────────────────
function getLocalIP() {
  for (const nets of Object.values(os.networkInterfaces()))
    for (const n of nets) if (n.family === 'IPv4' && !n.internal) return n.address;
  return 'localhost';
}
const localIP = getLocalIP();

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('🦢 Black Swan Hunter v2.1');
  console.log(`   本机: http://localhost:${PORT}`);
  console.log(`   LAN:  http://${localIP}:${PORT}`);
  console.log(`   🔑 ${ACCESS_KEYS.length} access keys loaded`);
  console.log(`   🤖 ${process.env.DEEPSEEK_API_KEY ? 'DeepSeek Ready' : 'No AI key'}\n`);
  exec(process.platform === 'win32' ? `start "" "http://localhost:${PORT}"` : `open "http://localhost:${PORT}"`, () => {});
});
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') { console.error(`Port ${PORT} in use.`); process.exit(1); }
  else throw e;
});
