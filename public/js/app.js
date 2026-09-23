// ─── Utilities ───────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const val = id => ($(id)?.value || '').trim();

function initials(name) {
  return (name || '?').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
}
function scoreClass(s) { return s >= 75 ? 'badge-green' : s >= 50 ? 'badge-amber' : 'badge-red'; }
function statusLabel(s) { return s >= 75 ? 'Hot' : s >= 50 ? 'Warm' : 'Cold'; }
function hl(text, q) {
  if (!q || !text) return String(text || '');
  return String(text).replace(new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<span class="hl">$1</span>');
}
function copyText(text) { navigator.clipboard.writeText(text).catch(() => {}); }
function setBtnLoading(id, loading, label) {
  const btn = $(id);
  if (!btn) return;
  btn.disabled = loading;
  btn.innerHTML = loading ? `<span class="spinner"></span>${label || 'Loading…'}` : btn.dataset.label || label || 'Done';
}

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch('/api' + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `API error ${res.status}`);
  return data;
}

// ─── Page navigation ──────────────────────────────────────────────
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  $('page-' + name)?.classList.add('active');
  document.querySelectorAll('.nav-btn').forEach(b => {
    if (b.textContent.toLowerCase().includes(name.replace('-', ' '))) b.classList.add('active');
  });
  if (name === 'pipeline') loadPipeline();
  if (name === 'outreach') loadBatchLeadList();
}

// ─── Status check ─────────────────────────────────────────────────
async function checkStatus() {
  try {
    const { apollo, anthropic } = await api('GET', '/health');
    const ok = apollo && anthropic;
    $('status-dot').className = 'dot ' + (ok ? 'ok' : 'err');
    $('status-label').textContent = ok ? 'APIs connected' : 'Config missing';
  } catch {
    $('status-label').textContent = 'Server offline';
  }
}

// ─── PIPELINE ─────────────────────────────────────────────────────
async function loadPipeline() {
  const params = new URLSearchParams({
    q: val('pl-q'), status: val('pl-status'),
    industry: val('pl-industry'), sort: val('pl-sort') || 'score',
  });
  try {
    const { leads } = await api('GET', `/pipeline?${params}`);
    renderPipeline(leads, val('pl-q'));
    loadStats();
  } catch (e) {
    $('pipeline-list').innerHTML = `<div class="empty"><i class="ti ti-alert-circle"></i>${e.message}</div>`;
  }
}

async function loadStats() {
  try {
    const s = await api('GET', '/pipeline/stats/summary');
    $('stats-grid').innerHTML = [
      ['Total leads', s.total], ['Hot', s.hot], ['Warm', s.warm],
      ['Cold', s.cold], ['Avg score', s.avgScore],
    ].map(([l, v]) => `<div class="stat-card"><div class="stat-label">${l}</div><div class="stat-value">${v}</div></div>`).join('');
  } catch {}
}

