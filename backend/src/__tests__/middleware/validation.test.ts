import {
  timeSchema,
  dateSchema,
  punchAdjustmentApprovalSchema,
  punchAdjustmentRejectionSchema,
  dateRangeSchema,
} from '../../middleware/validation';

describe('validation schemas', () => {
  describe('timeSchema', () => {
    it('should accept valid time formats', () => {
      expect(timeSchema.parse('08:00')).toBe('08:00');
      expect(timeSchema.parse('8:00')).toBe('8:00');
      expect(timeSchema.parse('12:30')).toBe('12:30');
      expect(timeSchema.parse('23:59')).toBe('23:59');
      expect(timeSchema.parse('00:00')).toBe('00:00');
    });

    it('should accept null and undefined', () => {
      expect(timeSchema.parse(null)).toBeNull();
      expect(timeSchema.parse(undefined)).toBeUndefined();
    });

    it('should reject invalid time formats', () => {
      expect(() => timeSchema.parse('25:00')).toThrow();
      expect(() => timeSchema.parse('12:60')).toThrow();
      expect(() => timeSchema.parse('12:5')).toThrow();
      expect(() => timeSchema.parse('1200')).toThrow();
      expect(() => timeSchema.parse('12-00')).toThrow();
      expect(() => timeSchema.parse('abc')).toThrow();
      expect(() => timeSchema.parse('')).toThrow();
    });
  });

  describe('dateSchema', () => {
    it('should accept valid date formats', () => {
      expect(dateSchema.parse('2025-02-17')).toBe('2025-02-17');
      expect(dateSchema.parse('2024-12-31')).toBe('2024-12-31');
      expect(dateSchema.parse('2025-01-01')).toBe('2025-01-01');
    });

    it('should reject invalid date formats', () => {
      expect(() => dateSchema.parse('17-02-2025')).toThrow();
      expect(() => dateSchema.parse('2025/02/17')).toThrow();
      expect(() => dateSchema.parse('2025-2-17')).toThrow();
      expect(() => dateSchema.parse('20250217')).toThrow();
      expect(() => dateSchema.parse('abc')).toThrow();
    });
  });

  describe('punchAdjustmentApprovalSchema', () => {
    it('should accept valid approval with one punch', () => {
      const result = punchAdjustmentApprovalSchema.parse({
        corrected_punch_1: '08:00',
      });
      expect(result.corrected_punch_1).toBe('08:00');
    });

    it('should accept valid approval with all punches', () => {
      const result = punchAdjustmentApprovalSchema.parse({
        corrected_punch_1: '08:00',
        corrected_punch_2: '12:00',
        corrected_punch_3: '14:00',
        corrected_punch_4: '18:00',
        comment: 'Approved',
        reviewedBy: 'Manager',
      });
      expect(result.corrected_punch_4).toBe('18:00');
    });

    it('should reject when no punch is provided', () => {
      expect(() =>
        punchAdjustmentApprovalSchema.parse({
          comment: 'Approved',
        })
      ).toThrow(/pelo menos um horario/i);
    });

    it('should reject when punches are not in order', () => {
      expect(() =>
        punchAdjustmentApprovalSchema.parse({
          corrected_punch_1: '12:00',
          corrected_punch_2: '08:00', // Before punch_1
        })
      ).toThrow(/ordem crescente/i);
    });

    it('should reject when punches are equal', () => {
      expect(() =>
        punchAdjustmentApprovalSchema.parse({
          corrected_punch_1: '08:00',
          corrected_punch_2: '08:00', // Same as punch_1
        })
      ).toThrow(/ordem crescente/i);
    });

    it('should accept non-consecutive punches in order', () => {
      const result = punchAdjustmentApprovalSchema.parse({
        corrected_punch_1: '08:00',
        corrected_punch_4: '18:00', // Skip punch_2 and punch_3
      });
      expect(result.corrected_punch_1).toBe('08:00');
      expect(result.corrected_punch_4).toBe('18:00');
    });
  });

  describe('punchAdjustmentRejectionSchema', () => {
    it('should accept valid rejection with comment', () => {
      const result = punchAdjustmentRejectionSchema.parse({
        comment: 'Invalid request',
        reviewedBy: 'Manager',
      });
      expect(result.comment).toBe('Invalid request');
    });

    it('should reject when comment is empty', () => {
      expect(() =>
        punchAdjustmentRejectionSchema.parse({
          comment: '',
        })
      ).toThrow(/obrigatorio/i);
    });

    it('should reject when comment is missing', () => {
      expect(() =>
        punchAdjustmentRejectionSchema.parse({
          reviewedBy: 'Manager',
        })
      ).toThrow();
    });
  });

  describe('dateRangeSchema', () => {
    it('should accept valid date range', () => {
      const result = dateRangeSchema.parse({
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      });
      expect(result.startDate).toBe('2025-01-01');
      expect(result.endDate).toBe('2025-01-31');
    });

    it('should accept same start and end date', () => {
      const result = dateRangeSchema.parse({
        startDate: '2025-01-15',
        endDate: '2025-01-15',
      });
      expect(result.startDate).toBe('2025-01-15');
    });

    it('should reject when start date is after end date', () => {
      expect(() =>
        dateRangeSchema.parse({
          startDate: '2025-02-01',
          endDate: '2025-01-01',
        })
      ).toThrow(/anterior ou igual/i);
    });

    it('should reject when range exceeds 90 days', () => {
      expect(() =>
        dateRangeSchema.parse({
          startDate: '2025-01-01',
          endDate: '2025-05-01', // 121 days
        })
      ).toThrow(/90 dias/i);
    });

    it('should accept exactly 90 days', () => {
      const result = dateRangeSchema.parse({
        startDate: '2025-01-01',
        endDate: '2025-03-31', // 90 days
      });
      expect(result.startDate).toBe('2025-01-01');
    });
  });
});
