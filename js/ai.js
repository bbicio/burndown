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

// ── EMAIL REPORT ──────────────────────────────────────────────────────────────
function buildEmailHTML(data, cfg) {
  const projectName = cfg?.name || selectedProjectId;
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const bData     = billableData(data, cfg);
  const consumedH = bData.reduce((s, r) => s + r.hours, 0);
  let soldH = null, budgetE = null, consumedE = null, pctH = null, pctE = null;
  if (cfg) {
    const bTasks = billableTasks(cfg);
    soldH     = bTasks.reduce((s, t) => s + t.resources.reduce((ss, r) => ss + r.soldHours, 0), 0);
    budgetE   = bTasks.reduce((s, t) => s + t.resources.reduce((ss, r) => ss + r.soldHours * r.hourlyRate, 0), 0);
    consumedE = bData.reduce((s, r) => s + r.hours * (findRate(r, cfg) ?? 0), 0);
    pctH = soldH > 0 ? (consumedH / soldH * 100).toFixed(1) : null;
    pctE = budgetE > 0 ? (consumedE / budgetE * 100).toFixed(1) : null;
  }

  const kpiBox = (label, value, sub, color) =>
    `<td style="width:25%;padding:10px;border-radius:var(--radius-md);background:#f8f9fa;border-left:4px solid ${color};vertical-align:top">
      <div style="font-size:var(--text-xs);color:#6c757d;margin-bottom:4px">${label}</div>
      <div style="font-size:var(--text-2xl);font-weight:700;color:#212529">${value}</div>
      ${sub ? `<div style="font-size:var(--text-xs);color:#6c757d">${sub}</div>` : ''}
    </td>`;

  const kpiRow = `<table width="100%" cellspacing="12" cellpadding="0" style="margin-bottom:24px">
    <tr>
      ${kpiBox('📦 Total Sold Hours',  soldH != null ? fmtH(soldH) : '—', 'from configuration', '#0d6efd')}
      ${kpiBox('💰 Total Budget',      budgetE != null ? fmtMoney(budgetE) : '—', 'hours × hourly rate', '#198754')}
      ${kpiBox('⏱️ Hours Consumed',    fmtH(consumedH), pctH ? `${pctH}% of sold hours` : 'total to date', '#fd7e14')}
      ${kpiBox('💸 Budget Consumed',   consumedE != null ? fmtMoney(consumedE) : '—', pctE ? `${pctE}% of budget` : '', '#6f42c1')}
    </tr>
  </table>`;

  // ── Monthly Summary (replicates renderMonthlyTable structure) ─────────────────
  let monthlyTable = '';
  if (data.length) {
    let startY, startM, endY, endM;
    if (cfg?.startDate && cfg?.endDate) {
      startY = parseInt(cfg.startDate.slice(0, 4));
      startM = parseInt(cfg.startDate.slice(4, 6));
      endY   = parseInt(cfg.endDate.slice(0, 4));
      endM   = parseInt(cfg.endDate.slice(4, 6));
    } else {
      const dates = data.filter(r => r.date).map(r => r.date);
      if (dates.length) {
        const minD = dates.reduce((a, b) => a < b ? a : b);
        const maxD = dates.reduce((a, b) => a > b ? a : b);
        startY = minD.getFullYear(); startM = minD.getMonth() + 1;
        endY   = maxD.getFullYear(); endM   = maxD.getMonth() + 1;
      }
    }
    if (startY) {
      const pad2 = n => String(n).padStart(2, '0');
      const ptcItems   = cfg?.ptc || [];
      const ptcByMonth = {};
      ptcItems.forEach(p => { if (p.month) ptcByMonth[p.month] = (ptcByMonth[p.month] || 0) + (p.amount || 0); });
      const hasPtc = ptcItems.length > 0;
      const emailBData = billableData(data, cfg);

      const months = [];
      let cy = startY, cm = startM;
      while (cy < endY || (cy === endY && cm <= endM)) {
        const ym     = `${cy}${pad2(cm)}`;
        const mStart = new Date(cy, cm - 1, 1);
        const mEnd   = new Date(cy, cm, 0, 23, 59, 59);
        const rows   = emailBData.filter(r => r.date && r.date >= mStart && r.date <= mEnd);
        const hours  = rows.reduce((s, r) => s + r.hours, 0);
        const spent  = cfg ? rows.reduce((s, r) => s + r.hours * (findRate(r, cfg) ?? 0), 0) : null;
        const estimatedHours = cfg?.planning?.[ym] ?? 0;
        const estimated      = cfg?.phasing?.[ym]  ?? 0;
        const ptc            = ptcByMonth[ym] || 0;
        const label = mStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        months.push({ label, hours, estimatedHours, spent, estimated, ptc });
        cm++; if (cm > 12) { cm = 1; cy++; }
      }
      const totHours          = months.reduce((s, m) => s + m.hours, 0);
      const totEstimatedHours = cfg ? months.reduce((s, m) => s + m.estimatedHours, 0) : null;
      const totHoursVariance  = totEstimatedHours !== null ? totEstimatedHours - totHours : null;
      const totSpent          = cfg ? months.reduce((s, m) => s + (m.spent ?? 0), 0) : null;
      const totEstimated      = cfg ? months.reduce((s, m) => s + m.estimated, 0) : null;
      const totBudgetVariance = (totEstimated !== null && totSpent !== null) ? totEstimated - totSpent : null;
      const totPtc            = hasPtc ? months.reduce((s, m) => s + m.ptc, 0) : null;

      const mDataRows = months.map((m, i) => {
        const hVar = cfg ? m.estimatedHours - m.hours : null;
        const bVar = m.spent !== null ? m.estimated - m.spent : null;
        const bg   = i % 2 === 0 ? '#ffffff' : '#f8f9fa';
        return `<tr style="background:${bg}">
          <td style="padding:7px 10px">${m.label}</td>
          <td style="padding:7px 10px;text-align:right;border-left:1px solid #dee2e6">${cfg ? fmtH(m.estimatedHours) : '—'}</td>
          <td style="padding:7px 10px;text-align:right">${fmtH(m.hours)}</td>
          <td style="padding:7px 10px;text-align:right${hVar !== null && hVar < 0 ? ';color:#dc3545;font-weight:700' : ''}">${hVar !== null ? fmtH(hVar) : '—'}</td>
          <td style="padding:7px 10px;text-align:right;border-left:1px solid #dee2e6">${cfg ? fmtMoney(m.estimated) : '—'}</td>
          <td style="padding:7px 10px;text-align:right">${m.spent !== null ? fmtMoney(m.spent) : '—'}</td>
          <td style="padding:7px 10px;text-align:right${bVar !== null && bVar < 0 ? ';color:#dc3545;font-weight:700' : ''}">${bVar !== null ? fmtMoney(bVar) : '—'}</td>
          ${hasPtc ? `<td style="padding:7px 10px;text-align:right;border-left:1px solid #dee2e6">${m.ptc > 0 ? fmtMoney(m.ptc) : '—'}</td>` : ''}
        </tr>`;
      }).join('');

      monthlyTable = `
        <h3 style="font-size:var(--text-md);font-weight:700;text-transform:uppercase;color:#6c757d;letter-spacing:.05em;margin:0 0 8px">Monthly Consumption</h3>
        <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:24px;font-size:var(--text-base)">
          <thead>
            <tr style="background:#f8f9fa">
              <th rowspan="2" style="padding:7px 10px;text-align:left;font-weight:600;vertical-align:middle;border-bottom:2px solid #dee2e6">Month</th>
              <th colspan="3" style="padding:7px 10px;text-align:center;font-weight:600;border-left:1px solid #dee2e6;border-bottom:2px solid #dee2e6">Hours</th>
              <th colspan="3" style="padding:7px 10px;text-align:center;font-weight:600;border-left:1px solid #dee2e6;border-bottom:2px solid #dee2e6">Budget</th>
              ${hasPtc ? '<th rowspan="2" style="padding:7px 10px;text-align:right;font-weight:600;vertical-align:middle;border-left:1px solid #dee2e6;border-bottom:2px solid #dee2e6">PTC</th>' : ''}
            </tr>
            <tr style="background:#f8f9fa">
              <th style="padding:7px 10px;text-align:right;font-weight:600;border-left:1px solid #dee2e6">Estimated</th>
              <th style="padding:7px 10px;text-align:right;font-weight:600">Consumed</th>
              <th style="padding:7px 10px;text-align:right;font-weight:600">Variance</th>
              <th style="padding:7px 10px;text-align:right;font-weight:600;border-left:1px solid #dee2e6">Estimated</th>
              <th style="padding:7px 10px;text-align:right;font-weight:600">Spent</th>
              <th style="padding:7px 10px;text-align:right;font-weight:600">Variance</th>
            </tr>
          </thead>
          <tbody>
            ${mDataRows}
            <tr style="background:#e9ecef;font-weight:700">
              <td style="padding:7px 10px">TOTAL</td>
              <td style="padding:7px 10px;text-align:right;border-left:1px solid #dee2e6">${totEstimatedHours !== null ? fmtH(totEstimatedHours) : '—'}</td>
              <td style="padding:7px 10px;text-align:right">${fmtH(totHours)}</td>
              <td style="padding:7px 10px;text-align:right${totHoursVariance !== null && totHoursVariance < 0 ? ';color:#dc3545' : ''}">${totHoursVariance !== null ? fmtH(totHoursVariance) : '—'}</td>
              <td style="padding:7px 10px;text-align:right;border-left:1px solid #dee2e6">${totEstimated !== null ? fmtMoney(totEstimated) : '—'}</td>
              <td style="padding:7px 10px;text-align:right">${totSpent !== null ? fmtMoney(totSpent) : '—'}</td>
              <td style="padding:7px 10px;text-align:right${totBudgetVariance !== null && totBudgetVariance < 0 ? ';color:#dc3545' : ''}">${totBudgetVariance !== null ? fmtMoney(totBudgetVariance) : '—'}</td>
              ${hasPtc ? `<td style="padding:7px 10px;text-align:right;border-left:1px solid #dee2e6">${totPtc !== null ? fmtMoney(totPtc) : '—'}</td>` : ''}
            </tr>
          </tbody>
        </table>`;
    }
  }

  // ── Email summary table builder (replicates summaryTable / summaryRows) ────────
  function emailSummaryTable(title, headers, cols) {
    const totSold        = cols.reduce((s, c) => s + c.soldHours, 0);
    const totSoldEur     = cols.reduce((s, c) => s + c.soldEur, 0);
    const totConsumed    = cols.reduce((s, c) => s + c.totalConsumed, 0);
    const totConsumedEur = cols.reduce((s, c) => s + c.totalConsumedEur, 0);
    const totResidual    = totSold - totConsumed;
    const totResidualEur = totSoldEur - totConsumedEur;

    const heE = (h, e) => `${fmtH(h)}<br><span style="font-size:.75em;color:#6c757d">${fmtMoney(e)}</span>`;
    const cStyle = (danger=false, bold=false) =>
      `padding:7px 10px;text-align:right${danger ? ';color:#dc3545;font-weight:700' : bold ? ';font-weight:700' : ''}`;

    return `
      <h3 style="font-size:var(--text-md);font-weight:700;text-transform:uppercase;color:#6c757d;letter-spacing:.05em;margin:0 0 8px">${title}</h3>
      <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:24px;font-size:var(--text-base)">
        <thead>
          <tr style="background:#f8f9fa">
            <th style="padding:7px 10px;text-align:left;font-weight:600"></th>
            ${headers.map(h => `<th style="padding:7px 10px;text-align:right;font-weight:600">${esc(h)}</th>`).join('')}
            <th style="padding:7px 10px;text-align:right;font-weight:700">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:7px 10px;font-weight:600">Total Amount</td>
            ${cols.map(c => `<td style="${cStyle()}">${heE(c.soldHours, c.soldEur)}</td>`).join('')}
            <td style="${cStyle(false, true)}">${heE(totSold, totSoldEur)}</td>
          </tr>
          <tr style="background:#f8f9fa">
            <td style="padding:7px 10px;font-weight:600">Spent</td>
            ${cols.map(c => `<td style="${cStyle()}">${heE(c.totalConsumed, c.totalConsumedEur)}</td>`).join('')}
            <td style="${cStyle(false, true)}">${heE(totConsumed, totConsumedEur)}</td>
          </tr>
          <tr>
            <td style="padding:7px 10px;font-weight:600">In period</td>
            ${cols.map(() => `<td style="padding:7px 10px;text-align:right;color:#6c757d">—</td>`).join('')}
            <td style="padding:7px 10px;text-align:right;font-weight:700;color:#6c757d">—</td>
          </tr>
          <tr style="background:#e9ecef">
            <td style="padding:7px 10px;font-weight:700">Residual</td>
            ${cols.map(c => {
              const h = c.soldHours - c.totalConsumed;
              const e = c.soldEur   - c.totalConsumedEur;
              return `<td style="${cStyle(h < 0)}">${heE(h, e)}</td>`;
            }).join('')}
            <td style="${cStyle(totResidual < 0, true)}">${heE(totResidual, totResidualEur)}</td>
          </tr>
        </tbody>
      </table>`;
  }

  // ── Summary by task (billable only) ───────────────────────────────────────────
  let taskSummaryTable = '';
  if (cfg?.tasks?.length) {
    const eTasks = billableTasks(cfg);
    const cols = eTasks.map(task => {
      const key              = task.name.toLowerCase();
      const soldHours        = task.resources.reduce((s, r) => s + r.soldHours, 0);
      const soldEur          = task.resources.reduce((s, r) => s + r.soldHours * r.hourlyRate, 0);
      const taskRows         = bData.filter(r => r.task.toLowerCase() === key);
      const totalConsumed    = taskRows.reduce((s, r) => s + r.hours, 0);
      const totalConsumedEur = taskRows.reduce((s, r) => s + r.hours * (findRate(r, cfg) ?? 0), 0);
      return { soldHours, soldEur, totalConsumed, totalConsumedEur };
    });
    taskSummaryTable = emailSummaryTable('Task Breakdown', eTasks.map(t => t.name), cols);
  }

  // ── Summary by role (billable only) ───────────────────────────────────────────
  let roleSummaryTable = '';
  if (cfg?.tasks?.length) {
    const roleMap = new Map();
    billableTasks(cfg).forEach(task =>
      task.resources.forEach(res => {
        const key = res.role.toLowerCase();
        if (!roleMap.has(key)) roleMap.set(key, { role: res.role, soldHours: 0, soldEur: 0 });
        roleMap.get(key).soldHours += res.soldHours;
        roleMap.get(key).soldEur   += res.soldHours * res.hourlyRate;
      })
    );
    const cols = [...roleMap.values()].map(({ role, soldHours, soldEur }) => {
      const key              = role.toLowerCase();
      const roleRows         = bData.filter(r => r.role.toLowerCase() === key);
      const totalConsumed    = roleRows.reduce((s, r) => s + r.hours, 0);
      const totalConsumedEur = roleRows.reduce((s, r) => s + r.hours * (findRate(r, cfg) ?? 0), 0);
      return { soldHours, soldEur, totalConsumed, totalConsumedEur };
    });
    roleSummaryTable = emailSummaryTable('Summary by Role', [...roleMap.values()].map(r => r.role), cols);
  }

  // ── PTC table (email) ─────────────────────────────────────────────────────────
  let ptcEmailTable = '';
  const ptcItems = cfg?.ptc || [];
  if (ptcItems.length) {
    const sorted = [...ptcItems].sort((a, b) => (a.month || '').localeCompare(b.month || '') || (a.title || '').localeCompare(b.title || ''));
    const total  = ptcItems.reduce((s, p) => s + (p.amount || 0), 0);
    const ptcRows = sorted.map((p, i) => {
      const bg = i % 2 === 0 ? '#ffffff' : '#f8f9fa';
      let monthLabel = '—';
      if (p.month && p.month.length === 6) {
        const [y, m] = [parseInt(p.month.slice(0, 4)), parseInt(p.month.slice(4, 6))];
        monthLabel = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      }
      return `<tr style="background:${bg}">
        <td style="padding:7px 10px">${monthLabel}</td>
        <td style="padding:7px 10px;font-weight:600">${esc(p.title || '—')}</td>
        <td style="padding:7px 10px;color:#6c757d">${esc(p.note || '')}</td>
        <td style="padding:7px 10px;text-align:right;font-weight:600">${fmtMoney(p.amount || 0)}</td>
      </tr>`;
    }).join('');
    ptcEmailTable = `
      <h3 style="font-size:var(--text-md);font-weight:700;text-transform:uppercase;color:#6c757d;letter-spacing:.05em;margin:0 0 8px">Pass Through Costs</h3>
      <table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:24px;font-size:var(--text-base)">
        <thead>
          <tr style="background:#f8f9fa">
            <th style="padding:7px 10px;text-align:left;font-weight:600;width:160px">Month</th>
            <th style="padding:7px 10px;text-align:left;font-weight:600">Title</th>
            <th style="padding:7px 10px;text-align:left;font-weight:600">Note</th>
            <th style="padding:7px 10px;text-align:right;font-weight:600">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${ptcRows}
          <tr style="background:#e9ecef;font-weight:700">
            <td style="padding:7px 10px" colspan="3">TOTAL</td>
            <td style="padding:7px 10px;text-align:right">${fmtMoney(total)}</td>
          </tr>
        </tbody>
      </table>`;
  }

  return `<div style="font-family:'Segoe UI',Arial,sans-serif;color:#212529;max-width:800px">
    <div style="background:#0B1840;padding:20px 24px;border-radius:var(--radius-md) 8px 0 0;margin-bottom:20px">
      <h1 style="margin:0;font-size:var(--text-2xl);color:#ffffff;font-weight:700">ⓕ Project Status Report</h1>
      <div style="margin-top:6px;font-size:var(--text-base);color:#adb5bd">${projectName} &nbsp;·&nbsp; ${today}</div>
    </div>
    ${kpiRow}
    ${monthlyTable}
    ${ptcEmailTable}
    ${taskSummaryTable}
    ${roleSummaryTable}
    <div style="margin-top:24px;padding-top:12px;border-top:1px solid #dee2e6;font-size:var(--text-xs);color:#adb5bd">
      Generated by Timesheet Burndown Dashboard
    </div>
  </div>`;
}

