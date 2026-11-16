
window.showCostGridEditorView = function (cgId, versionId, opts) {
  const params = { cgId, verId: versionId };
  if (opts && opts.focusName) params.focus = 'name';
  const p = new URLSearchParams(params);
  window.location.href = '/costgrid.html?' + p;
};
