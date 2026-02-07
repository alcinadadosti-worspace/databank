'use client';

import { useState, useEffect } from 'react';
import { useAdminAuth } from '../AdminAuthContext';
import {
  getMonthlyReport,
  getSectorReport,
  getEmployeeReport,
  MonthlyReportData,
  SectorReportData,
  EmployeeReportData,
} from '@/lib/api';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899'];

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  return `${h}h ${m}min`;
}

export default function RelatoriosPage() {
  const { authenticated } = useAdminAuth();
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [monthlyData, setMonthlyData] = useState<MonthlyReportData[]>([]);
  const [sectorData, setSectorData] = useState<SectorReportData[]>([]);
  const [topLate, setTopLate] = useState<EmployeeReportData[]>([]);
  const [topOvertime, setTopOvertime] = useState<EmployeeReportData[]>([]);

  useEffect(() => {
    if (!authenticated) return;
    loadData();
  }, [authenticated, year]);

  async function loadData() {
    setLoading(true);
    try {
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;

      const [monthly, sector, employees] = await Promise.all([
        getMonthlyReport(year),
        getSectorReport(startDate, endDate),
        getEmployeeReport(startDate, endDate, 10),
      ]);

      setMonthlyData(monthly.data);
      setSectorData(sector.data);
      setTopLate(employees.topLate);
      setTopOvertime(employees.topOvertime);
    } catch (error) {
      console.error('Error loading reports:', error);
    } finally {
      setLoading(false);
    }
  }

  if (!authenticated) {
    return null;
  }

  const totalLate = sectorData.reduce((sum, s) => sum + s.late, 0);
  const totalOvertime = sectorData.reduce((sum, s) => sum + s.overtime, 0);
  const totalNormal = sectorData.reduce((sum, s) => sum + s.normal, 0);

  const pieData = [
    { name: 'Normal', value: totalNormal, color: '#22c55e' },
    { name: 'Atraso', value: totalLate, color: '#ef4444' },
    { name: 'Hora Extra', value: totalOvertime, color: '#3b82f6' },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Relatórios</h1>
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

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-500">Carregando relatórios...</div>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm font-medium text-gray-500">Total de Registros</div>
              <div className="text-2xl font-bold text-gray-900">{totalLate + totalOvertime + totalNormal}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm font-medium text-gray-500">Normais</div>
              <div className="text-2xl font-bold text-green-600">{totalNormal}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm font-medium text-gray-500">Atrasos</div>
              <div className="text-2xl font-bold text-red-600">{totalLate}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm font-medium text-gray-500">Horas Extras</div>
              <div className="text-2xl font-bold text-blue-600">{totalOvertime}</div>
            </div>
          </div>

          {/* Monthly Chart */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Atrasos e Horas Extras por Mês</h2>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip
                    formatter={(value: number, name: string) => {
                      const labels: Record<string, string> = {
                        late: 'Atrasos',
                        overtime: 'Horas Extras',
                        normal: 'Normais',
                      };
                      return [value, labels[name] || name];
                    }}
                  />
                  <Legend
                    formatter={(value: string) => {
                      const labels: Record<string, string> = {
                        late: 'Atrasos',
                        overtime: 'Horas Extras',
                        normal: 'Normais',
                      };
                      return labels[value] || value;
                    }}
                  />
                  <Bar dataKey="normal" fill="#22c55e" name="normal" />
                  <Bar dataKey="late" fill="#ef4444" name="late" />
                  <Bar dataKey="overtime" fill="#3b82f6" name="overtime" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Sector Chart and Pie Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Por Setor</h2>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sectorData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="sector" type="category" width={120} />
                    <Tooltip
                      formatter={(value: number, name: string) => {
                        const labels: Record<string, string> = {
                          late: 'Atrasos',
                          overtime: 'Horas Extras',
                          normal: 'Normais',
                        };
                        return [value, labels[name] || name];
                      }}
                    />
                    <Legend
                      formatter={(value: string) => {
                        const labels: Record<string, string> = {
                          late: 'Atrasos',
                          overtime: 'Horas Extras',
                          normal: 'Normais',
                        };
                        return labels[value] || value;
                      }}
                    />
                    <Bar dataKey="normal" fill="#22c55e" name="normal" stackId="a" />
                    <Bar dataKey="late" fill="#ef4444" name="late" stackId="a" />
                    <Bar dataKey="overtime" fill="#3b82f6" name="overtime" stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Distribuição Geral</h2>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Top Employees Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Top 10 Atrasos</h2>
              {topLate.length === 0 ? (
                <p className="text-gray-500 text-center py-4">Nenhum atraso registrado</p>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Colaborador</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Ocorrências</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {topLate.map((emp, i) => (
                      <tr key={emp.employee_id}>
                        <td className="px-3 py-2 text-sm text-gray-500">{i + 1}</td>
                        <td className="px-3 py-2 text-sm font-medium text-gray-900">{emp.name}</td>
                        <td className="px-3 py-2 text-sm text-right text-red-600">{emp.late}</td>
                        <td className="px-3 py-2 text-sm text-right text-gray-600">{formatMinutes(emp.lateMinutes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Top 10 Horas Extras</h2>
              {topOvertime.length === 0 ? (
                <p className="text-gray-500 text-center py-4">Nenhuma hora extra registrada</p>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Colaborador</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Ocorrências</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {topOvertime.map((emp, i) => (
                      <tr key={emp.employee_id}>
                        <td className="px-3 py-2 text-sm text-gray-500">{i + 1}</td>
                        <td className="px-3 py-2 text-sm font-medium text-gray-900">{emp.name}</td>
                        <td className="px-3 py-2 text-sm text-right text-blue-600">{emp.overtime}</td>
                        <td className="px-3 py-2 text-sm text-right text-gray-600">{formatMinutes(emp.overtimeMinutes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
