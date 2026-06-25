async function readXLS(file, onComplete) {
  const statusEl = document.getElementById('fileStatus');
  if (statusEl) { statusEl.style.display = 'inline'; statusEl.textContent = '⏳ Uploading…'; }

  try {
    const result = await Api.timesheets.upload(file);
    if (statusEl) statusEl.textContent = `✅ ${file.name} · ${result.totalRows} rows`;
    await refreshTimesheetDataFromApi();
    if (typeof onComplete === 'function') {
      onComplete();
    } else {
      populateProjectSelector();
      showPortfolioView();
    }
  } catch (e) {
    if (statusEl) statusEl.textContent = `❌ Upload failed: ${e.message}`;
    console.error('[upload]', e);
  }
}

async function readXLSForProject(file) {
  const statusEl = document.getElementById('fileStatus');
  if (statusEl) { statusEl.style.display = 'inline'; statusEl.textContent = '⏳ Uploading actuals…'; }

  try {
    // No projectCode filter: import all project codes found in the XLS.
    // The old approach passed the project UUID as the filter, but XLS rows
    // carry D365 codes — not UUIDs — so the filter never matched anything.
    const result = await Api.timesheets.upload(file);
    if (statusEl) statusEl.textContent = `✅ ${file.name} · ${result.totalRows} rows`;
    await refreshTimesheetDataFromApi();
    if (typeof renderPortfolioView === 'function') renderPortfolioView();
    setTimeout(() => { if (statusEl) statusEl.style.display = 'none'; }, 4000);
  } catch (e) {
    if (statusEl) statusEl.textContent = `❌ Upload failed: ${e.message}`;
    console.error('[upload]', e);
  }
}
