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

// One notification per active admin/sysadmin other than the requester, in one statement, already linked
// to the rectification request (anonymizing the requester deletes them). The rows carry the
// notification and the admin's email and first name; none means no admin can read the request.
async function notifyAdmins(db, requestId, title, body, requesterId) {
  const { rows } = await db.query(
    `WITH a AS (SELECT id, email, first_name FROM users
                WHERE status = 'active' AND role IN ('admin','sysadmin') AND id <> $4),
          n AS (INSERT INTO notifications (user_id, type, title, body, url, url_label, rectification_request_id)
                SELECT a.id, 'info', $2::text, $3::text, '/admin.html', 'Open User Admin', $1::uuid FROM a
                RETURNING id, user_id, type, title, body, url, url_label, read_at, created_at)
     SELECT n.*, a.email, a.first_name FROM n JOIN a ON a.id = n.user_id`,
    [requestId, title, body, requesterId]
  );
  return rows;
}

module.exports = { anonymizeUser, notifyAdmins };
