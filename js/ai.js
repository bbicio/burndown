// ── AI PLANNING SIDEBAR ──────────────────────────────────────────────────────
let aiPlanMessages = []; // { role: 'user'|'assistant', content: string }

function buildPlanningContext() {
  const todayStr = new Date().toISOString().split('T')[0];
  let ctx = `You are an AI planning assistant for a professional services company. Today is ${todayStr}.\nAnswer questions about planning, capacity, workload, and resource allocation using the data below. Be concise and data-driven.\n\n`;

  ctx += '## PROJECTS\n';
  (config.projects || []).forEach(proj => {
    const projData  = timesheetData.filter(r => r.projectId === proj.id);
    const consumed  = projData.reduce((s, r) => s + r.hours, 0);
    const tasks     = proj.tasks || [];
    const sold      = tasks.reduce((s, t) => s + (t.resources || []).reduce((ss, r) => ss + (r.soldHours || 0), 0), 0);
    const tbp       = Math.max(0, sold - consumed);
    ctx += `- **${proj.name || proj.id}** | pipeline: ${proj.pipeline || 'n/a'} | dates: ${proj.startDate || '?'} → ${proj.endDate || '?'} | sold: ${sold.toFixed(0)}h | consumed: ${consumed.toFixed(0)}h | to-be-planned: ${tbp.toFixed(0)}h\n`;
    tasks.forEach(t => {
      const tSold  = (t.resources || []).reduce((s, r) => s + (r.soldHours || 0), 0);
      const tRecs  = projData.filter(r => r.task === t.name);
      const tConsumed = tRecs.reduce((s, r) => s + r.hours, 0);
      ctx += `  Task: ${t.name || '?'} | dates: ${t.startDate || '?'} → ${t.endDate || '?'} | sold: ${tSold.toFixed(0)}h | consumed: ${tConsumed.toFixed(0)}h\n`;
      (t.resources || []).forEach(res => {
        const rRecs    = tRecs.filter(r => r.role === res.role);
        const rConsumed = rRecs.reduce((s, r) => s + r.hours, 0);
        const rTbp     = Math.max(0, (res.soldHours || 0) - rConsumed);
        const ownersMap = {};
        rRecs.forEach(r => { const o = r.owner?.trim() || '—'; ownersMap[o] = (ownersMap[o] || 0) + r.hours; });
        const ownersStr = Object.entries(ownersMap).map(([o, h]) => `${o}:${h.toFixed(0)}h`).join(', ');
        ctx += `    Role: ${res.role} | sold: ${(res.soldHours || 0).toFixed(0)}h | consumed: ${rConsumed.toFixed(0)}h | tbp: ${rTbp.toFixed(0)}h | owners: ${ownersStr || 'none'}\n`;
      });
    });
  });

  ctx += '\n## OWNER TOTALS (from actuals)\n';
  const ownerSummary = {};
  timesheetData.forEach(r => {
    const o = r.owner?.trim() || '—';
    if (!ownerSummary[o]) ownerSummary[o] = { h: 0, roles: new Set(), projects: new Set() };
    ownerSummary[o].h += r.hours;
    ownerSummary[o].roles.add(r.role);
    ownerSummary[o].projects.add(r.projectId);
  });
  Object.entries(ownerSummary).sort((a, b) => b[1].h - a[1].h).forEach(([o, d]) => {
    ctx += `- **${o}**: ${d.h.toFixed(0)}h | roles: ${[...d.roles].join(', ')} | projects: ${[...d.projects].join(', ')}\n`;
  });

  ctx += '\n## FUTURE ALLOCATION ESTIMATE (next 6 months by owner)\n';
  const futureByOwnerMonth = {};
  const now = new Date(); now.setHours(0,0,0,0);
  (config.projects || []).forEach(proj => {
    const projData = timesheetData.filter(r => r.projectId === proj.id);
    (proj.tasks || []).forEach(task => {
      const tEnd = task.endDate ? parseTaskDate(task.endDate, true) : null;
      (task.resources || []).forEach(res => {
        const soldH = res.soldHours || 0;
        const rRecs = projData.filter(r => r.role === res.role && (!task.name || r.task === task.name));
        const ownersMap = {};
        let totalH = 0;
        rRecs.forEach(r => { const o = r.owner?.trim() || '—'; ownersMap[o] = (ownersMap[o] || 0) + r.hours; totalH += r.hours; });
        const tbp = Math.max(0, soldH - totalH);
        if (tbp < 0.01) return;
        const effectiveEnd = tEnd || new Date(now.getFullYear(), now.getMonth() + 6, 0);
        const months = [];
        let m = new Date(now.getFullYear(), now.getMonth(), 1);
        while (m <= effectiveEnd && months.length < 12) {
          months.push(`${m.getFullYear()}-${String(m.getMonth()+1).padStart(2,'0')}`);
          m = new Date(m.getFullYear(), m.getMonth()+1, 1);
        }
        if (!months.length) return;
        const hpm = tbp / months.length;
        months.forEach(mKey => {
          if (totalH > 0.01) {
            Object.entries(ownersMap).forEach(([o, h]) => {
              if (!futureByOwnerMonth[o]) futureByOwnerMonth[o] = {};
              futureByOwnerMonth[o][mKey] = (futureByOwnerMonth[o][mKey] || 0) + hpm * (h / totalH);
            });
          } else {
            if (!futureByOwnerMonth['TBD']) futureByOwnerMonth['TBD'] = {};
            futureByOwnerMonth['TBD'][mKey] = (futureByOwnerMonth['TBD'][mKey] || 0) + hpm;
          }
        });
      });
    });
  });
  Object.entries(futureByOwnerMonth).sort((a, b) => a[0].localeCompare(b[0])).forEach(([o, months]) => {
    const str = Object.entries(months).sort((a, b) => a[0].localeCompare(b[0])).map(([m, h]) => `${m}:${h.toFixed(0)}h`).join(' ');
    ctx += `- **${o}**: ${str}\n`;
  });

  return ctx;
}

