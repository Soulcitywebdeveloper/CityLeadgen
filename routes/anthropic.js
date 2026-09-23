const express = require('express');
const axios = require('axios');
const { aiLimiter } = require('../middleware/rateLimiter');

const router = express.Router();
const ANTHROPIC_BASE = 'https://api.anthropic.com/v1';
const MODEL = 'claude-sonnet-4-6';

function anthropicClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw Object.assign(new Error('ANTHROPIC_API_KEY is not configured on the server.'), { status: 503 });
  }
  return axios.create({
    baseURL: ANTHROPIC_BASE,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    timeout: 30000,
  });
}

async function callClaude(prompt, maxTokens = 1000) {
  const { data } = await anthropicClient().post('/messages', {
    model: MODEL,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  });
  return data.content.map(b => b.text || '').join('').trim();
}

// ── POST /api/ai/qualify ───────────────────────────────────────────
router.post('/qualify', aiLimiter, async (req, res, next) => {
  try {
    const { name, title, company, size, industry, budget, notes } = req.body;

    const prompt = `You are a B2B sales qualification expert. Score and qualify this lead using BANT/MEDDIC criteria.

Lead: ${name || 'Unknown'}, ${title || 'Unknown role'} at ${company || 'Unknown company'}
Company size: ${size || 'Unknown'} employees | Industry: ${industry || 'Unknown'}
Budget signal: ${budget || 'Unknown'}
Notes: ${notes || 'None provided'}

Respond in this exact format:
SCORE: [0-100]
STATUS: [Hot/Warm/Cold]
SUMMARY: [2-3 sentences on why this score]
NEXT ACTION: [1 concrete recommended next step]
RED FLAGS: [Any concerns, or "None"]`;

    const text = await callClaude(prompt, 600);
    const scoreMatch = text.match(/SCORE:\s*(\d+)/);
    const score = scoreMatch ? parseInt(scoreMatch[1]) : 60;
    const status = score >= 75 ? 'hot' : score >= 50 ? 'warm' : 'cold';

    res.json({ score, status, analysis: text });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/ai/outreach ──────────────────────────────────────────
router.post('/outreach', aiLimiter, async (req, res, next) => {
  try {
    const { name, role, channel, offering, sender, hook, tone, notes } = req.body;

    const isEmail = (channel || '').toLowerCase().includes('email');
    const wordLimit = channel === 'LinkedIn connection note' ? '~300 characters'
      : (channel || '').includes('LinkedIn') ? '~120 words' : '~110 words';

    const prompt = `Write a ${channel || 'cold email'} from ${sender || 'our team'} to ${name || 'there'}, a ${role || 'professional'}.

Offering: ${offering || 'our product'}
Personalization hook: ${hook || 'none — keep it relevant but general'}
Extra context: ${notes || 'none'}
Tone: ${tone || 'Professional & concise'}
Length: ${wordLimit}
${isEmail ? 'First line must be "Subject: …" then a blank line then the body.' : ''}

No generic openers. Be specific to their role. One clear low-friction CTA. Return only the message.`;

    const message = await callClaude(prompt, 500);
    res.json({ message, channel });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/ai/batch-outreach ────────────────────────────────────
// Generates outreach for multiple leads sequentially (streaming via SSE)
router.post('/batch-outreach', aiLimiter, async (req, res, next) => {
  try {
    const { leads, channel, tone, offering, sender, context } = req.body;
    if (!leads || !leads.length) return res.status(400).json({ error: 'No leads provided.' });

    // Use Server-Sent Events so the client sees each message as it's generated
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const isEmail = (channel || '').toLowerCase().includes('email');
    const wordLimit = channel === 'LinkedIn connection note' ? '~300 characters'
      : (channel || '').includes('LinkedIn') ? '~120 words' : '~110 words';

    for (let i = 0; i < leads.length; i++) {
      const lead = leads[i];
      const prompt = `Write a ${channel || 'cold email'} from ${sender || 'our team'} to ${lead.name}, ${lead.title} at ${lead.company} (${lead.industry}).

Offering: ${offering || 'our product'}
Their context: ${lead.notes || 'none'}
${context ? 'Campaign context: ' + context : ''}
Tone: ${tone || 'Professional & concise'}
Length: ${wordLimit}
${isEmail ? 'First line must be "Subject: …" then blank line then body.' : ''}

No generic openers. One clear CTA. Return only the message.`;

      try {
        const message = await callClaude(prompt, 500);
        res.write(`data: ${JSON.stringify({ index: i, lead: lead.name, message, done: false })}\n\n`);
      } catch (e) {
        res.write(`data: ${JSON.stringify({ index: i, lead: lead.name, message: 'Error generating — please retry.', done: false })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true, total: leads.length })}\n\n`);
    res.end();
  } catch (err) {
    next(err);
  }
});

// ── POST /api/ai/discover ──────────────────────────────────────────
router.post('/discover', aiLimiter, async (req, res, next) => {
  try {
    const { title, industry, size, location, pain } = req.body;

    const prompt = `Generate 6 realistic B2B contact profiles matching this ICP:
Job title: ${title || 'any relevant B2B role'}
Industry: ${industry || 'any B2B industry'}
Company size: ${size || 'any'}
Region: ${location || 'global'}
Pain points: ${pain || 'not specified'}

Return ONLY a valid JSON array, no markdown:
[{"name":"...","title":"...","company":"...","industry":"...","location":"...","companySize":"...","email":"...","linkedinSlug":"...","painPoint":"...","score":85,"whyFit":"..."}]

Vary scores 55–95. Make names and companies diverse and realistic.`;

    const text = await callClaude(prompt, 1500);
    const clean = text.replace(/```json|```/g, '').trim();
    const contacts = JSON.parse(clean);
    res.json({ contacts });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
