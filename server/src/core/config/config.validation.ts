import * as Joi from 'joi';

export const configValidationSchema = Joi.object({
  // Database
  DATABASE_URL: Joi.string().required().messages({
    'any.required': 'DATABASE_URL is required — PostgreSQL connection string',
  }),

  // Redis
  REDIS_URL: Joi.string().required().messages({
    'any.required': 'REDIS_URL is required — Redis connection string',
  }),

  // JWT
  JWT_ACCESS_SECRET: Joi.string().min(64).required().messages({
    'string.min': 'JWT_ACCESS_SECRET must be at least 64 characters',
    'any.required': 'JWT_ACCESS_SECRET is required',
  }),
  JWT_ACCESS_EXPIRY: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(64).required().messages({
    'string.min': 'JWT_REFRESH_SECRET must be at least 64 characters',
    'any.required': 'JWT_REFRESH_SECRET is required',
  }),
  JWT_REFRESH_EXPIRY: Joi.string().default('7d'),

  // Server
  APP_PORT: Joi.number().default(3001),
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  NEPAL_TIMEZONE: Joi.string().default('Asia/Kathmandu'),

  // External APIs
  GEMINI_API_KEY: Joi.string().optional().allow(''),
  ENGINE_HTTP_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .required()
    .messages({
      'string.uri': 'ENGINE_HTTP_URL must be a valid http or https URL',
      'any.required': 'ENGINE_HTTP_URL is required',
    }),
  ENGINE_WS_URL: Joi.string()
    .uri({ scheme: ['ws', 'wss'] })
    .required()
    .messages({
      'string.uri': 'ENGINE_WS_URL must be a valid ws or wss URL',
      'any.required': 'ENGINE_WS_URL is required',
    }),
  ENGINE_HEALTH_CHECK_INTERVAL_MS: Joi.number().default(5000),

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: Joi.string().optional().allow(''),
  CLOUDINARY_API_KEY: Joi.string().optional().allow(''),
  CLOUDINARY_API_SECRET: Joi.string().optional().allow(''),

  // Google OAuth
  GOOGLE_CLIENT_ID: Joi.string().optional().allow(''),
  GOOGLE_CLIENT_SECRET: Joi.string().optional().allow(''),
  GOOGLE_CALLBACK_URL: Joi.string().optional().allow(''),

  // SMTP
  SMTP_HOST: Joi.string().default('localhost'),
  SMTP_PORT: Joi.number().default(1025),
  SMTP_USER: Joi.string().optional().allow(''),
  SMTP_PASS: Joi.string().optional().allow(''),
  SMTP_FROM: Joi.string().default('noreply@nebula.com'),

  // Limits
  WEEKLY_TOPUP_CAP_PAISE: Joi.number().default(50000000),

  // CORS
  CORS_ORIGIN: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .required()
    .messages({
      'string.uri': 'CORS_ORIGIN must be a valid http or https URL',
      'any.required': 'CORS_ORIGIN is required',
    }),
  FRONTEND_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .required()
    .messages({
      'string.uri': 'FRONTEND_URL must be a valid http or https URL',
      'any.required': 'FRONTEND_URL is required',
    }),
});