async function aiPlanSend() {
  const provider = appSettings.aiProvider || 'anthropic';
  const models   = AI_MODELS[provider] || [];
  const model    = appSettings.aiModel || (models[0]?.id ?? '');
  const keys     = { anthropic: appSettings.anthropicApiKey, openai: appSettings.openaiApiKey, gemini: appSettings.geminiApiKey };
  const apiKey   = (keys[provider] || '').trim();

  if (!apiKey) {
    const names = { anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Google Gemini' };
    showConfirm(`Nessuna API key configurata per ${names[provider] || provider}.\n\nApri ⚙ Settings → API & Integrations.`, null, null, 'ℹ️ API Key richiesta');
    return;
  }
  const input = document.getElementById('aiPlanInput');
  const msg   = input.value.trim();
  if (!msg) return;
  input.value = '';
  aiPlanMessages.push({ role: 'user', content: msg });
  renderAiPlanMessages();
  const sendBtn = document.getElementById('btnAiPlanSend');
  sendBtn.disabled = true; sendBtn.textContent = '…';

  try {
    let reply;
    const ctx = buildPlanningContext();

    if (provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({ model, max_tokens: 1024, system: ctx, messages: aiPlanMessages }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `HTTP ${res.status}`); }
      const json = await res.json();
      reply = json.content?.[0]?.text || 'Nessuna risposta ricevuta.';

    } else if (provider === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          messages: [{ role: 'system', content: ctx }, ...aiPlanMessages],
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `HTTP ${res.status}`); }
      const json = await res.json();
      reply = json.choices?.[0]?.message?.content || 'Nessuna risposta ricevuta.';

    } else if (provider === 'gemini') {
      const geminiMsgs = aiPlanMessages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: geminiMsgs,
          systemInstruction: { parts: [{ text: ctx }] },
          generationConfig: { maxOutputTokens: 1024 },
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `HTTP ${res.status}`); }
      const json = await res.json();
      reply = json.candidates?.[0]?.content?.parts?.[0]?.text || 'Nessuna risposta ricevuta.';
    } else {
      throw new Error(`Provider non supportato: ${provider}`);
    }

    aiPlanMessages.push({ role: 'assistant', content: reply });
  } catch (e) {
    aiPlanMessages.push({ role: 'assistant', content: `⚠️ Error: ${e.message}` });
  } finally {
    sendBtn.disabled = false; sendBtn.textContent = 'Send';
    renderAiPlanMessages();
  }
}

