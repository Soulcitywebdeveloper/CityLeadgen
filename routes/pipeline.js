const express = require('express');
const { apiLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// In-memory store — replace with a database (SQLite/Postgres) for production
let pipeline = [
  { id:1, name:"Sarah Chen",   title:"Head of Marketing", company:"Acme Corp",  industry:"SaaS",             score:91, email:"sarah@acme.com",    notes:"Struggling with manual outreach", status:"hot",  createdAt: new Date().toISOString() },
  { id:2, name:"James Okafor", title:"VP of Sales",       company:"Finova",     industry:"Fintech",           score:82, email:"james@finova.io",    notes:"Team of 10 SDRs, ready to scale", status:"hot",  createdAt: new Date().toISOString() },
  { id:3, name:"Priya Mehta",  title:"Growth Lead",       company:"RetailX",    industry:"E-commerce",        score:68, email:"priya@retailx.com",  notes:"Evaluating tools Q3",             status:"warm", createdAt: new Date().toISOString() },
  { id:4, name:"Tom Nguyen",   title:"Founder",           company:"DevStream",  industry:"Developer Tools",   score:55, email:"tom@devstream.io",   notes:"Early stage, budget unclear",     status:"warm", createdAt: new Date().toISOString() },
  { id:5, name:"Kwame Asante", title:"CEO",               company:"LogiAI",     industry:"Logistics",         score:76, email:"kwame@logiai.com",   notes:"Active on LinkedIn about AI ops", status:"hot",  createdAt: new Date().toISOString() },
  { id:6, name:"Laura Benz",   title:"Marketing Manager", company:"HealthPlus", industry:"Health",            score:38, email:"laura@healthplus.com",notes:"No clear pain point yet",        status:"cold", createdAt: new Date().toISOString() },
  { id:7, name:"Amara Diallo", title:"Sales Director",    company:"CloudBase",  industry:"SaaS",             score:88, email:"amara@cloudbase.io", notes:"Actively hiring, scaling fast",   status:"hot",  createdAt: new Date().toISOString() },
  { id:8, name:"Ravi Sharma",  title:"Head of Growth",   company:"PaySwift",   industry:"Fintech",           score:72, email:"ravi@payswift.com",  notes:"Interested in outbound automation",status:"warm",createdAt: new Date().toISOString() },
];
let nextId = 9;

function scoreToStatus(score) {
  return score >= 75 ? 'hot' : score >= 50 ? 'warm' : 'cold';
}

// GET /api/pipeline — list with optional search & filters
router.get('/', apiLimiter, (req, res) => {
  const { q, status, industry, sort = 'score' } = req.query;

  let results = [...pipeline];

  if (q) {
    const term = q.toLowerCase();
    results = results.filter(c =>
      [c.name, c.title, c.company, c.industry, c.email, c.notes]
        .some(f => f && f.toLowerCase().includes(term))
    );
  }
  if (status)   results = results.filter(c => c.status === status);
  if (industry) results = results.filter(c => c.industry === industry);

  if (sort === 'score')   results.sort((a, b) => b.score - a.score);
  if (sort === 'name')    results.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === 'company') results.sort((a, b) => a.company.localeCompare(b.company));
  if (sort === 'newest')  results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({ leads: results, total: results.length });
});

// GET /api/pipeline/:id
router.get('/:id', apiLimiter, (req, res) => {
  const lead = pipeline.find(l => l.id === parseInt(req.params.id));
  if (!lead) return res.status(404).json({ error: 'Lead not found.' });
  res.json({ lead });
});

// POST /api/pipeline — create one lead
router.post('/', apiLimiter, (req, res) => {
  const { name, title, company, industry, score = 50, email, notes } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required.' });

  const lead = {
    id: nextId++,
    name, title: title || '', company: company || '',
    industry: industry || '', score: parseInt(score),
    status: scoreToStatus(parseInt(score)),
    email: email || '', notes: notes || '',
    createdAt: new Date().toISOString(),
  };
  pipeline.unshift(lead);
  res.status(201).json({ lead });
});

// POST /api/pipeline/bulk — import multiple leads at once
router.post('/bulk', apiLimiter, (req, res) => {
  const { leads } = req.body;
  if (!Array.isArray(leads) || !leads.length) {
    return res.status(400).json({ error: 'Provide a non-empty leads array.' });
  }

  const created = leads.map(l => ({
    id: nextId++,
    name: l.name || 'Unknown',
    title: l.title || '',
    company: l.company || '',
    industry: l.industry || '',
    score: parseInt(l.score) || 50,
    status: scoreToStatus(parseInt(l.score) || 50),
    email: l.email || '',
    notes: l.notes || '',
    createdAt: new Date().toISOString(),
  }));

  pipeline.unshift(...created);
  res.status(201).json({ created: created.length, leads: created });
});

// PATCH /api/pipeline/:id — update a lead
router.patch('/:id', apiLimiter, (req, res) => {
  const idx = pipeline.findIndex(l => l.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Lead not found.' });

  const allowed = ['name','title','company','industry','score','email','notes','status'];
  allowed.forEach(key => {
    if (req.body[key] !== undefined) pipeline[idx][key] = req.body[key];
  });
  if (req.body.score !== undefined) {
    pipeline[idx].status = scoreToStatus(parseInt(req.body.score));
  }
  res.json({ lead: pipeline[idx] });
});

// DELETE /api/pipeline/:id
router.delete('/:id', apiLimiter, (req, res) => {
  const idx = pipeline.findIndex(l => l.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Lead not found.' });
  pipeline.splice(idx, 1);
  res.json({ deleted: true });
});

// GET /api/pipeline/stats/summary
router.get('/stats/summary', apiLimiter, (req, res) => {
  const total = pipeline.length;
  const hot   = pipeline.filter(l => l.score >= 75).length;
  const warm  = pipeline.filter(l => l.score >= 50 && l.score < 75).length;
  const cold  = pipeline.filter(l => l.score < 50).length;
  const avg   = total ? Math.round(pipeline.reduce((s, l) => s + l.score, 0) / total) : 0;
  const industries = [...new Set(pipeline.map(l => l.industry).filter(Boolean))];
  res.json({ total, hot, warm, cold, avgScore: avg, industries });
});

module.exports = router;
