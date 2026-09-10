// Shared HTML wrapper for all system emails (invite, password reset, share
// notification, export ready, admin notification). Mirrors the app's own
// login.html logo/footer styling (navy #0B1840 / magenta #F0287A text logo)
// so emails match the product's visual identity.
function renderEmailHtml({ bodyHtml, appUrl, year = new Date().getFullYear() }) {
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1a1a2e">
      <div style="background:#ffffff;padding:20px 24px;border-bottom:3px solid #F0287A">
        <span style="font-size:22px;font-weight:bold"><span style="color:#F0287A">P</span><span style="color:#0B1840">Dash</span></span>
      </div>
      <div style="padding:24px;background:#ffffff">
        ${bodyHtml}
      </div>
      <div style="background:#0B1840;color:#ffffff;padding:16px 24px;text-align:center;font-size:12px">
        <div><span style="color:#F0287A">P</span>Dash</div>
        <div style="margin-top:4px"><a href="${appUrl}" style="color:#ffffff">${appUrl}</a> &middot; ${year}</div>
      </div>
    </div>
  `;
}

module.exports = { renderEmailHtml };