function renderAiPlanMessages() {
  const el = document.getElementById('aiPlanMessages');
  if (!el) return;
  const intro = `<div style="background:#f0f4ff;border-radius:var(--radius-md);padding:10px 12px;font-size:var(--text-base);color:#444;border-left:3px solid #6c757d">
    Ciao! Sono il tuo assistente di planning. Puoi chiedermi, ad esempio:<br>
    • <em>Chi è libero nei prossimi 2 mesi?</em><br>
    • <em>Quante ore ha allocato [nome] a [mese]?</em><br>
    • <em>Quale progetto ha più ore residue?</em>
  </div>`;
  const msgs = aiPlanMessages.map(m => {
    if (m.role === 'user') {
      return `<div style="align-self:flex-end;max-width:85%;background:#0d6efd;color:white;border-radius:var(--radius-lg) 12px 2px 12px;padding:8px 12px;font-size:var(--text-base)">${esc(m.content)}</div>`;
    }
    const html = m.content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    return `<div style="align-self:flex-start;max-width:90%;background:#f1f3f5;border-radius:var(--radius-xs) 12px 12px 12px;padding:8px 12px;font-size:var(--text-base);color:#212529">${html}</div>`;
  }).join('');
  el.innerHTML = intro + msgs;
  el.scrollTop = el.scrollHeight;
}

