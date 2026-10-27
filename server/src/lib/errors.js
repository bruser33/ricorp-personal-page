/* Error de dominio con status HTTP y código estable (el front traduce el código a texto). */
export class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const sendError = (res, err) => res.status(err.status).json({ ok: false, error: err.code, message: err.message, ...err.extra });

/* Envuelve un handler async: HttpError → su status; otro error → 500 genérico. */
export const handle = (fn, logger = console) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (err) {
    if (err instanceof HttpError) return sendError(res, err);
    logger.error('[api] error inesperado:', err?.stack || err);
    if (!res.headersSent) res.status(500).json({ ok: false, error: 'server_error' });
  }
};
