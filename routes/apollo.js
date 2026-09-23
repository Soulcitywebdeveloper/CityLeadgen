const express = require('express');
const axios = require('axios');
const NodeCache = require('node-cache');
const { apolloLimiter } = require('../middleware/rateLimiter');

const router = express.Router();
const cache = new NodeCache({ stdTTL: 300 }); // Cache responses 5 minutes

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

// Shared Apollo axios instance — key lives server-side, never exposed to browser
function apolloClient() {
  if (!process.env.APOLLO_API_KEY) {
    throw Object.assign(new Error('APOLLO_API_KEY is not configured on the server.'), { status: 503 });
  }
  return axios.create({
    baseURL: APOLLO_BASE,
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': process.env.APOLLO_API_KEY,
      'Cache-Control': 'no-cache',
    },
    timeout: 15000,
  });
}

// ── POST /api/apollo/people/search ────────────────────────────────
// Body: { person_titles, person_locations, q_organization_name,
//         organization_num_employees_ranges, page, per_page }
router.post('/people/search', apolloLimiter, async (req, res, next) => {
  try {
    const {
      person_titles = [],
      person_locations = [],
      q_organization_name,
      organization_num_employees_ranges = [],
      page = 1,
      per_page = 25,
    } = req.body;

    // Build cache key from search params
    const cacheKey = 'people:' + JSON.stringify({ person_titles, person_locations, q_organization_name, organization_num_employees_ranges, page, per_page });
    const cached = cache.get(cacheKey);
    if (cached) return res.json({ ...cached, cached: true });

    const body = { page, per_page };
    if (person_titles.length)                    body.person_titles = person_titles;
    if (person_locations.length)                 body.person_locations = person_locations;
    if (q_organization_name)                     body.q_organization_name = q_organization_name;
    if (organization_num_employees_ranges.length) body.organization_num_employees_ranges = organization_num_employees_ranges;

    const { data } = await apolloClient().post('/mixed_people/search', body);

    const result = {
      people: data.people || [],
      pagination: data.pagination || {},
      breadcrumbs: data.breadcrumbs || [],
      rate_limit_requests_left: data.rate_limit_requests_left,
    };

    cache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    next(apolloError(err));
  }
});

// ── POST /api/apollo/people/enrich ────────────────────────────────
// Body: { email } OR { first_name, last_name, domain }
router.post('/people/enrich', apolloLimiter, async (req, res, next) => {
  try {
    const { email, first_name, last_name, domain } = req.body;

    if (!email && !(first_name && last_name && domain)) {
      return res.status(400).json({ error: 'Provide email OR first_name + last_name + domain.' });
    }

    const cacheKey = 'enrich:' + JSON.stringify({ email, first_name, last_name, domain });
    const cached = cache.get(cacheKey);
    if (cached) return res.json({ ...cached, cached: true });

    const body = { reveal_personal_emails: false };
    if (email)      body.email = email;
    if (first_name) body.first_name = first_name;
    if (last_name)  body.last_name = last_name;
    if (domain)     body.domain = domain;

    const { data } = await apolloClient().post('/people/match', body);

    if (!data.person) {
      return res.status(404).json({ error: 'No match found. Try a different email or name + domain.' });
    }

    const result = { person: data.person };
    cache.set(cacheKey, result);
    res.json(result);
  } catch (err) {
    next(apolloError(err));
  }
});

// ── GET /api/apollo/status ─────────────────────────────────────────
// Validates the API key and returns credit info
router.get('/status', async (req, res, next) => {
  try {
    const { data } = await apolloClient().post('/mixed_people/search', { per_page: 1 });
    res.json({
      connected: true,
      rate_limit_requests_left: data.rate_limit_requests_left ?? null,
      rate_limit_day_requests_left: data.rate_limit_day_requests_left ?? null,
    });
  } catch (err) {
    next(apolloError(err));
  }
});

// ── Error normaliser ───────────────────────────────────────────────
function apolloError(err) {
  if (err.status) return err; // already shaped
  const status = err.response?.status || 500;
  const message = err.response?.data?.message || err.message || 'Apollo API error';
  const labels = { 401: 'Invalid Apollo API key.', 429: 'Apollo rate limit hit — wait a moment.', 403: 'Apollo plan does not support this endpoint.' };
  return Object.assign(new Error(labels[status] || message), { status });
}

module.exports = router;
