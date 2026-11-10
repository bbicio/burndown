// Writes on the users table that must run on one client, inside the caller's transaction.
const { revokeTwoStepState } = require('./two-step');

// Replaces the personal data with anonymous values and keeps the operational records. The rectification
// requests are free text with personal data: they go with the rest, and the admins' notifications of
// them with them (notifications.rectification_request_id ON DELETE CASCADE).
async function anonymizeUser(db, id) {
  await db.query('DELETE FROM rectification_requests WHERE user_id = $1', [id]);
  const { rows: [updated] } = await db.query(
    `UPDATE users SET
       email             = 'anon_' || id || '@deleted.local',
       first_name        = '[Deleted]',
       last_name         = 'User',
       password_hash     = NULL,
       invite_token      = NULL,
       invite_expires    = NULL,
       reset_token       = NULL,
       reset_expires     = NULL,
       terms_version     = NULL,
       terms_accepted_at = NULL,
       password_changed_at = NULL,
       status            = 'disabled'
     WHERE id = $1
     RETURNING id, status`,
    [id]
  );
  await revokeTwoStepState(id, { db });
  return updated;
}

module.exports = { anonymizeUser };