// ── AI ANALYSIS ───────────────────────────────────────────────────────────────
function buildProjectSummary(data, cfg) {
  const lines = [];
  const currency = cfg?.currency || '€';

  lines.push(`Project: ${cfg?.name || selectedProjectId}`);
  lines.push(`Project ID: ${selectedProjectId}`);
  lines.push(`Currency: ${currency}`);

  if (cfg?.startDate && cfg?.endDate) {
    const sy = parseInt(cfg.startDate.slice(0, 4)), sm = parseInt(cfg.startDate.slice(4, 6));
    const ey = parseInt(cfg.endDate.slice(0, 4)),   em = parseInt(cfg.endDate.slice(4, 6));
    const startLabel = new Date(sy, sm - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const endLabel   = new Date(ey, em - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    lines.push(`Timeline: ${startLabel} – ${endLabel}`);
    const today = new Date();
    const totalMonths   = (ey - sy) * 12 + (em - sm) + 1;
    const elapsedMonths = Math.max(0, (today.getFullYear() - sy) * 12 + (today.getMonth() - (sm - 1)));
    const remainingMonths = Math.max(0, totalMonths - elapsedMonths);
    lines.push(`Duration: ${totalMonths} months total, ~${elapsedMonths} elapsed, ~${remainingMonths} remaining`);
  }

  lines.push(`Report date: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`);
  lines.push('');

  const consumedH = data.reduce((s, r) => s + r.hours, 0);
  lines.push('--- KEY METRICS ---');

  if (cfg) {
    const soldH     = cfg.tasks.reduce((s, t) => s + t.resources.reduce((ss, r) => ss + r.soldHours, 0), 0);
    const budgetE   = cfg.tasks.reduce((s, t) => s + t.resources.reduce((ss, r) => ss + r.soldHours * r.hourlyRate, 0), 0);
    const consumedE = data.reduce((s, r) => s + r.hours * (findRate(r, cfg) ?? 0), 0);
    const pctH = soldH > 0 ? (consumedH / soldH * 100).toFixed(1) : 'N/A';
    const pctE = budgetE > 0 ? (consumedE / budgetE * 100).toFixed(1) : 'N/A';

    lines.push(`Sold Hours: ${soldH.toFixed(2)}h`);
    lines.push(`Hours Consumed: ${consumedH.toFixed(2)}h (${pctH}% of sold hours)`);
    lines.push(`Hours Remaining: ${Math.max(0, soldH - consumedH).toFixed(2)}h`);
    lines.push(`Total Budget: ${fmtMoney(budgetE)}`);
    lines.push(`Budget Consumed: ${fmtMoney(consumedE)} (${pctE}% of total budget)`);
    lines.push(`Budget Remaining: ${fmtMoney(Math.max(0, budgetE - consumedE))}`);

    const dates = data.map(r => r.date).filter(Boolean);
    if (dates.length > 1) {
      const minD = dates.reduce((a, b) => a < b ? a : b);
      const maxD = dates.reduce((a, b) => a > b ? a : b);
      const monthsActive = Math.max(1, (maxD - minD) / (1000 * 60 * 60 * 24 * 30));
      const burnRateH = consumedH / monthsActive;
      lines.push(`Average burn rate: ${burnRateH.toFixed(1)}h/month`);
      if (soldH > consumedH && burnRateH > 0) {
        const mLeft = (soldH - consumedH) / burnRateH;
        lines.push(`At current rate, hours exhausted in ~${mLeft.toFixed(1)} months`);
      }
    }

    lines.push('');
    lines.push('--- TASK BREAKDOWN ---');
    cfg.tasks.forEach(task => {
      const td  = data.filter(r => r.task.toLowerCase() === task.name.toLowerCase());
      const tch = td.reduce((s, r) => s + r.hours, 0);
      const tsh = task.resources.reduce((s, r) => s + r.soldHours, 0);
      const tbe = task.resources.reduce((s, r) => s + r.soldHours * r.hourlyRate, 0);
      const tce = td.reduce((s, r) => s + r.hours * (findRate(r, cfg) ?? 0), 0);
      const ph  = tsh > 0 ? (tch / tsh * 100).toFixed(1) + '%' : 'N/A';
      const pe  = tbe > 0 ? (tce / tbe * 100).toFixed(1) + '%' : 'N/A';
      lines.push(`  ${task.name}:`);
      lines.push(`    Hours:  ${tch.toFixed(2)}h / ${tsh.toFixed(2)}h sold (${ph})`);
      lines.push(`    Budget: ${fmtMoney(tce)} / ${fmtMoney(tbe)} (${pe})`);
    });

    lines.push('');
    lines.push('--- ROLE BREAKDOWN ---');
    const roleMap = {};
    data.forEach(r => { roleMap[r.role] = (roleMap[r.role] || 0) + r.hours; });
    Object.entries(roleMap).sort((a, b) => b[1] - a[1])
      .forEach(([role, h]) => lines.push(`  ${role}: ${h.toFixed(2)}h`));

    const monthMap = {};
    data.forEach(r => {
      if (!r.date) return;
      const ym = `${r.date.getFullYear()}${String(r.date.getMonth() + 1).padStart(2, '0')}`;
      if (!monthMap[ym]) monthMap[ym] = { h: 0, e: 0 };
      monthMap[ym].h += r.hours;
      monthMap[ym].e += r.hours * (findRate(r, cfg) ?? 0);
    });

    lines.push('');
    lines.push('--- MONTHLY CONSUMPTION ---');
    Object.keys(monthMap).sort().forEach(ym => {
      const [y, m] = [parseInt(ym.slice(0, 4)), parseInt(ym.slice(4, 6))];
      const lbl = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      lines.push(`  ${lbl}: ${monthMap[ym].h.toFixed(2)}h — ${fmtMoney(monthMap[ym].e)}`);
    });

    if (cfg.phasing && Object.keys(cfg.phasing).length > 0) {
      lines.push('');
      lines.push('--- BUDGET PHASING vs ACTUAL ---');
      [...new Set([...Object.keys(cfg.phasing), ...Object.keys(monthMap)])].sort().forEach(ym => {
        const [y, m] = [parseInt(ym.slice(0, 4)), parseInt(ym.slice(4, 6))];
        const lbl      = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        const planned  = cfg.phasing[ym] || 0;
        const actual   = monthMap[ym]?.e || 0;
        const variance = actual - planned;
        lines.push(`  ${lbl}: Planned ${fmtMoney(planned)}, Actual ${fmtMoney(actual)}, Variance ${variance >= 0 ? '+' : ''}${fmtMoney(variance)}`);
      });
    }

    if (cfg.planning && Object.keys(cfg.planning).length > 0) {
      lines.push('');
      lines.push('--- HOURS PLANNING vs ACTUAL ---');
      [...new Set([...Object.keys(cfg.planning), ...Object.keys(monthMap)])].sort().forEach(ym => {
        const [y, m] = [parseInt(ym.slice(0, 4)), parseInt(ym.slice(4, 6))];
        const lbl      = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        const planned  = cfg.planning[ym] || 0;
        const actual   = monthMap[ym]?.h || 0;
        const variance = actual - planned;
        lines.push(`  ${lbl}: Planned ${planned.toFixed(2)}h, Actual ${actual.toFixed(2)}h, Variance ${variance >= 0 ? '+' : ''}${variance.toFixed(2)}h`);
      });
    }

  } else {
    lines.push(`Hours Consumed: ${consumedH.toFixed(2)}h`);
    lines.push('(No budget configuration available)');
    const roleMap = {};
    data.forEach(r => { roleMap[r.role] = (roleMap[r.role] || 0) + r.hours; });
    lines.push('');
    lines.push('--- ROLE BREAKDOWN ---');
    Object.entries(roleMap).sort((a, b) => b[1] - a[1])
      .forEach(([role, h]) => lines.push(`  ${role}: ${h.toFixed(2)}h`));
  }

  return lines.join('\n');
}

async function callAi(prompt) {
  const provider = appSettings.aiProvider || 'anthropic';
  const models   = AI_MODELS[provider] || [];
  const model    = appSettings.aiModel || (models[0]?.id ?? '');
  const keys     = { anthropic: appSettings.anthropicApiKey, openai: appSettings.openaiApiKey, gemini: appSettings.geminiApiKey };
  const apiKey   = (keys[provider] || '').trim();

  if (provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model, max_tokens: 2048, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `HTTP ${res.status}`); }
    const json = await res.json();
    return json.content?.[0]?.text || 'No response received.';

  } else if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, max_tokens: 2048, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `HTTP ${res.status}`); }
    const json = await res.json();
    return json.choices?.[0]?.message?.content || 'No response received.';

  } else if (provider === 'gemini') {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 2048 },
      }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error?.message || `HTTP ${res.status}`); }
    const json = await res.json();
    return json.candidates?.[0]?.content?.parts?.[0]?.text || 'No response received.';
  }
  throw new Error(`Provider non supportato: ${provider}`);
}