function renderPipeline(leads, q = '') {
  if (!leads.length) {
    $('pipeline-list').innerHTML = '<div class="empty"><i class="ti ti-search-off"></i>No leads found.</div>';
    return;
  }
  $('pipeline-list').innerHTML = leads.map(c => `
    <div class="contact-card">
      <div class="contact-top">
        <div class="avatar">${initials(c.name)}</div>
        <div style="flex:1;min-width:0;">
          <div class="contact-name">${hl(c.name, q)}</div>
          <div class="contact-meta">${hl(c.title, q)} · ${hl(c.company, q)}</div>
        </div>
        <span class="badge ${scoreClass(c.score)}">${statusLabel(c.score)} · ${c.score}</span>
      </div>
      ${c.notes ? `<div style="font-size:11px;color:#aaa;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><i class="ti ti-note" style="font-size:12px;"></i> ${hl(c.notes, q)}</div>` : ''}
      <div class="contact-footer">
        <div class="tags">
          <span class="badge badge-gray" style="font-size:10px;">${c.industry || '—'}</span>
          ${c.email ? `<span class="badge badge-blue" style="font-size:10px;"><i class="ti ti-mail"></i> ${c.email}</span>` : ''}
        </div>
        <div class="actions">
          ${c.email ? `<button class="btn btn-xs" onclick="copyText('${c.email}')" title="Copy email"><i class="ti ti-copy"></i></button>` : ''}
          <button class="btn btn-xs" onclick="prefillOutreach('${c.name}','${c.title} at ${c.company}')">Outreach</button>
          <button class="btn btn-xs" onclick="deleteLead(${c.id})"><i class="ti ti-trash"></i></button>
        </div>
      </div>
    </div>`).join('');
}

async function deleteLead(id) {
  if (!confirm('Remove this lead?')) return;
  await api('DELETE', `/pipeline/${id}`);
  loadPipeline();
}

function prefillOutreach(name, role) {
  $('o-name').value = name; $('o-role').value = role;
  showPage('outreach'); swOutreach('single');
}

// ─── APOLLO SEARCH ────────────────────────────────────────────────
let apolloResults = [], apolloTotal = 0, apolloPage = 1;

async function apolloSearch(page) {
  apolloPage = page;
  const titles = val('ap-titles').split(',').map(t => t.trim()).filter(Boolean);
  const locations = val('ap-location').split(',').map(l => l.trim()).filter(Boolean);
  const company = val('ap-company');
  const sizeVal = val('ap-size');
  const perPage = parseInt(val('ap-per-page') || '25');

  $('ap-btn').dataset.label = 'Search Apollo';
  setBtnLoading('ap-btn', true, 'Searching…');

  try {
    const data = await api('POST', '/apollo/people/search', {
      person_titles: titles,
      person_locations: locations,
      q_organization_name: company || undefined,
      organization_num_employees_ranges: sizeVal ? [sizeVal] : [],
      page, per_page: perPage,
    });
    apolloResults = data.people || [];
    apolloTotal = data.pagination?.total_entries || apolloResults.length;
    renderApolloResults(perPage);
  } catch (e) {
    $('ap-results').style.display = 'block';
    $('ap-list').innerHTML = `<div class="empty" style="color:#A32D2D;"><i class="ti ti-alert-circle"></i>${e.message}</div>`;
    $('ap-count').textContent = '';
  }
  setBtnLoading('ap-btn', false, 'Search Apollo');
}

function renderApolloResults(perPage) {
  $('ap-results').style.display = 'block';
  $('ap-count').textContent = `${apolloTotal.toLocaleString()} total · page ${apolloPage}` + (apolloResults.length ? ` (${apolloResults.length} shown)` : '');

  if (!apolloResults.length) {
    $('ap-list').innerHTML = '<div class="empty"><i class="ti ti-search-off"></i>No results. Try broader search terms.</div>';
    $('ap-pagination').innerHTML = '';
    return;
  }

  $('ap-list').innerHTML = apolloResults.map((p, i) => {
    const name = p.name || [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown';
    const org = p.organization || {};
    const loc = [p.city, p.country].filter(Boolean).join(', ') || '—';
    const emailBadge = p.email_status === 'verified' ? 'badge-green' : p.email_status === 'guessed' ? 'badge-amber' : 'badge-gray';
    return `
      <div class="contact-card">
        <div class="contact-top">
          <div class="avatar" style="background:#EEEDFE;color:#3C3489;">${initials(name)}</div>
          <div style="flex:1;min-width:0;">
            <div class="contact-name">${name} <span class="badge badge-purple" style="font-size:10px;">Apollo</span></div>
            <div class="contact-meta">${p.title || '—'} · ${org.name || '—'}</div>
          </div>
        </div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px;">
          <span class="badge badge-gray" style="font-size:10px;"><i class="ti ti-building"></i> ${org.industry || '—'}</span>
          <span class="badge badge-gray" style="font-size:10px;"><i class="ti ti-map-pin"></i> ${loc}</span>
          ${org.estimated_num_employees ? `<span class="badge badge-gray" style="font-size:10px;"><i class="ti ti-users"></i> ${org.estimated_num_employees.toLocaleString()}</span>` : ''}
        </div>
        <div class="contact-footer">
          <div class="tags">
            ${p.email ? `<span class="badge ${emailBadge}" style="font-size:10px;"><i class="ti ti-mail"></i> ${p.email} · ${p.email_status || '?'}</span>` : '<span class="badge badge-gray" style="font-size:10px;">No email</span>'}
            ${p.linkedin_url ? `<a href="${p.linkedin_url}" target="_blank" style="text-decoration:none;"><span class="badge badge-blue" style="font-size:10px;"><i class="ti ti-brand-linkedin"></i> LinkedIn</span></a>` : ''}
          </div>
          <div class="actions">
            ${p.email ? `<button class="btn btn-xs" onclick="copyText('${p.email}')" title="Copy email"><i class="ti ti-copy"></i></button>` : ''}
            <button class="btn btn-xs" id="addap-${i}" onclick="addApolloLead(${i})"><i class="ti ti-plus"></i> Add</button>
          </div>
        </div>
      </div>`;
  }).join('');

  const totalPages = Math.min(Math.ceil(apolloTotal / perPage), 10);
  $('ap-pagination').innerHTML = [
    apolloPage > 1 ? `<button class="btn btn-sm" onclick="apolloSearch(${apolloPage - 1})"><i class="ti ti-arrow-left"></i> Prev</button>` : '',
    `<span style="font-size:12px;color:#666;">Page ${apolloPage} of ${totalPages}</span>`,
    apolloPage < totalPages ? `<button class="btn btn-sm" onclick="apolloSearch(${apolloPage + 1})">Next <i class="ti ti-arrow-right"></i></button>` : '',
  ].join('');
}

async function addApolloLead(i) {
  const p = apolloResults[i];
  const name = p.name || [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown';
  await api('POST', '/pipeline', {
    name, title: p.title, company: p.organization?.name,
    industry: p.organization?.industry, email: p.email,
    notes: 'Added from Apollo. ' + [p.city, p.country].filter(Boolean).join(', '),
  });
  const btn = $('addap-' + i);
  if (btn) btn.innerHTML = '<i class="ti ti-check"></i> Added';
}

function addAllApollo() { apolloResults.forEach((_, i) => addApolloLead(i)); }

function exportApolloCSV() {
  if (!apolloResults.length) return;
  const rows = [['Name', 'Title', 'Company', 'Industry', 'Email', 'Email Status', 'LinkedIn', 'Location', 'Employees']];
  apolloResults.forEach(p => {
    const name = p.name || [p.first_name, p.last_name].filter(Boolean).join(' ') || '';
    rows.push([name, p.title, p.organization?.name, p.organization?.industry, p.email,
      p.email_status, p.linkedin_url, [p.city, p.country].filter(Boolean).join(', '),
      p.organization?.estimated_num_employees]);
  });
  downloadCSV(rows, 'apollo_contacts.csv');
}

// ─── DISCOVER ─────────────────────────────────────────────────────
let discoveredLeads = [];

async function discoverContacts() {
  const title = val('d-title'), industry = val('d-industry');
  if (!title && !industry) { alert('Enter a job title or industry.'); return; }

  $('d-btn').dataset.label = 'Find contacts with AI';
  setBtnLoading('d-btn', true, 'Generating…');
  $('d-results').style.display = 'none';

  try {
    const { contacts } = await api('POST', '/ai/discover', {
      title, industry, size: val('d-size'), location: val('d-location'), pain: val('d-pain'),
    });
    discoveredLeads = contacts;
    $('d-results').style.display = 'block';
    $('d-count').textContent = `${contacts.length} contacts generated`;
    $('d-list').innerHTML = contacts.map((c, i) => `
      <div class="contact-card">
        <div class="contact-top">
          <div class="avatar" style="background:#EEEDFE;color:#3C3489;">${initials(c.name)}</div>
          <div style="flex:1;min-width:0;">
            <div class="contact-name">${c.name} <span class="badge badge-purple" style="font-size:10px;">AI</span></div>
            <div class="contact-meta">${c.title} · ${c.company}</div>
          </div>
          <span class="badge ${scoreClass(c.score)}">${statusLabel(c.score)} · ${c.score}</span>
        </div>
        <div style="font-size:12px;color:#666;margin-top:4px;line-height:1.5;">${c.whyFit || ''}</div>
        <div class="contact-footer">
          <div class="tags">
            <span class="badge badge-gray" style="font-size:10px;">${c.industry}</span>
            <span class="badge badge-gray" style="font-size:10px;"><i class="ti ti-map-pin"></i> ${c.location || '—'}</span>
          </div>
          <div class="actions">
            <button class="btn btn-xs" id="addd-${i}" onclick="addDiscoveredLead(${i})"><i class="ti ti-plus"></i> Add</button>
          </div>
        </div>
      </div>`).join('');
  } catch (e) {
    $('d-results').style.display = 'block';
    $('d-list').innerHTML = `<div class="empty" style="color:#A32D2D;"><i class="ti ti-alert-circle"></i>${e.message}</div>`;
  }
  setBtnLoading('d-btn', false, 'Find contacts with AI');
}

async function addDiscoveredLead(i) {
  const c = discoveredLeads[i];
  await api('POST', '/pipeline', { name: c.name, title: c.title, company: c.company, industry: c.industry, score: c.score, email: c.email, notes: c.painPoint });
  const btn = $('addd-' + i);
  if (btn) btn.innerHTML = '<i class="ti ti-check"></i> Added';
}

function addAllDiscovered() { discoveredLeads.forEach((_, i) => addDiscoveredLead(i)); }

// ─── QUALIFY ──────────────────────────────────────────────────────
async function qualifyLead() {
  $('q-btn').dataset.label = 'Qualify with AI';
  setBtnLoading('q-btn', true, 'Qualifying…');
  $('q-result').style.display = 'none';

  try {
    const { score, status, analysis } = await api('POST', '/ai/qualify', {
      name: val('q-name'), title: val('q-title'), company: val('q-company'),
      size: val('q-size'), industry: val('q-industry'),
      budget: val('q-budget'), notes: val('q-notes'),
    });

    $('q-result').style.display = 'block';
    $('q-result').innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <div style="font-size:13px;font-weight:500;">Result</div>
        <span class="badge ${scoreClass(score)}">${score}/100 · ${statusLabel(score)}</span>
      </div>
      <div class="output-box">${analysis.replace(/SCORE:\s*\d+\n?/, '').replace(/STATUS:[^\n]*\n?/, '').trim()}</div>
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button class="btn btn-sm" onclick="addQualifiedLead(${score},'${status}')"><i class="ti ti-plus"></i> Add to pipeline</button>
      </div>`;
  } catch (e) {
    $('q-result').style.display = 'block';
    $('q-result').innerHTML = `<div class="output-box" style="color:#A32D2D;">${e.message}</div>`;
  }
  setBtnLoading('q-btn', false, 'Qualify with AI');
}

