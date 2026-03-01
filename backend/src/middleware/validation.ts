import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';

/**
 * Time format validation (HH:MM)
 */
export const timeSchema = z
  .string()
  .regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato de horario invalido. Use HH:MM')
  .nullable()
  .optional();

/**
 * Date format validation (YYYY-MM-DD)
 */
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de data invalido. Use YYYY-MM-DD');

/**
 * Punch adjustment approval schema
 */
export const punchAdjustmentApprovalSchema = z.object({
  reviewedBy: z.string().optional(),
  comment: z.string().optional(),
  corrected_punch_1: timeSchema,
  corrected_punch_2: timeSchema,
  corrected_punch_3: timeSchema,
  corrected_punch_4: timeSchema,
}).refine(
  (data) => {
    // At least one punch must be provided
    return data.corrected_punch_1 || data.corrected_punch_2 ||
           data.corrected_punch_3 || data.corrected_punch_4;
  },
  { message: 'Informe pelo menos um horario corrigido' }
).refine(
  (data) => {
    // Validate punch order if multiple punches are provided
    const punches = [
      data.corrected_punch_1,
      data.corrected_punch_2,
      data.corrected_punch_3,
      data.corrected_punch_4,
    ].filter(Boolean) as string[];

    if (punches.length <= 1) return true;

    // Convert to minutes for comparison
    const toMinutes = (time: string) => {
      const [h, m] = time.split(':').map(Number);
      return h * 60 + m;
    };

    const minutes = punches.map(toMinutes);
    for (let i = 1; i < minutes.length; i++) {
      if (minutes[i] <= minutes[i - 1]) {
        return false;
      }
    }
    return true;
  },
  { message: 'Os horarios devem estar em ordem crescente (entrada < intervalo < retorno < saida)' }
);

/**
 * Punch adjustment rejection schema
 */
export const punchAdjustmentRejectionSchema = z.object({
  reviewedBy: z.string().optional(),
  comment: z.string().min(1, 'Comentario obrigatorio ao rejeitar'),
});

/**
 * Date range schema for sync operations
 */
export const dateRangeSchema = z.object({
  startDate: dateSchema,
  endDate: dateSchema,
}).refine(
  (data) => {
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    return start <= end;
  },
  { message: 'Data inicial deve ser anterior ou igual a data final' }
).refine(
  (data) => {
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays <= 90;
  },
  { message: 'Periodo maximo de 90 dias' }
);

/**
 * Middleware factory for body validation
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const errors = result.error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      }));

      res.status(400).json({
        error: 'Dados invalidos',
        details: errors,
      });
      return;
    }

    // Replace body with validated data
    req.body = result.data;
    next();
  };
}

/**
 * Middleware factory for query validation
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      const errors = result.error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
      }));

      res.status(400).json({
        error: 'Parametros invalidos',
        details: errors,
      });
      return;
    }

    req.query = result.data as any;
    next();
  };
}