async function openAiAnalysis() {
  if (!hasAiKey()) {
    showConfirm(
      'Nessuna API key AI configurata.\n\nApri ⚙️ Configura Budget → sezione AI Assistant.',
      null, null, 'ℹ️ API Key richiesta'
    );
    return;
  }

  const data = timesheetData.filter(r => r.projectId === selectedProjectId);
  const cfg  = cfgForProject(selectedProjectId);

  document.getElementById('aiSpinner').style.display = 'block';
  document.getElementById('aiResult').style.display  = 'none';
  document.getElementById('aiResult').textContent    = '';
  document.getElementById('aiError').classList.add('d-none');

  bootstrap.Modal.getOrCreateInstance(document.getElementById('aiModal')).show();

  const summary = buildProjectSummary(data, cfg);

  const prompt =
`You are a senior project manager reviewing a professional services project status report.
Analyze the following project data and provide a structured critical assessment.

Your analysis must cover:
1. **Overall project health** — assign a RAG status (Red / Amber / Green) with a short justification
2. **Hours consumption trend** — burn rate analysis, pace vs. sold hours, risk of overrun
3. **Budget consumption** — financial risk, spend efficiency, comparison to phasing (if available)
4. **Planning vs. actuals** — is the project ahead or behind the planned schedule?
5. **Task-level performance** — which tasks are overrunning or underperforming?
6. **Key risks and recommendations** — concrete, actionable suggestions for the project manager

Be concise, objective, and constructive. Use bullet points. Clearly flag critical issues.

=== PROJECT DATA ===
${summary}
=== END OF DATA ===`;

  try {
    const result = await callAi(prompt);
    document.getElementById('aiSpinner').style.display = 'none';
    document.getElementById('aiResult').style.display  = 'block';
    document.getElementById('aiResult').textContent    = result;
  } catch (err) {
    document.getElementById('aiSpinner').style.display = 'none';
    document.getElementById('aiError').textContent     = 'Error: ' + err.message;
    document.getElementById('aiError').classList.remove('d-none');
  }
}