async function addQualifiedLead(score, status) {
  await api('POST', '/pipeline', {
    name: val('q-name'), title: val('q-title'), company: val('q-company'),
    industry: val('q-industry'), score, notes: val('q-notes'),
  });
  alert('Lead added to pipeline!');
}

// ─── OUTREACH ─────────────────────────────────────────────────────
function swOutreach(tab) {
  $('out-single').style.display = tab === 'single' ? 'block' : 'none';
  $('out-batch').style.display = tab === 'batch' ? 'block' : 'none';
  document.querySelectorAll('#page-outreach .tab').forEach((t, i) => t.classList.toggle('active', (tab === 'single') ? i === 0 : i === 1));
}

async function generateSingle() {
  $('o-btn').dataset.label = 'Generate message';
  setBtnLoading('o-btn', true, 'Writing…');
  $('o-result').style.display = 'none';

  try {
    const { message, channel } = await api('POST', '/ai/outreach', {
      name: val('o-name'), role: val('o-role'), channel: val('o-channel'),
      offering: val('o-offering'), sender: val('o-sender'),
      hook: val('o-hook'), tone: val('o-tone'),
    });

    const isEmail = channel?.toLowerCase().includes('email');
    let subj = '', body = message;
    if (isEmail && message.startsWith('Subject:')) {
      const nl = message.indexOf('\n');
      subj = message.slice(0, nl).replace('Subject:', '').trim();
      body = message.slice(nl).trim();
    }

    $('o-result').style.display = 'block';
    $('o-result').innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <div style="font-size:13px;font-weight:500;">${channel}${subj ? ' · <span style="font-weight:400;color:#666;">Subject: ' + subj + '</span>' : ''}</div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-sm" onclick="copyText(${JSON.stringify(message)})"><i class="ti ti-copy"></i> Copy</button>
          <button class="btn btn-sm" onclick="generateSingle()"><i class="ti ti-refresh"></i></button>
        </div>
      </div>
      <div class="output-box" id="single-msg-body">${body}</div>`;
  } catch (e) {
    $('o-result').style.display = 'block';
    $('o-result').innerHTML = `<div class="output-box" style="color:#A32D2D;">${e.message}</div>`;
  }
  setBtnLoading('o-btn', false, 'Generate message');
}

// Batch — load pipeline leads as checkboxes
let batchLeads = [], batchSelected = new Set();

async function loadBatchLeadList() {
  try {
    const { leads } = await api('GET', '/pipeline?sort=score');
    batchLeads = leads;
    batchSelected = new Set(leads.map(l => l.id));
    renderBatchLeadList();
  } catch {}
}

function renderBatchLeadList() {
  $('batch-lead-list').innerHTML = batchLeads.map(l => `
    <div class="batch-lead-row">
      <input type="checkbox" id="bc-${l.id}" ${batchSelected.has(l.id) ? 'checked' : ''} onchange="toggleBatch(${l.id},this.checked)" style="width:auto;margin:0;flex-shrink:0;">
      <div class="avatar" style="width:26px;height:26px;font-size:10px;">${initials(l.name)}</div>
      <div style="flex:1;min-width:0;">
        <span style="font-weight:500;">${l.name}</span>
        <span style="color:#888;font-size:12px;"> · ${l.title}, ${l.company}</span>
      </div>
      <span class="badge ${scoreClass(l.score)}" style="font-size:10px;">${l.score}</span>
    </div>`).join('');
  updateBatchCount();
}

function toggleBatch(id, checked) { checked ? batchSelected.add(id) : batchSelected.delete(id); updateBatchCount(); }
function selectAllBatch(val) { batchLeads.forEach(l => { batchSelected[val ? 'add' : 'delete'](l.id); if ($('bc-' + l.id)) $('bc-' + l.id).checked = val; }); updateBatchCount(); }
function updateBatchCount() { $('batch-sel-count').textContent = `${batchSelected.size} of ${batchLeads.length} selected`; }

async function generateBatch() {
  const leads = batchLeads.filter(l => batchSelected.has(l.id));
  if (!leads.length) { alert('Select at least one lead.'); return; }

  setBtnLoading('b-btn', true, `Generating ${leads.length} messages…`);
  $('b-btn').dataset.label = 'Generate all messages';

  $('b-results').style.display = 'block';
  $('b-results').innerHTML = `
    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <div style="font-size:13px;font-weight:500;">Generating messages…</div>
        <span id="b-gen-badge"></span>
      </div>
      <div class="progress-bar"><div class="progress-fill" id="b-progress" style="width:0%"></div></div>
      <div style="font-size:11px;color:#aaa;margin-bottom:1rem;" id="b-prog-label">0 of ${leads.length}…</div>
      <div id="b-msgs"></div>
      <div id="b-export" style="display:none;margin-top:12px;display:none;">
        <hr style="border:none;border-top:0.5px solid #eee;margin:1rem 0;">
        <div style="display:flex;gap:8px;">
          <button class="btn btn-sm" onclick="copyAllBatch()"><i class="ti ti-copy"></i> Copy all</button>
          <button class="btn btn-sm" onclick="exportBatchCSV()"><i class="ti ti-download"></i> Export CSV</button>
        </div>
      </div>
    </div>`;

  const generated = [];

  // Use SSE endpoint for streaming results
  const body = {
    leads, channel: val('b-channel'), tone: val('b-tone'),
    offering: val('b-offering'), sender: val('b-sender'), context: val('b-context'),
  };

  const res = await fetch('/api/ai/batch-outreach', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        const evt = JSON.parse(line.slice(6));
        if (evt.done) {
          $('b-gen-badge').innerHTML = `<span class="badge badge-green"><i class="ti ti-check"></i> ${evt.total} messages ready</span>`;
          $('b-prog-label').textContent = `All ${evt.total} messages generated`;
          $('b-export').style.display = 'block';
          setBtnLoading('b-btn', false, 'Generate all messages');
        } else {
          generated.push(evt);
          const pct = Math.round(((evt.index + 1) / leads.length) * 100);
          $('b-progress').style.width = pct + '%';
          $('b-prog-label').textContent = `${evt.index + 1} of ${leads.length} generated…`;
          appendBatchMsg(evt, generated);
        }
      } catch {}
    }
  }

  window._batchGenerated = generated;
  setBtnLoading('b-btn', false, 'Generate all messages');
}

function appendBatchMsg(evt, generated) {
  const isEmail = evt.message?.startsWith('Subject:');
  let subj = '', body = evt.message || '';
  if (isEmail) { const nl = body.indexOf('\n'); subj = body.slice(0, nl).replace('Subject:', '').trim(); body = body.slice(nl).trim(); }
  const div = document.createElement('div');
  div.className = 'msg-card';
  div.innerHTML = `
    <div class="msg-header">
      <div>
        <div style="font-size:13px;font-weight:500;">${evt.lead}${subj ? ' <span style="font-weight:400;color:#666;font-size:12px;">· Subject: ' + subj + '</span>' : ''}</div>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-xs" onclick="copyText(${JSON.stringify(evt.message)})"><i class="ti ti-copy"></i></button>
      </div>
    </div>
    <div class="msg-body">${body}</div>`;
  $('b-msgs').appendChild(div);
}

function copyAllBatch() {
  const all = (window._batchGenerated || []).map(g => `--- ${g.lead} ---\n${g.message}`).join('\n\n');
  copyText(all);
}

function exportBatchCSV() {
  const rows = [['Lead', 'Message']];
  (window._batchGenerated || []).forEach(g => rows.push([g.lead, g.message]));
  downloadCSV(rows, 'batch_outreach.csv');
}

// ─── IMPORT ───────────────────────────────────────────────────────
let csvHeaders = [], csvRows = [], mappedLeads = [];
const FIELDS = ['name', 'title', 'company', 'email', 'industry', 'notes'];
const FIELD_LABELS = { name: 'Full name', title: 'Job title', company: 'Company', email: 'Email', industry: 'Industry', notes: 'Notes' };

function handleDrop(e) {
  e.preventDefault(); $('drop-zone').classList.remove('drag');
  const f = e.dataTransfer.files[0];
  if (f?.name.endsWith('.csv')) handleFile(f);
}
function handleFile(f) {
  const r = new FileReader();
  r.onload = e => { $('csv-paste').value = e.target.result; parseCSV(); };
  r.readAsText(f);
}
function parseCSV() {
  const text = $('csv-paste').value.trim();
  if (!text) return alert('Paste CSV content or upload a file.');
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return alert('CSV needs at least a header row and one data row.');
  const parse = line => { const res = []; let cur = '', inQ = false; for (const c of line) { if (c === '"') inQ = !inQ; else if (c === ',' && !inQ) { res.push(cur.trim()); cur = ''; } else cur += c; } res.push(cur.trim()); return res; };
  csvHeaders = parse(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
  csvRows = lines.slice(1).map(parse);
  renderColMap();
}

function guessField(h) {
  if (/name|full.?name/.test(h) && !/company/.test(h)) return 'name';
  if (/title|role|position|job/.test(h)) return 'title';
  if (/company|org|firm/.test(h)) return 'company';
  if (/email|mail/.test(h)) return 'email';
  if (/industry|sector/.test(h)) return 'industry';
  if (/note|comment|pain/.test(h)) return 'notes';
  return '';
}

function renderColMap() {
  $('col-map').innerHTML = csvHeaders.map((h, i) => `
    <div class="col-map-row">
      <span class="col-label">${h}</span>
      <i class="ti ti-arrow-right" style="font-size:14px;color:#aaa;flex-shrink:0;"></i>
      <select id="map-${i}">
        <option value="">— skip —</option>
        ${FIELDS.map(f => `<option value="${f}" ${guessField(h) === f ? 'selected' : ''}>${FIELD_LABELS[f]}</option>`).join('')}
      </select>
    </div>`).join('');
  $('csv-rows-info').textContent = `${csvRows.length} data rows detected`;
  $('import-mapping').style.display = 'block';
  $('import-preview').style.display = 'none';
}

function previewImport() {
  const colMap = csvHeaders.map((_, i) => val('map-' + i));
  if (!colMap.includes('name') && !colMap.includes('company')) return alert('Map at least a Name or Company column.');
  mappedLeads = csvRows.map(row => {
    const lead = {};
    csvHeaders.forEach((_, i) => { if (colMap[i] && row[i]) lead[colMap[i]] = row[i]; });
    if (!lead.name) lead.name = lead.email || 'Unknown';
    return lead;
  }).filter(l => l.name);

  const vis = ['name', 'title', 'company', 'email', 'industry'];
  $('preview-table').innerHTML = `<thead><tr>${vis.map(f => `<th>${FIELD_LABELS[f]}</th>`).join('')}</tr></thead><tbody>${
    mappedLeads.slice(0, 10).map(l => `<tr>${vis.map(f => `<td>${l[f] || '—'}</td>`).join('')}</tr>`).join('')
  }${mappedLeads.length > 10 ? `<tr><td colspan="5" style="color:#aaa;font-size:11px;">…and ${mappedLeads.length - 10} more</td></tr>` : ''}</tbody>`;
  $('preview-count').textContent = `(${mappedLeads.length} leads)`;
  $('import-preview').style.display = 'block';
  $('import-mapping').style.display = 'none';
}

async function bulkImport() {
  setBtnLoading('import-btn', true, 'Importing…');
  try {
    const { created } = await api('POST', '/pipeline/bulk', { leads: mappedLeads });
    $('import-status').innerHTML = `<span class="badge badge-green"><i class="ti ti-check"></i> ${created} leads imported!</span>`;
    $('import-preview').style.display = 'none';
    $('import-mapping').style.display = 'none';
    $('csv-paste').value = '';
  } catch (e) {
    $('import-status').textContent = e.message;
  }
  setBtnLoading('import-btn', false, 'Import all leads');
}

// ─── ENRICH ───────────────────────────────────────────────────────
async function enrichContact() {
  const email = val('en-email'), first = val('en-first'), last = val('en-last'), domain = val('en-domain');
  if (!email && !(first && last && domain)) return alert('Provide an email OR first name + last name + domain.');

  setBtnLoading('en-btn', true, 'Looking up…');
  $('en-result').innerHTML = '';

  try {
    const { person: p } = await api('POST', '/apollo/people/enrich', { email, first_name: first, last_name: last, domain });
    const name = p.name || [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown';
    const org = p.organization || {};
    const loc = [p.city, p.state, p.country].filter(Boolean).join(', ') || '—';
    const phone = p.phone_numbers?.[0]?.sanitized_number || '—';
    const employment = (p.employment_history || []).slice(0, 3).map(e =>
      `<div style="font-size:12px;padding:4px 0;border-bottom:0.5px solid #f5f5f3;"><span style="font-weight:500;">${e.title || '—'}</span> at ${e.organization_name || '—'} <span style="color:#aaa;">${e.start_date || ''} – ${e.end_date || 'present'}</span></div>`
    ).join('');

    $('en-result').innerHTML = `
      <div class="card">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:1rem;">
          <div class="avatar" style="width:44px;height:44px;font-size:14px;">${initials(name)}</div>
          <div style="flex:1;">
            <div style="font-size:15px;font-weight:500;">${name}</div>
            <div style="font-size:12px;color:#666;">${p.title || '—'} at ${org.name || '—'}</div>
            ${p.linkedin_url ? `<a href="${p.linkedin_url}" target="_blank" style="font-size:11px;color:#185FA5;text-decoration:none;"><i class="ti ti-brand-linkedin"></i> LinkedIn</a>` : ''}
          </div>
          <button class="btn btn-sm" onclick="addEnriched()"><i class="ti ti-plus"></i> Add to pipeline</button>
        </div>
        <hr style="border:none;border-top:0.5px solid #eee;margin:1rem 0;">
        <div style="margin-bottom:1rem;">
          <div style="font-size:11px;font-weight:500;color:#aaa;margin-bottom:8px;text-transform:uppercase;">Contact details</div>
          <div class="enrich-field"><span class="enrich-label"><i class="ti ti-mail"></i> Email</span><span class="enrich-value">${p.email || '—'} ${p.email_status ? `<span class="badge badge-gray" style="font-size:10px;">${p.email_status}</span>` : ''}</span>${p.email ? `<button class="btn btn-xs" onclick="copyText('${p.email}')"><i class="ti ti-copy"></i></button>` : ''}</div>
          <div class="enrich-field"><span class="enrich-label"><i class="ti ti-phone"></i> Phone</span><span class="enrich-value">${phone}</span></div>
          <div class="enrich-field"><span class="enrich-label"><i class="ti ti-map-pin"></i> Location</span><span class="enrich-value">${loc}</span></div>
          <div class="enrich-field"><span class="enrich-label"><i class="ti ti-chart-bar"></i> Seniority</span><span class="enrich-value">${p.seniority || '—'}</span></div>
          <div class="enrich-field"><span class="enrich-label"><i class="ti ti-building"></i> Dept</span><span class="enrich-value">${(p.departments || []).join(', ') || '—'}</span></div>
        </div>
        ${org.name ? `
        <hr style="border:none;border-top:0.5px solid #eee;margin:1rem 0;">
        <div style="margin-bottom:1rem;">
          <div style="font-size:11px;font-weight:500;color:#aaa;margin-bottom:8px;text-transform:uppercase;">Company</div>
          <div class="enrich-field"><span class="enrich-label"><i class="ti ti-building"></i> Name</span><span class="enrich-value">${org.name}</span></div>
          <div class="enrich-field"><span class="enrich-label"><i class="ti ti-briefcase"></i> Industry</span><span class="enrich-value">${org.industry || '—'}</span></div>
          <div class="enrich-field"><span class="enrich-label"><i class="ti ti-users"></i> Size</span><span class="enrich-value">${org.estimated_num_employees?.toLocaleString() || '—'}</span></div>
          <div class="enrich-field"><span class="enrich-label"><i class="ti ti-world"></i> Website</span><span class="enrich-value">${org.website_url ? `<a href="${org.website_url}" target="_blank" style="color:#185FA5;">${org.website_url}</a>` : '—'}</span></div>
          <div class="enrich-field"><span class="enrich-label"><i class="ti ti-currency-dollar"></i> Revenue</span><span class="enrich-value">${org.annual_revenue_printed || '—'}</span></div>
        </div>` : ''}
        ${employment ? `
        <hr style="border:none;border-top:0.5px solid #eee;margin:1rem 0;">
        <div style="font-size:11px;font-weight:500;color:#aaa;margin-bottom:8px;text-transform:uppercase;">Employment history</div>
        ${employment}` : ''}
      </div>`;
    window._enrichedPerson = p;
  } catch (e) {
    $('en-result').innerHTML = `<div class="card" style="border-color:#F09595;color:#A32D2D;font-size:13px;"><i class="ti ti-alert-circle"></i> ${e.message}</div>`;
  }
  setBtnLoading('en-btn', false, 'Enrich contact');
}

async function addEnriched() {
  const p = window._enrichedPerson; if (!p) return;
  const name = p.name || [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown';
  await api('POST', '/pipeline', { name, title: p.title, company: p.organization?.name, industry: p.organization?.industry, email: p.email, notes: 'Enriched via Apollo.' });
  alert(name + ' added to pipeline.');
}

// ─── CSV export helper ────────────────────────────────────────────
function downloadCSV(rows, filename) {
  const csv = rows.map(r => r.map(v => '"' + String(v || '').replace(/"/g, '""') + '"').join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = filename; a.click();
}

// ─── Init ─────────────────────────────────────────────────────────
checkStatus();
loadPipeline();
