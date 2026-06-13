// Black Swan Hunter — Minimal API Proxy Server
// Serves the HTML + proxies AI calls to Claude (keeps your API key safe server-side)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname)));

// ── Proxy: AI API (supports DeepSeek + Anthropic) ──
app.post('/api/ai/generate', async (req, res) => {
  try {
    const { prompt, matchId } = req.body;
    const apiKey = req.body.apiKey || process.env.DEEPSEEK_API_KEY || process.env.ANTHROPIC_API_KEY;

    if (!apiKey || !apiKey.startsWith('sk-')) {
      return res.status(400).json({ error: 'Missing API Key. Set DEEPSEEK_API_KEY or ANTHROPIC_API_KEY in .env' });
    }

    console.log(`🤖 Generating AI analysis for match #${matchId}...`);

    let narrative, model;

    // Detect API type by key prefix
    if (apiKey.startsWith('sk-ant')) {
      // ── Anthropic Claude API ──
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514', max_tokens: 500,
          system: '你是 Black Swan Hunter v3.2，专精于识别FIFA世界杯高风险冷门条件。用中文回复，叙述分析风格，3-5句话，要有洞察力。直接给分析。',
          messages: [{ role: 'user', content: prompt }]
        })
      });
      if (!resp.ok) { const t = await resp.text(); return res.status(resp.status).json({ error: `Claude error: ${resp.status}`, detail: t }); }
      const data = await resp.json();
      narrative = data.content[0].text.trim();
      model = 'claude';
    } else {
      // ── DeepSeek API (OpenAI-compatible) ──
      const resp = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'deepseek-chat', max_tokens: 500, temperature: 0.7,
          messages: [
            { role: 'system', content: '你是 Black Swan Hunter v3.2，专精于识别FIFA世界杯高风险冷门条件。用中文回复，叙述分析风格，3-5句话，要有洞察力。直接给分析，不要"根据数据显示"这类开头。' },
            { role: 'user', content: prompt }
          ]
        })
      });
      if (!resp.ok) { const t = await resp.text(); return res.status(resp.status).json({ error: `DeepSeek error: ${resp.status}`, detail: t }); }
      const data = await resp.json();
      narrative = data.choices[0].message.content.trim();
      model = 'deepseek-chat';
    }

    console.log(`   ✅ Generated ${narrative.length} chars via ${model}`);
    res.json({ narrative, model });
  } catch (err) {
    console.error('AI proxy error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── API: Save/Load user config ──────────────────
app.get('/api/config/status', (req, res) => {
  const hasKey = !!(process.env.DEEPSEEK_API_KEY || process.env.ANTHROPIC_API_KEY);
  const provider = process.env.DEEPSEEK_API_KEY ? 'DeepSeek' : process.env.ANTHROPIC_API_KEY ? 'Claude' : null;
  res.json({
    serverRunning: true,
    aiAvailable: !!provider,
    provider: provider,
    message: provider ? `AI ready (${provider})` : 'Set DEEPSEEK_API_KEY or ANTHROPIC_API_KEY in .env'
  });
});

// Health check for cloud deployment
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ── Fallback ─────────────────────────────────────
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'BlackSwanHunter.html'));
  }
});

// ── Start ────────────────────────────────────────
const os = require('os');
function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

const localIP = getLocalIP();
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('🦢  Black Swan Hunter v2.0');
  console.log(`    本机: http://localhost:${PORT}`);
  console.log(`    手机: http://${localIP}:${PORT}`);
  const provider = process.env.DEEPSEEK_API_KEY ? 'DeepSeek' : process.env.ANTHROPIC_API_KEY ? 'Claude' : null;
  console.log(`    AI: ${provider ? provider + ' Ready' : 'Set API key in .env'}\n`);
  exec(process.platform === 'win32' ? `start "" "http://localhost:${PORT}"` : `open "http://localhost:${PORT}"`, () => {});
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} already in use. Close other instances or run:\n   netstat -ano | findstr :${PORT}\n   taskkill /F /PID <PID>\n`);
  } else { console.error(e); }
  process.exit(1);
});