// ── PLANNING AI ANALYSIS ──────────────────────────────────────────────────────
function buildResourceAllocationSummary(projectId) {
  const cfg  = cfgForProject(projectId);
  const data = timesheetData.filter(r => r.projectId === projectId);
  if (!cfg) return '';

  const lines = [];
  lines.push(`PROJECT: ${cfg.name || projectId}`);
  lines.push(`PERIOD:  ${ym2month(cfg.startDate)} → ${ym2month(cfg.endDate)}`);

  // ── Per-task detail ──
  lines.push('\n--- TASKS ---');
  (cfg.tasks || []).forEach(task => {
    const tStart = parseTaskDate(task.startDate || cfg.startDate, false);
    const tEnd   = parseTaskDate(task.endDate   || cfg.endDate,   true);
    const weeks  = Math.max(1, Math.ceil((tEnd - tStart) / (7 * 86400000)));
    const label  = d => d.toISOString().slice(0, 10);
    const status = task.completed ? 'COMPLETED' : task.billable === false ? 'EXCLUDED' : 'In progress';

    lines.push(`\nTask: ${task.name}  [${status}]`);
    lines.push(`  Period: ${label(tStart)} → ${label(tEnd)}  (${weeks} weeks)`);
    lines.push('  Sold resources:');
    (task.resources || []).forEach(res => {
      const wkLoad  = (res.soldHours / weeks).toFixed(1);
      const consumed = data
        .filter(r => r.task.toLowerCase() === task.name.toLowerCase()
                  && r.role.toLowerCase() === res.role.toLowerCase())
        .reduce((s, r) => s + r.hours, 0);
      lines.push(`    ${res.role}: ${res.soldHours}h sold (≈${wkLoad}h/wk), ${consumed.toFixed(1)}h consumed`);
    });
  });

  // ── Cross-task aggregation per owner ──
  lines.push('\n--- OWNER CROSS-TASK ALLOCATION ---');

  // Build: owner → [{ task, role, soldHours, weeklyLoad, start, end, weeks }]
  const ownerMap = {};
  (cfg.tasks || []).forEach(task => {
    const tStart = parseTaskDate(task.startDate || cfg.startDate, false);
    const tEnd   = parseTaskDate(task.endDate   || cfg.endDate,   true);
    const weeks  = Math.max(1, Math.ceil((tEnd - tStart) / (7 * 86400000)));

    (task.resources || []).forEach(res => {
      const owners = [...new Set(
        data.filter(r => r.task.toLowerCase() === task.name.toLowerCase()
                      && r.role.toLowerCase() === res.role.toLowerCase())
            .map(r => r.owner).filter(Boolean)
      )];
      const keys = owners.length ? owners : [res.role]; // fallback to role if no XLS data
      keys.forEach(key => {
        if (!ownerMap[key]) ownerMap[key] = [];
        ownerMap[key].push({
          task: task.name, role: res.role,
          soldHours: res.soldHours,
          weeklyLoad: res.soldHours / weeks,
          start: tStart, end: tEnd, weeks,
        });
      });
    });
  });

  Object.entries(ownerMap).sort((a, b) => a[0].localeCompare(b[0])).forEach(([owner, asgns]) => {
    const totalH = asgns.reduce((s, a) => s + a.soldHours, 0);
    lines.push(`\nResource: ${owner}  (total on project: ${totalH}h)`);
    asgns.forEach(a => {
      const label = d => d.toISOString().slice(0, 10);
      lines.push(`  [${a.task}] ${a.role}: ${a.soldHours}h / ${a.weeks}wk ≈ ${a.weeklyLoad.toFixed(1)}h/wk  (${label(a.start)}→${label(a.end)})`);
    });

    // Detect overlapping task pairs and their combined weekly load
    for (let i = 0; i < asgns.length; i++) {
      for (let j = i + 1; j < asgns.length; j++) {
        const a = asgns[i], b = asgns[j];
        if (a.start > b.end || b.start > a.end) continue;
        const oStart = new Date(Math.max(a.start, b.start));
        const oEnd   = new Date(Math.min(a.end,   b.end));
        const oWks   = Math.max(1, Math.ceil((oEnd - oStart) / (7 * 86400000)));
        const combo  = (a.weeklyLoad + b.weeklyLoad).toFixed(1);
        lines.push(`  ⚠ OVERLAP [${a.task}] + [${b.task}]: ${oWks} weeks, combined ≈${combo}h/wk on this project`);
      }
    }
  });

  return lines.join('\n');
}

