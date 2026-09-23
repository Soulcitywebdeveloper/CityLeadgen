# LeadAI — Node.js/Express Lead Generation App

AI-powered lead generation platform with Apollo.io integration, Anthropic AI, CSV import, contact enrichment, and batch outreach generation.

## Features

- **Pipeline** — manage and search your lead database
- **Apollo search** — search Apollo's B2B database (people + companies)
- **Discover** — AI-generated contact profiles matching your ICP
- **Qualify** — BANT/MEDDIC scoring via Claude AI
- **Outreach** — single and batch message generation (cold email, LinkedIn)
- **Import** — CSV upload with column mapping
- **Enrich** — full profile lookup via Apollo people/match API

---

## Quick start

### 1. Install dependencies

```bash
cd leadai
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in:

```
APOLLO_API_KEY=your_apollo_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
PORT=3000
NODE_ENV=development
```

**Get your Apollo API key:**
→ app.apollo.io → Settings → Integrations → API

**Get your Anthropic API key:**
→ console.anthropic.com → API Keys

### 3. Run the server

```bash
# Development (auto-restart on changes)
npm run dev

# Production
npm start
```

Open http://localhost:3000 in your browser.

---

## Project structure

```
leadai/
├── server.js              # Express app entry point
├── .env.example           # Environment variable template
├── package.json
├── middleware/
│   └── rateLimiter.js     # Per-route rate limiting
├── routes/
│   ├── apollo.js          # Apollo.io proxy (people search + enrich)
│   ├── anthropic.js       # AI routes (qualify, outreach, discover, batch)
│   └── pipeline.js        # In-memory pipeline CRUD
└── public/
    ├── index.html         # Single-page frontend
    ├── css/app.css
    └── js/app.js          # All frontend logic
```

---

## API reference

### Pipeline

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/pipeline` | List leads (query: q, status, industry, sort) |
| GET | `/api/pipeline/:id` | Get single lead |
| POST | `/api/pipeline` | Create lead |
| POST | `/api/pipeline/bulk` | Bulk import leads |
| PATCH | `/api/pipeline/:id` | Update lead |
| DELETE | `/api/pipeline/:id` | Delete lead |
| GET | `/api/pipeline/stats/summary` | Pipeline stats |

### Apollo

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/apollo/status` | Test API key + credit info |
| POST | `/api/apollo/people/search` | Search people |
| POST | `/api/apollo/people/enrich` | Enrich contact by email or name+domain |

### AI (Anthropic)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ai/qualify` | Score and qualify a lead |
| POST | `/api/ai/outreach` | Generate single outreach message |
| POST | `/api/ai/batch-outreach` | Batch messages via Server-Sent Events |
| POST | `/api/ai/discover` | Generate ICP-matched contact profiles |

---

## Adding a database

The pipeline currently uses in-memory storage (resets on server restart). To persist data, replace the array in `routes/pipeline.js` with any database:

**SQLite (simplest):**
```bash
npm install better-sqlite3
```

**PostgreSQL:**
```bash
npm install pg
```

**MongoDB:**
```bash
npm install mongoose
```

---

## Deployment

### Railway / Render / Fly.io

1. Push to GitHub
2. Connect your repo to the platform
3. Set environment variables in the platform dashboard
4. Deploy — the `npm start` command runs automatically

### Environment variables needed in production

```
APOLLO_API_KEY=...
ANTHROPIC_API_KEY=...
NODE_ENV=production
PORT=3000
ALLOWED_ORIGINS=https://yourdomain.com
```
