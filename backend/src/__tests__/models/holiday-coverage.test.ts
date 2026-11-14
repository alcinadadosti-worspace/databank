import { getHolidayCoverage, isOffForHoliday, isWorkingDayForEmployee } from '../../models/queries';

// Two cities' municipal holidays on the same date, a national one, and a legacy
// municipal holiday without a list (counts for everyone)
const HOLIDAYS = [
  { id: 1, date: '2026-06-29', name: 'Comerciário Penedo', type: 'municipal', recurring: true, employee_ids: [1, 2] },
  { id: 2, date: '2026-06-29', name: 'Padroeira Palmeira', type: 'municipal', recurring: false, employee_ids: [3] },
  { id: 3, date: '2026-04-21', name: 'Tiradentes', type: 'national', recurring: true },
  { id: 4, date: '2026-08-20', name: 'Emancipação', type: 'municipal', recurring: true, employee_ids: [] },
];

jest.mock('../../models/database', () => ({
  COLLECTIONS: { HOLIDAYS: 'holidays' },
  getNextId: jest.fn(),
  getDb: () => ({
    collection: () => ({
      orderBy: () => ({
        get: async () => ({ docs: HOLIDAYS.map(h => ({ id: String(h.id), data: () => h })) }),
      }),
    }),
  }),
}));

const emp = (id: number) => ({ id, name: `Pessoa ${id}` }) as any;

describe('getHolidayCoverage', () => {
  it('joins the lists of every municipal holiday on the date', async () => {
    const c = await getHolidayCoverage('2026-06-29');
    expect(c.everyone).toBe(false);
    expect([...c.employeeIds].sort()).toEqual([1, 2, 3]);
    expect(isOffForHoliday(c, 2)).toBe(true);
    expect(isOffForHoliday(c, 9)).toBe(false);
  });

  it('a recurring municipal holiday comes back next year, a one-off does not', async () => {
    expect([...(await getHolidayCoverage('2027-06-29')).employeeIds].sort()).toEqual([1, 2]);
  });

  it('national, static and list-less municipal holidays cover everyone', async () => {
    expect((await getHolidayCoverage('2027-04-21')).everyone).toBe(true);
    expect((await getHolidayCoverage('2026-12-25')).everyone).toBe(true); // static list only
    expect((await getHolidayCoverage('2026-08-20')).everyone).toBe(true);
    expect(await getHolidayCoverage('2026-10-14')).toEqual({ everyone: false, employeeIds: new Set() });
  });
});

describe('isWorkingDayForEmployee', () => {
  it('a municipal holiday is a day off only for who is listed — on any of the date\'s holidays', async () => {
    expect(await isWorkingDayForEmployee('2026-06-29', emp(1))).toBe(false);
    expect(await isWorkingDayForEmployee('2026-06-29', emp(3))).toBe(false); // second holiday on the date
    expect(await isWorkingDayForEmployee('2026-06-29', emp(9))).toBe(true);
  });

  it('holidays for everyone', async () => {
    expect(await isWorkingDayForEmployee('2026-12-25', emp(9))).toBe(false);
    expect(await isWorkingDayForEmployee('2026-08-20', emp(9))).toBe(false);
  });
});
