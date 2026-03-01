import {
  calculateDailyHours,
  shouldAlert,
  formatMinutes,
  classificationLabel,
  PunchSet,
} from '../../services/hours-calculator';

describe('hours-calculator', () => {
  describe('calculateDailyHours', () => {
    describe('weekday calculations (Mon-Fri)', () => {
      it('should calculate normal hours (exactly 8h)', () => {
        const punches: PunchSet = {
          punch1: '08:00',
          punch2: '12:00',
          punch3: '14:00',
          punch4: '18:00',
        };

        const result = calculateDailyHours(punches, { date: '2025-02-17' }); // Monday

        expect(result).not.toBeNull();
        expect(result?.totalWorkedMinutes).toBe(480); // 8 hours
        expect(result?.differenceMinutes).toBe(0);
        expect(result?.classification).toBe('normal');
        expect(result?.isComplete).toBe(true);
      });

      it('should classify as normal within tolerance (+10 min)', () => {
        const punches: PunchSet = {
          punch1: '08:00',
          punch2: '12:00',
          punch3: '14:00',
          punch4: '18:10', // 10 min extra
        };

        const result = calculateDailyHours(punches, { date: '2025-02-17' });

        expect(result?.totalWorkedMinutes).toBe(490);
        expect(result?.differenceMinutes).toBe(10);
        expect(result?.classification).toBe('normal'); // Within tolerance
      });

      it('should classify as normal within tolerance (-10 min)', () => {
        const punches: PunchSet = {
          punch1: '08:00',
          punch2: '12:00',
          punch3: '14:00',
          punch4: '17:50', // 10 min less
        };

        const result = calculateDailyHours(punches, { date: '2025-02-17' });

        expect(result?.totalWorkedMinutes).toBe(470);
        expect(result?.differenceMinutes).toBe(-10);
        expect(result?.classification).toBe('normal'); // Within tolerance
      });

      it('should classify as overtime (+11 min)', () => {
        const punches: PunchSet = {
          punch1: '08:00',
          punch2: '12:00',
          punch3: '14:00',
          punch4: '18:11', // 11 min extra
        };

        const result = calculateDailyHours(punches, { date: '2025-02-17' });

        expect(result?.totalWorkedMinutes).toBe(491);
        expect(result?.differenceMinutes).toBe(11);
        expect(result?.classification).toBe('overtime');
      });

      it('should classify as late (-11 min)', () => {
        const punches: PunchSet = {
          punch1: '08:00',
          punch2: '12:00',
          punch3: '14:00',
          punch4: '17:49', // 11 min less
        };

        const result = calculateDailyHours(punches, { date: '2025-02-17' });

        expect(result?.totalWorkedMinutes).toBe(469);
        expect(result?.differenceMinutes).toBe(-11);
        expect(result?.classification).toBe('late');
      });

      it('should handle flexible lunch times correctly', () => {
        // Lunch at 11:00, return at 13:00, exit at 18:00
        const punches: PunchSet = {
          punch1: '08:00',
          punch2: '11:00', // Early lunch
          punch3: '13:00', // 2h lunch
          punch4: '18:00',
        };

        const result = calculateDailyHours(punches, { date: '2025-02-17' });

        // Morning: 11:00 - 08:00 = 3h (180 min)
        // Afternoon: 18:00 - 13:00 = 5h (300 min)
        // Total: 480 min
        expect(result?.totalWorkedMinutes).toBe(480);
        expect(result?.classification).toBe('normal');
      });

      it('should handle short lunch correctly', () => {
        // 30 min lunch
        const punches: PunchSet = {
          punch1: '08:00',
          punch2: '12:00',
          punch3: '12:30', // 30 min lunch
          punch4: '17:00', // Left early
        };

        const result = calculateDailyHours(punches, { date: '2025-02-17' });

        // Morning: 12:00 - 08:00 = 4h (240 min)
        // Afternoon: 17:00 - 12:30 = 4h30 (270 min)
        // Total: 510 min = 8h30
        expect(result?.totalWorkedMinutes).toBe(510);
        expect(result?.differenceMinutes).toBe(30);
        expect(result?.classification).toBe('overtime');
      });

      it('should return null for incomplete punches', () => {
        const punches: PunchSet = {
          punch1: '08:00',
          punch2: '12:00',
          punch3: null, // Missing
          punch4: '18:00',
        };

        const result = calculateDailyHours(punches, { date: '2025-02-17' });

        expect(result).toBeNull();
      });

      it('should return null for all null punches', () => {
        const punches: PunchSet = {
          punch1: null,
          punch2: null,
          punch3: null,
          punch4: null,
        };

        const result = calculateDailyHours(punches, { date: '2025-02-17' });

        expect(result).toBeNull();
      });
    });

    describe('Saturday calculations', () => {
      it('should calculate normal Saturday hours (4h)', () => {
        const punches: PunchSet = {
          punch1: '08:00',
          punch2: '12:00',
          punch3: null,
          punch4: null,
        };

        const result = calculateDailyHours(punches, { date: '2025-02-22' }); // Saturday

        expect(result).not.toBeNull();
        expect(result?.totalWorkedMinutes).toBe(240); // 4 hours
        expect(result?.differenceMinutes).toBe(0);
        expect(result?.classification).toBe('normal');
      });

      it('should classify Saturday overtime correctly', () => {
        const punches: PunchSet = {
          punch1: '08:00',
          punch2: '12:15', // 15 min extra
          punch3: null,
          punch4: null,
        };

        const result = calculateDailyHours(punches, { date: '2025-02-22' });

        expect(result?.totalWorkedMinutes).toBe(255);
        expect(result?.differenceMinutes).toBe(15);
        expect(result?.classification).toBe('overtime');
      });

      it('should classify Saturday late correctly', () => {
        const punches: PunchSet = {
          punch1: '08:00',
          punch2: '11:45', // 15 min less
          punch3: null,
          punch4: null,
        };

        const result = calculateDailyHours(punches, { date: '2025-02-22' });

        expect(result?.totalWorkedMinutes).toBe(225);
        expect(result?.differenceMinutes).toBe(-15);
        expect(result?.classification).toBe('late');
      });

      it('should use 240 min expected for Saturday regardless of options', () => {
        const punches: PunchSet = {
          punch1: '08:00',
          punch2: '12:00',
          punch3: null,
          punch4: null,
        };

        // Even if expectedMinutes is overridden, Saturday should use 240
        const result = calculateDailyHours(punches, {
          date: '2025-02-22',
          expectedMinutes: 480, // Try to override
        });

        expect(result?.differenceMinutes).toBe(0); // Should be 240 - 240 = 0
      });
    });

    describe('Sunday and holidays', () => {
      it('should return null for Sunday', () => {
        const punches: PunchSet = {
          punch1: '08:00',
          punch2: '12:00',
          punch3: '14:00',
          punch4: '18:00',
        };

        const result = calculateDailyHours(punches, { date: '2025-02-23' }); // Sunday

        expect(result).toBeNull();
      });

      it('should return null for fixed holiday (Christmas)', () => {
        const punches: PunchSet = {
          punch1: '08:00',
          punch2: '12:00',
          punch3: '14:00',
          punch4: '18:00',
        };

        const result = calculateDailyHours(punches, { date: '2025-12-25' });

        expect(result).toBeNull();
      });

      it('should return null for mobile holiday (Carnaval 2025)', () => {
        const punches: PunchSet = {
          punch1: '08:00',
          punch2: '12:00',
          punch3: '14:00',
          punch4: '18:00',
        };

        const result = calculateDailyHours(punches, { date: '2025-03-04' }); // Carnaval Tuesday

        expect(result).toBeNull();
      });
    });

    describe('apprentice calculations', () => {
      it('should use 2 punches for apprentice on weekday', () => {
        const punches: PunchSet = {
          punch1: '08:00',
          punch2: '12:00',
          punch3: null,
          punch4: null,
        };

        const result = calculateDailyHours(punches, {
          date: '2025-02-17',
          isApprentice: true,
        });

        expect(result).not.toBeNull();
        expect(result?.totalWorkedMinutes).toBe(240);
        expect(result?.classification).toBe('normal');
      });

      it('should use custom expected minutes for apprentice', () => {
        const punches: PunchSet = {
          punch1: '08:00',
          punch2: '14:00', // 6 hours
          punch3: null,
          punch4: null,
        };

        const result = calculateDailyHours(punches, {
          date: '2025-02-17',
          isApprentice: true,
          expectedMinutes: 360, // 6 hours expected
        });

        expect(result?.totalWorkedMinutes).toBe(360);
        expect(result?.differenceMinutes).toBe(0);
        expect(result?.classification).toBe('normal');
      });
    });

    describe('without date option', () => {
      it('should default to weekday calculation', () => {
        const punches: PunchSet = {
          punch1: '08:00',
          punch2: '12:00',
          punch3: '14:00',
          punch4: '18:00',
        };

        const result = calculateDailyHours(punches);

        expect(result).not.toBeNull();
        expect(result?.totalWorkedMinutes).toBe(480);
        expect(result?.classification).toBe('normal');
      });
    });
  });

  describe('shouldAlert', () => {
    it('should return true for difference >= 11', () => {
      expect(shouldAlert(11)).toBe(true);
      expect(shouldAlert(15)).toBe(true);
      expect(shouldAlert(100)).toBe(true);
    });

    it('should return true for difference <= -11', () => {
      expect(shouldAlert(-11)).toBe(true);
      expect(shouldAlert(-15)).toBe(true);
      expect(shouldAlert(-100)).toBe(true);
    });

    it('should return false for difference within tolerance', () => {
      expect(shouldAlert(10)).toBe(false);
      expect(shouldAlert(0)).toBe(false);
      expect(shouldAlert(-10)).toBe(false);
      expect(shouldAlert(5)).toBe(false);
      expect(shouldAlert(-5)).toBe(false);
    });
  });

  describe('formatMinutes', () => {
    it('should format hours only', () => {
      expect(formatMinutes(60)).toBe('1h');
      expect(formatMinutes(120)).toBe('2h');
      expect(formatMinutes(480)).toBe('8h');
    });

    it('should format minutes only', () => {
      expect(formatMinutes(30)).toBe('30min');
      expect(formatMinutes(45)).toBe('45min');
      expect(formatMinutes(5)).toBe('5min');
    });

    it('should format hours and minutes', () => {
      expect(formatMinutes(90)).toBe('1h 30min');
      expect(formatMinutes(150)).toBe('2h 30min');
      expect(formatMinutes(495)).toBe('8h 15min');
    });

    it('should handle negative values', () => {
      expect(formatMinutes(-60)).toBe('1h');
      expect(formatMinutes(-30)).toBe('30min');
      expect(formatMinutes(-90)).toBe('1h 30min');
    });

    it('should handle zero', () => {
      expect(formatMinutes(0)).toBe('0min');
    });
  });

  describe('classificationLabel', () => {
    it('should return correct labels', () => {
      expect(classificationLabel('normal')).toBe('Normal');
      expect(classificationLabel('late')).toBe('Atraso');
      expect(classificationLabel('overtime')).toBe('Hora Extra');
    });
  });
});
