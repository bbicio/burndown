// Status and body of the global error handler's response: a 4xx keeps its message, anything else is generic.
const GENERIC = 'Internal server error';

function errorResponse(err) {
  if (err && typeof err === 'object' && err.name === 'MulterError') {
    return { status: 400, body: { error: err.message, code: err.code } };
  }
  if (err && typeof err === 'object' && Number.isInteger(err.status) && err.status >= 400 && err.status <= 499) {
    const body = { error: typeof err.message === 'string' && err.message ? err.message : 'Request error' };
    if (typeof err.code === 'string') body.code = err.code;
    return { status: err.status, body };
  }
  return { status: 500, body: { error: GENERIC } };
}

module.exports = { errorResponse };