async function openPlanningAiAnalysis() {
  if (!hasAiKey()) {
    showConfirm(
      'Nessuna API key AI configurata.\n\nApri ⚙️ Configura Budget → sezione AI Assistant.',
      null, null, 'ℹ️ API Key richiesta'
    );
    return;
  }

  const summary = buildResourceAllocationSummary(planningProjectId);

  const modalTitle = document.querySelector('#aiModal .modal-title');
  if (modalTitle) modalTitle.textContent = '🤖 Resource Allocation Analysis';

  document.getElementById('aiSpinner').style.display = 'block';
  document.getElementById('aiResult').style.display  = 'none';
  document.getElementById('aiResult').textContent    = '';
  document.getElementById('aiError').classList.add('d-none');
  bootstrap.Modal.getOrCreateInstance(document.getElementById('aiModal')).show();

  const prompt =
`You are a resource allocation expert reviewing a professional services project.

Working assumptions:
- Each resource is contracted for 40h/week total across ALL projects and activities
- Realistic availability on a single project: 20–28h/week (50–70% of contract)
- A weekly load above 28h/week on this project alone is a critical overallocation risk
- A weekly load of 20–28h/week is acceptable but leaves little buffer
- Overlapping tasks on the same resource compound the risk

Your task: produce a CONCRETE, PRIORITISED list of allocation issues found in the data below.

For every issue:
1. Name the resource
2. Name the task(s) involved
3. State the exact period affected (dates)
4. Quantify the problem (e.g. "allocated 34h/wk vs. ~24h realistic maximum")
5. Give a specific, actionable recommendation

Sort issues by severity (Critical → High → Medium). If no issues are found for a category, say so explicitly.
After the issues list, add a brief summary of overall allocation health (1–3 sentences).

Do not give generic advice. Every statement must reference specific resources, tasks, and numbers from the data.

=== PROJECT ALLOCATION DATA ===
${summary}
=== END ===`;

  try {
    const result = await callAi(prompt);
    document.getElementById('aiSpinner').style.display = 'none';
    document.getElementById('aiResult').style.display  = 'block';
    document.getElementById('aiResult').textContent    = result;
  } catch (err) {
    document.getElementById('aiSpinner').style.display = 'none';
    document.getElementById('aiError').textContent     = 'Error: ' + err.message;
    document.getElementById('aiError').classList.remove('d-none');
  }
}
