-- Migration 015: generic app settings table
CREATE TABLE IF NOT EXISTS app_settings (
  key        VARCHAR(100) PRIMARY KEY,
  value      TEXT         NOT NULL,
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by UUID         REFERENCES users(id) ON DELETE SET NULL
);

-- Seed: initial terms version + placeholder content
INSERT INTO app_settings (key, value) VALUES
  ('terms_version', '1'),
  ('terms_content',
'<h2>1. Purpose of this application</h2>
<p>PDash is an internal tool used exclusively by authorised employees of the company. It supports pipeline management, project reporting, resource planning, and cost-grid editing. Access is granted only to company personnel and is governed by your employment agreement.</p>

<h2>2. Data we collect and why</h2>
<p>We process the following personal data in order to operate the application:</p>
<ul>
  <li><strong>Identity data</strong> (first name, last name, email address) — to authenticate you and attribute actions to your account.</li>
  <li><strong>Usage data</strong> (proposals created or edited, cost grids, project configurations) — to support your daily work and enable collaboration.</li>
  <li><strong>Timesheet data</strong> (hours, role, date — uploaded by authorised users) — to compute project actuals and resource planning.</li>
  <li><strong>Session data</strong> (httpOnly JWT cookie, valid for 8 hours) — to keep you logged in securely. No tracking cookies are used.</li>
</ul>
<p>The legal basis for processing is the performance of your employment contract (Art. 6(1)(b) GDPR) and the legitimate interest of the company in running its operations (Art. 6(1)(f) GDPR).</p>

<h2>3. Data retention</h2>
<p>Your personal data is retained for the duration of your employment. Upon termination, your account will be disabled and your personal details anonymised within a reasonable period. Operational records (proposals, projects, cost grids) may be retained for business continuity and legal compliance purposes.</p>

<h2>4. Who can access your data</h2>
<p>Application administrators can view and manage all user accounts and data within PDash. Data is stored on company-controlled infrastructure and is not shared with third parties, except for the SMTP provider used to deliver system notifications and email alerts.</p>

<h2>5. Your rights</h2>
<p>Under GDPR you have the right to:</p>
<ul>
  <li><strong>Access</strong> — request a copy of the personal data we hold about you.</li>
  <li><strong>Rectification</strong> — correct inaccurate personal data (name, email) directly in your profile settings or by contacting an administrator.</li>
  <li><strong>Erasure</strong> — request deletion of your personal data when you leave the company or when it is no longer necessary.</li>
  <li><strong>Restriction</strong> — ask us to limit processing in specific circumstances.</li>
  <li><strong>Portability</strong> — receive your data in a machine-readable format on request.</li>
</ul>
<p>To exercise any of these rights, contact your system administrator.</p>

<h2>6. Security</h2>
<p>Access to PDash requires authentication with a personal password. Sessions are protected with httpOnly cookies to prevent cross-site scripting attacks. Passwords are stored as cryptographic hashes and are never accessible in plain text.</p>

<h2>7. Changes to this notice</h2>
<p>If the content of this notice changes materially, you will be asked to acknowledge the updated version the next time you log in.</p>')
ON CONFLICT (key) DO NOTHING;
