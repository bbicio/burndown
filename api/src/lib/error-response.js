// Status and body of the global error handler's response: a 4xx keeps its message, anything else is generic.
const GENERIC = 'Internal server error';

const isClientStatus = (s) => Number.isInteger(s) && s >= 400 && s <= 499;

function errorResponse(err) {
  if (err && typeof err === 'object' && err.name === 'MulterError') {
    return { status: 400, body: { error: err.message, code: err.code } };
  }
  const status = err && typeof err === 'object' ? (err.status ?? err.statusCode) : undefined;
  if (isClientStatus(status)) {
    // body-parser's JSON.parse message quotes the request body
    if (err.type === 'entity.parse.failed') return { status, body: { error: 'Malformed JSON body' } };
    const body = { error: typeof err.message === 'string' && err.message ? err.message : 'Request error' };
    if (typeof err.code === 'string') body.code = err.code;
    return { status, body };
  }
  return { status: 500, body: { error: GENERIC } };
}

// Express error middleware: logs the error; once a response has started, Express's own handler closes it.
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);   // Express's default handler logs it
  console.error(err);
  const { status, body } = errorResponse(err);
  res.status(status).json(body);
}

// An error out of the multer middleware that is not a MulterError (busboy: "Unexpected end of form") is the client's upload.
function uploadError(err) {
  if (err && typeof err === 'object' && err.name !== 'MulterError' && err.status == null && err.statusCode == null) err.status = 400;
  return err;
}

// Text an error leaves in a row an admin page shows: a PostgreSQL or a socket error keeps only its code
// (the detail goes to the log).
function storedErrorText(err) {
  if (err && typeof err === 'object' && typeof err.severity === 'string' && typeof err.code === 'string') return `Database error (${err.code})`;
  if (err && typeof err === 'object' && typeof err.syscall === 'string' && typeof err.code === 'string') return `Connection error (${err.code})`;
  if (err && typeof err === 'object') return String(err.message || 'Unknown error');
  return err == null ? 'Unknown error' : String(err);
}

module.exports = { errorResponse, errorHandler, isClientStatus, uploadError, storedErrorText };
