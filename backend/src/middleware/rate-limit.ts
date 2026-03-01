import rateLimit from 'express-rate-limit';

/**
 * Rate limiter for login endpoints
 * 5 attempts per 15 minutes per IP
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: {
    error: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for general API endpoints
 * 100 requests per minute per IP
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests
  message: {
    error: 'Muitas requisicoes. Tente novamente em 1 minuto.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for heavy operations (sync, export)
 * 5 requests per minute per IP
 */
export const heavyOperationLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requests
  message: {
    error: 'Muitas requisicoes de operacoes pesadas. Tente novamente em 1 minuto.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
