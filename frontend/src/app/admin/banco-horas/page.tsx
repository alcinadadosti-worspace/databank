'use client';

import { useState, useEffect } from 'react';
import { useAdminAuth } from '../AdminAuthContext';
import {
  getBancoHoras,
  getEmployeeBancoHoras,
  EmployeeBalance,
  EmployeeBancoHorasResponse,
} from '@/lib/api';

function formatMinutes(minutes: number): string {
  const absMinutes = Math.abs(minutes);
  const h = Math.floor(absMinutes / 60);
  const m = absMinutes % 60;
  const sign = minutes < 0 ? '-' : '+';
  if (h === 0) return `${sign}${m}min`;
  if (m === 0) return `${sign}${h}h`;
  return `${sign}${h}h ${m}min`;
}

function getBalanceColor(minutes: number): string {
  if (minutes < -60) return 'text-red-600'; // More than 1h negative
  if (minutes < 0) return 'text-orange-500'; // Negative
  if (minutes > 60) return 'text-blue-600'; // More than 1h positive
  if (minutes > 0) return 'text-green-600'; // Positive
  return 'text-gray-600'; // Zero
}

export default function BancoHorasPage() {
  const { authenticated } = useAdminAuth();
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [employees, setEmployees] = useState<EmployeeBalance[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<number | null>(null);
  const [employeeDetail, setEmployeeDetail] = useState<EmployeeBancoHorasResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    if (!authenticated) return;
    loadData();
  }, [authenticated, year]);

  async function loadData() {
    setLoading(true);
    try {
      const data = await getBancoHoras(year);
      setEmployees(data.employees);
    } catch (error) {
      console.error('Error loading banco de horas:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadEmployeeDetail(employeeId: number) {
    setSelectedEmployee(employeeId);
    setDetailLoading(true);
    try {
      const data = await getEmployeeBancoHoras(employeeId, year);
      setEmployeeDetail(data);
    } catch (error) {
      console.error('Error loading employee detail:', error);
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setSelectedEmployee(null);
    setEmployeeDetail(null);
  }

  if (!authenticated) {
    return null;
  }

  const totalBalance = employees.reduce((sum, e) => sum + e.total_difference, 0);
  const negativeCount = employees.filter(e => e.total_difference < 0).length;
  const positiveCount = employees.filter(e => e.total_difference > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Banco de Horas</h1>
          <p className="text-sm text-gray-500 mt-1">Saldo acumulado por colaborador</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Ano:</label>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            {[2024, 2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm font-medium text-gray-500">Total Colaboradores</div>
          <div className="text-2xl font-bold text-gray-900">{employees.length}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm font-medium text-gray-500">Saldo Geral</div>
          <div className={`text-2xl font-bold ${getBalanceColor(totalBalance)}`}>
            {formatMinutes(totalBalance)}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm font-medium text-gray-500">Saldo Negativo</div>
          <div className="text-2xl font-bold text-red-600">{negativeCount}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm font-medium text-gray-500">Saldo Positivo</div>
          <div className="text-2xl font-bold text-green-600">{positiveCount}</div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-500">Carregando...</div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Colaborador</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Gestor</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Dias</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Atrasos</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Horas Extra</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Saldo</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {employees.map((emp) => (
                <tr key={emp.employee_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{emp.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{emp.leader_name}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600">{emp.days_worked}</td>
                  <td className="px-4 py-3 text-sm text-right text-red-600">{emp.late_count}</td>
                  <td className="px-4 py-3 text-sm text-right text-blue-600">{emp.overtime_count}</td>
                  <td className={`px-4 py-3 text-sm text-right font-semibold ${getBalanceColor(emp.total_difference)}`}>
                    {formatMinutes(emp.total_difference)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => loadEmployeeDetail(emp.employee_id)}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      Detalhes
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Employee Detail Modal */}
      {selectedEmployee && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {employeeDetail?.employee_name || 'Carregando...'}
                </h3>
                <p className="text-sm text-gray-500">Banco de Horas - {year}</p>
              </div>
              <button
                onClick={closeDetail}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
              {detailLoading ? (
                <div className="text-center py-8 text-gray-500">Carregando detalhes...</div>
              ) : employeeDetail ? (
                <div className="space-y-6">
                  {/* Summary */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-xs text-gray-500">Total Trabalhado</div>
                      <div className="text-lg font-bold text-gray-900">{employeeDetail.total_days} dias</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="text-xs text-gray-500">Saldo Acumulado</div>
                      <div className={`text-lg font-bold ${getBalanceColor(employeeDetail.total_difference)}`}>
                        {formatMinutes(employeeDetail.total_difference)}
                      </div>
                    </div>
                  </div>

                  {/* Monthly Breakdown */}
                  <div>
                    <h4 className="font-medium text-gray-900 mb-3">Saldo Mensal</h4>
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead>
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Mês</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Dias</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Atrasos</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Extras</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Saldo Mês</th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Acumulado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {employeeDetail.monthly.map((m) => (
                          <tr key={m.monthKey} className={m.days > 0 ? '' : 'opacity-40'}>
                            <td className="px-3 py-2 text-sm font-medium text-gray-900">{m.month}</td>
                            <td className="px-3 py-2 text-sm text-right text-gray-600">{m.days}</td>
                            <td className="px-3 py-2 text-sm text-right text-red-600">{m.late}</td>
                            <td className="px-3 py-2 text-sm text-right text-blue-600">{m.overtime}</td>
                            <td className={`px-3 py-2 text-sm text-right font-medium ${getBalanceColor(m.difference)}`}>
                              {m.days > 0 ? formatMinutes(m.difference) : '-'}
                            </td>
                            <td className={`px-3 py-2 text-sm text-right font-bold ${getBalanceColor(m.running_balance)}`}>
                              {m.days > 0 ? formatMinutes(m.running_balance) : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Recent Records */}
                  {employeeDetail.records.length > 0 && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-3">Registros Recentes</h4>
                      <div className="max-h-60 overflow-y-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-xs">
                          <thead className="bg-gray-50 sticky top-0">
                            <tr>
                              <th className="px-2 py-1 text-left text-xs font-medium text-gray-500">Data</th>
                              <th className="px-2 py-1 text-left text-xs font-medium text-gray-500">Ent.</th>
                              <th className="px-2 py-1 text-left text-xs font-medium text-gray-500">Alm.</th>
                              <th className="px-2 py-1 text-left text-xs font-medium text-gray-500">Ret.</th>
                              <th className="px-2 py-1 text-left text-xs font-medium text-gray-500">Saí.</th>
                              <th className="px-2 py-1 text-right text-xs font-medium text-gray-500">Dif.</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {employeeDetail.records.map((r) => (
                              <tr key={r.id}>
                                <td className="px-2 py-1 text-gray-600">{r.date}</td>
                                <td className="px-2 py-1 text-gray-600">{r.punch_1 || '-'}</td>
                                <td className="px-2 py-1 text-gray-600">{r.punch_2 || '-'}</td>
                                <td className="px-2 py-1 text-gray-600">{r.punch_3 || '-'}</td>
                                <td className="px-2 py-1 text-gray-600">{r.punch_4 || '-'}</td>
                                <td className={`px-2 py-1 text-right font-medium ${getBalanceColor(r.difference_minutes || 0)}`}>
                                  {r.difference_minutes ? formatMinutes(r.difference_minutes) : '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