function openEmailModal() {
  const data = timesheetData.filter(r => r.projectId === selectedProjectId);
  const cfg  = cfgForProject(selectedProjectId);
  const projectName = cfg?.name || selectedProjectId;
  const today = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  document.getElementById('emailTo').value      = '';
  document.getElementById('emailSubject').value = `Project Status Report — ${projectName} — ${today}`;
  document.getElementById('emailMessage').value = '';
  document.getElementById('emailError').classList.add('d-none');
  document.getElementById('emailSpinner').classList.add('d-none');
  document.getElementById('btnSendEmail').disabled = false;
  document.getElementById('emailPreview').innerHTML = buildEmailHTML(data, cfg);

  bootstrap.Modal.getOrCreateInstance(document.getElementById('emailModal')).show();
}

async function sendEmail() {
  const key      = (appSettings.emailjsKey      || '').trim();
  const service  = (appSettings.emailjsService  || '').trim();
  const template = (appSettings.emailjsTemplate || '').trim();

  if (!key || !service || !template) {
    document.getElementById('emailError').textContent =
      'EmailJS not configured. Open ⚙️ Configure Budget and fill in Public Key, Service ID and Template ID.';
    document.getElementById('emailError').classList.remove('d-none');
    return;
  }

  const to = document.getElementById('emailTo').value.trim();
  if (!to) {
    document.getElementById('emailError').textContent = 'Please enter a recipient email address.';
    document.getElementById('emailError').classList.remove('d-none');
    return;
  }

  const data = timesheetData.filter(r => r.projectId === selectedProjectId);
  const cfg  = cfgForProject(selectedProjectId);

  document.getElementById('emailError').classList.add('d-none');
  document.getElementById('emailSpinner').classList.remove('d-none');
  document.getElementById('btnSendEmail').disabled = true;

  try {
    await emailjs.send(service, template, {
      to_email:       to,
      subject:        document.getElementById('emailSubject').value.trim(),
      message:        document.getElementById('emailMessage').value.trim(),
      project_name:   cfg?.name || selectedProjectId,
      report_date:    new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      report_content: buildEmailHTML(data, cfg),
    }, key);

    bootstrap.Modal.getInstance(document.getElementById('emailModal')).hide();
  } catch (err) {
    document.getElementById('emailSpinner').classList.add('d-none');
    document.getElementById('btnSendEmail').disabled = false;
    document.getElementById('emailError').textContent = 'Send failed: ' + (err?.text || err?.message || JSON.stringify(err));
    document.getElementById('emailError').classList.remove('d-none');
  }
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
