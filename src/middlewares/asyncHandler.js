// Evita repetir try/catch em cada controller assíncrono: encaminha qualquer
// rejeição da Promise para o error handler central (src/middlewares/error.middleware.js).
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
