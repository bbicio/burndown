
window.showPortfolioView = function () {
  window.location.href = '/portfolio.html';
};
window.showDashboardView = function (pid) {
  window.location.href = '/portfolio.html?projectId=' + encodeURIComponent(pid);
};
window.showPipelineBoardView = function () {
  window.location.href = '/pipeline.html';
};
window.updateNavState = function () {};
