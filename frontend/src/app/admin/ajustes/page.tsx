'use client';

import { useState, useEffect } from 'react';
import { getReviewedJustifications, deleteJustification, deleteMultipleJustifications, getReviewedPunchAdjustments, deletePunchAdjustment, type JustificationFull, type PunchAdjustmentFull } from '@/lib/api';
import { formatDate, formatDateTime, daysAgo, todayISO } from '@/lib/utils';
import * as XLSX from 'xlsx';

function formatMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '-';
  const absMinutes = Math.abs(minutes);
  const h = Math.floor(absMinutes / 60);
  const m = absMinutes % 60;
  const sign = minutes < 0 ? '-' : '+';
  if (h === 0) return `${sign}${m}min`;
  if (m === 0) return `${sign}${h}h`;
  return `${sign}${h}h${m}min`;
}

function isSaturday(dateStr: string): boolean {
  const date = new Date(dateStr + 'T12:00:00');
  return date.getDay() === 6;
}

export default function AdminAjustes() {
  const [justifications, setJustifications] = useState<JustificationFull[]>([]);
  const [punchAdjustments, setPunchAdjustments] = useState<PunchAdjustmentFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'justifications' | 'punch_adjustments'>('justifications');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [startDate, setStartDate] = useState(daysAgo(30));
  const [endDate, setEndDate] = useState(todayISO());
  const [expandedManagers, setExpandedManagers] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<number | null>(null);

  async function loadJustifications() {
    setLoading(true);
    try {
      const [justData, adjData] = await Promise.all([
        getReviewedJustifications(),
        getReviewedPunchAdjustments(),
      ]);
      setJustifications(justData.justifications);
      setPunchAdjustments(adjData.adjustments);
      // Expand all managers by default
      const managers = new Set([
        ...justData.justifications.map(j => j.leader_name || 'Sem Gestor'),
        ...adjData.adjustments.map(a => (a as any).leader_name || 'Sem Gestor'),
      ]);
      setExpandedManagers(managers);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadJustifications();
  }, []);

  // Filter justifications by status and date
  const filtered = justifications.filter(j => {
    if (filterStatus !== 'all' && j.status !== filterStatus) return false;
    if (j.date < startDate || j.date > endDate) return false;
    return true;
  });

  // Group by manager, then by employee
  const groupedByManager = filtered.reduce((acc, j) => {
    const manager = j.leader_name || 'Sem Gestor';
    if (!acc[manager]) acc[manager] = {};

    const employee = j.employee_name;
    if (!acc[manager][employee]) acc[manager][employee] = [];
    acc[manager][employee].push(j);

    return acc;
  }, {} as Record<string, Record<string, JustificationFull[]>>);

  function toggleManager(manager: string) {
    const newExpanded = new Set(expandedManagers);
    if (newExpanded.has(manager)) {
      newExpanded.delete(manager);
    } else {
      newExpanded.add(manager);
    }
    setExpandedManagers(newExpanded);
  }

  function expandAll() {
    setExpandedManagers(new Set(Object.keys(groupedByManager)));
  }

  function collapseAll() {
    setExpandedManagers(new Set());
  }

  async function handleDeleteOne(id: number) {
    if (!confirm('Tem certeza que deseja excluir esta justificativa?')) return;

    setDeleting(id);
    try {
      await deleteJustification(id);
      setJustifications(prev => prev.filter(j => j.id !== id));
    } catch (error) {
      console.error('Failed to delete:', error);
      alert('Erro ao excluir justificativa');
    } finally {
      setDeleting(null);
    }
  }

  async function handleDeleteManager(manager: string) {
    const items = Object.values(groupedByManager[manager] || {}).flat();
    if (items.length === 0) return;

    if (!confirm(`Tem certeza que deseja excluir todas as ${items.length} justificativas de ${manager}?`)) return;

    setDeleting(-1);
    try {
      const ids = items.map(j => j.id);
      await deleteMultipleJustifications(ids);
      setJustifications(prev => prev.filter(j => !ids.includes(j.id)));
    } catch (error) {
      console.error('Failed to delete:', error);
      alert('Erro ao excluir justificativas');
    } finally {
      setDeleting(null);
    }
  }

  async function handleDeleteEmployee(manager: string, employee: string) {
    const items = groupedByManager[manager]?.[employee] || [];
    if (items.length === 0) return;

    if (!confirm(`Tem certeza que deseja excluir todas as ${items.length} justificativas de ${employee}?`)) return;

    setDeleting(-1);
    try {
      const ids = items.map(j => j.id);
      await deleteMultipleJustifications(ids);
      setJustifications(prev => prev.filter(j => !ids.includes(j.id)));
    } catch (error) {
      console.error('Failed to delete:', error);
      alert('Erro ao excluir justificativas');
    } finally {
      setDeleting(null);
    }
  }

  function exportToExcel() {
    if (filtered.length === 0) {
      alert('Nenhuma justificativa para exportar');
      return;
    }

    // Prepare data for Excel
    const excelData = filtered.map(j => {
      const saturday = isSaturday(j.date);
      return {
        'Gestor': j.leader_name || 'Sem Gestor',
        'Colaborador': j.employee_name,
        'Data': formatDate(j.date),
        'Dia': saturday ? 'Sabado' : 'Semana',
        'Entrada': j.punch_1 || '-',
        'Intervalo': saturday ? '-' : (j.punch_2 || '-'),
        'Retorno': saturday ? '-' : (j.punch_3 || '-'),
        'Saida': saturday ? (j.punch_2 || '-') : (j.punch_4 || '-'),
        'Classificacao': j.classification === 'late' ? 'Atraso' :
                         j.classification === 'overtime' ? 'Hora Extra' : 'Normal',
        'Diferenca (min)': j.difference_minutes ?? '-',
        'Motivo': j.reason,
        'Nota Colaborador': j.custom_note || '-',
        'Aprovado': j.status === 'approved' ? 'Sim' : 'Nao',
        'Comentario Gestor': j.manager_comment || '-',
        'Revisado por': j.reviewed_by || '-',
        'Data Revisao': j.reviewed_at ? formatDateTime(j.reviewed_at) : '-',
      };
    });

    // Sort by manager, then employee, then date
    excelData.sort((a, b) => {
      if (a['Gestor'] !== b['Gestor']) return a['Gestor'].localeCompare(b['Gestor']);
      if (a['Colaborador'] !== b['Colaborador']) return a['Colaborador'].localeCompare(b['Colaborador']);
      return a['Data'].localeCompare(b['Data']);
    });

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);

    // Set column widths
    ws['!cols'] = [
      { wch: 20 },  // Gestor
      { wch: 25 },  // Colaborador
      { wch: 12 },  // Data
      { wch: 8 },   // Dia
      { wch: 8 },   // Entrada
      { wch: 8 },   // Intervalo
      { wch: 8 },   // Retorno
      { wch: 8 },   // Saida
      { wch: 12 },  // Classificacao
      { wch: 14 },  // Diferenca
      { wch: 25 },  // Motivo
      { wch: 25 },  // Nota Colaborador
      { wch: 10 },  // Aprovado
      { wch: 25 },  // Comentario Gestor
      { wch: 15 },  // Revisado por
      { wch: 18 },  // Data Revisao
    ];

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(wb, ws, 'Ajustes');

    // Generate filename with date range
    const filename = `ajustes_${startDate}_a_${endDate}.xlsx`;

    // Download the file
    XLSX.writeFile(wb, filename);
  }

  // Filter punch adjustments by status and date
  const filteredAdjustments = punchAdjustments.filter(a => {
    if (filterStatus !== 'all' && a.status !== filterStatus) return false;
    if (a.date < startDate || a.date > endDate) return false;
    return true;
  });

  // Group adjustments by manager
  const groupedAdjustments = filteredAdjustments.reduce((acc, a) => {
    const manager = (a as any).leader_name || 'Sem Gestor';
    if (!acc[manager]) acc[manager] = {};
    const employee = a.employee_name;
    if (!acc[manager][employee]) acc[manager][employee] = [];
    acc[manager][employee].push(a);
    return acc;
  }, {} as Record<string, Record<string, PunchAdjustmentFull[]>>);

  async function handleDeletePunchAdjustment(id: number) {
    if (!confirm('Tem certeza que deseja excluir este ajuste de ponto?')) return;
    setDeleting(id);
    try {
      await deletePunchAdjustment(id);
      setPunchAdjustments(prev => prev.filter(a => a.id !== id));
    } catch (error) {
      console.error('Failed to delete:', error);
      alert('Erro ao excluir ajuste de ponto');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">Ajustes</h2>
          <p className="text-sm text-text-tertiary mt-1">
            Justificativas e pontos incompletos revisados
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input text-sm"
          >
            <option value="all">Todos os Status</option>
            <option value="approved">Aprovadas</option>
            <option value="rejected">Reprovadas</option>
          </select>
          <button onClick={expandAll} className="btn-secondary text-xs px-2 py-1">
            Expandir
          </button>
          <button onClick={collapseAll} className="btn-secondary text-xs px-2 py-1">
            Recolher
          </button>
          <button
            onClick={exportToExcel}
            className="btn-secondary text-sm flex items-center gap-1"
            disabled={loading || filtered.length === 0}
            title="Exportar para Excel"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Excel
          </button>
          <button
            onClick={loadJustifications}
            className="btn-secondary text-sm"
            disabled={loading}
          >
            Atualizar
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border">
        <button
          onClick={() => setActiveTab('justifications')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'justifications'
              ? 'border-accent-primary text-accent-primary'
              : 'border-transparent text-text-muted hover:text-text-primary'
          }`}
        >
          Justificativas ({justifications.length})
        </button>
        <button
          onClick={() => setActiveTab('punch_adjustments')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'punch_adjustments'
              ? 'border-accent-primary text-accent-primary'
              : 'border-transparent text-text-muted hover:text-text-primary'
          }`}
        >
          Pontos Incompletos ({punchAdjustments.length})
        </button>
      </div>

      {/* Date Filter */}
      <div className="card bg-bg-secondary">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-sm text-text-muted">Filtrar por data:</span>
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-muted">De:</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="input text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-muted">Ate:</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="input text-sm"
            />
          </div>
          <span className="text-xs text-text-muted">
            {activeTab === 'justifications'
              ? `${filtered.length} de ${justifications.length} justificativas`
              : `${filteredAdjustments.length} de ${punchAdjustments.length} ajustes`
            }
          </span>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-text-tertiary">Carregando...</p>
      ) : activeTab === 'justifications' ? (
        filtered.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-text-tertiary text-sm">Nenhuma justificativa revisada encontrada</p>
          </div>
        ) : (
        <div className="space-y-4">
          {Object.entries(groupedByManager).sort(([a], [b]) => a.localeCompare(b)).map(([manager, employees]) => {
            const isExpanded = expandedManagers.has(manager);
            const totalForManager = Object.values(employees).flat().length;
            const approvedCount = Object.values(employees).flat().filter(j => j.status === 'approved').length;
            const rejectedCount = Object.values(employees).flat().filter(j => j.status === 'rejected').length;

            return (
              <div key={manager} className="card p-0 overflow-hidden">
                {/* Manager Header */}
                <div className="flex items-center bg-bg-secondary">
                  <button
                    onClick={() => toggleManager(manager)}
                    className="flex-1 px-4 py-3 flex items-center justify-between hover:bg-bg-hover transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                        ▶
                      </span>
                      <span className="font-semibold text-text-primary">{manager}</span>
                      <span className="text-xs text-text-muted bg-bg-tertiary px-2 py-0.5 rounded-full">
                        {Object.keys(employees).length} colaborador{Object.keys(employees).length !== 1 ? 'es' : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-green-500">{approvedCount} ✓</span>
                      <span className="text-red-500">{rejectedCount} ✗</span>
                      <span className="text-text-muted">{totalForManager} total</span>
                    </div>
                  </button>
                  {/* Delete manager button */}
                  <button
                    onClick={() => handleDeleteManager(manager)}
                    disabled={deleting !== null}
                    className="px-3 py-3 text-red-500 hover:bg-red-500/10 transition-colors"
                    title={`Excluir todas ${totalForManager} justificativas de ${manager}`}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>

                {/* Employees under this manager */}
                {isExpanded && (
                  <div className="divide-y divide-border-subtle">
                    {Object.entries(employees).sort(([a], [b]) => a.localeCompare(b)).map(([employee, items]) => (
                      <div key={employee} className="px-4 py-3">
                        {/* Employee name with delete button */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-text-primary">{employee}</span>
                            <span className="text-xs text-text-muted">
                              ({items.length} justificativa{items.length !== 1 ? 's' : ''})
                            </span>
                          </div>
                          <button
                            onClick={() => handleDeleteEmployee(manager, employee)}
                            disabled={deleting !== null}
                            className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1"
                            title={`Excluir todas ${items.length} justificativas de ${employee}`}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                            Excluir todas
                          </button>
                        </div>

                        {/* Justifications table */}
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left text-text-muted">
                                <th className="pr-2 py-1 w-6"></th>
                                <th className="px-2 py-1">Data</th>
                                <th className="px-2 py-1">Entrada</th>
                                <th className="px-2 py-1">Intervalo</th>
                                <th className="px-2 py-1">Retorno</th>
                                <th className="px-2 py-1">Saida</th>
                                <th className="px-2 py-1">Resultado</th>
                                <th className="px-2 py-1">Motivo</th>
                                <th className="px-2 py-1 w-8"></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border-subtle">
                              {items.map((j) => {
                                const saturday = isSaturday(j.date);
                                return (
                                  <tr key={j.id} className="hover:bg-bg-hover">
                                    {/* Status */}
                                    <td className="pr-2 py-2">
                                      <span className={j.status === 'approved' ? 'text-green-500' : 'text-red-500'}>
                                        {j.status === 'approved' ? '✓' : '✗'}
                                      </span>
                                    </td>
                                    {/* Date */}
                                    <td className="px-2 py-2 font-mono text-text-secondary">
                                      {formatDate(j.date)}
                                      {saturday && <span className="ml-1 text-text-muted">(Sab)</span>}
                                    </td>
                                    {/* Entrada */}
                                    <td className="px-2 py-2 font-mono text-text-secondary">
                                      {j.punch_1 || '-'}
                                    </td>
                                    {/* Intervalo */}
                                    <td className="px-2 py-2 font-mono text-text-secondary">
                                      {saturday ? <span className="text-text-muted">-</span> : (j.punch_2 || '-')}
                                    </td>
                                    {/* Retorno */}
                                    <td className="px-2 py-2 font-mono text-text-secondary">
                                      {saturday ? <span className="text-text-muted">-</span> : (j.punch_3 || '-')}
                                    </td>
                                    {/* Saida */}
                                    <td className="px-2 py-2 font-mono text-text-secondary">
                                      {saturday ? (j.punch_2 || '-') : (j.punch_4 || '-')}
                                    </td>
                                    {/* Resultado */}
                                    <td className="px-2 py-2">
                                      <span className={`font-medium ${
                                        j.classification === 'late' ? 'text-red-500' :
                                        j.classification === 'overtime' ? 'text-blue-500' :
                                        'text-green-500'
                                      }`}>
                                        {j.classification === 'late' ? 'Atraso' :
                                         j.classification === 'overtime' ? 'H.Extra' :
                                         'Normal'}
                                        {j.difference_minutes !== null && j.difference_minutes !== undefined && (
                                          <span className="ml-1 text-text-muted">
                                            ({formatMinutes(j.difference_minutes)})
                                          </span>
                                        )}
                                      </span>
                                    </td>
                                    {/* Motivo */}
                                    <td className="px-2 py-2 text-text-secondary max-w-[200px]">
                                      <div className="truncate" title={j.reason + (j.custom_note ? ` - ${j.custom_note}` : '')}>
                                        {j.reason}
                                        {j.custom_note && <span className="text-text-muted italic"> - {j.custom_note}</span>}
                                      </div>
                                      {j.manager_comment && (
                                        <div className="text-accent-primary truncate mt-0.5" title={`Gestor: ${j.manager_comment}`}>
                                          Gestor: {j.manager_comment}
                                        </div>
                                      )}
                                    </td>
                                    {/* Delete button */}
                                    <td className="px-2 py-2">
                                      <button
                                        onClick={() => handleDeleteOne(j.id)}
                                        disabled={deleting === j.id}
                                        className="text-red-500 hover:text-red-600 disabled:opacity-50"
                                        title="Excluir justificativa"
                                      >
                                        {deleting === j.id ? (
                                          <span className="animate-spin">...</span>
                                        ) : (
                                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                          </svg>
                                        )}
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        )
      ) : (
        /* Punch Adjustments Tab */
        filteredAdjustments.length === 0 ? (
          <div className="card text-center py-12">
            <p className="text-text-tertiary text-sm">Nenhum ajuste de ponto revisado encontrado</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedAdjustments).sort(([a], [b]) => a.localeCompare(b)).map(([manager, employees]) => {
              const isExpanded = expandedManagers.has(manager);
              const totalForManager = Object.values(employees).flat().length;
              const approvedCount = Object.values(employees).flat().filter(a => a.status === 'approved').length;
              const rejectedCount = Object.values(employees).flat().filter(a => a.status === 'rejected').length;

              return (
                <div key={manager} className="card p-0 overflow-hidden">
                  {/* Manager Header */}
                  <div className="flex items-center bg-bg-secondary">
                    <button
                      onClick={() => toggleManager(manager)}
                      className="flex-1 px-4 py-3 flex items-center justify-between hover:bg-bg-hover transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                          ▶
                        </span>
                        <span className="font-semibold text-text-primary">{manager}</span>
                        <span className="text-xs text-text-muted bg-bg-tertiary px-2 py-0.5 rounded-full">
                          {Object.keys(employees).length} colaborador{Object.keys(employees).length !== 1 ? 'es' : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-green-500">{approvedCount} ✓</span>
                        <span className="text-red-500">{rejectedCount} ✗</span>
                        <span className="text-text-muted">{totalForManager} total</span>
                      </div>
                    </button>
                  </div>

                  {/* Employees under this manager */}
                  {isExpanded && (
                    <div className="divide-y divide-border-subtle">
                      {Object.entries(employees).sort(([a], [b]) => a.localeCompare(b)).map(([employee, items]) => (
                        <div key={employee} className="px-4 py-3">
                          {/* Employee name */}
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-text-primary">{employee}</span>
                              <span className="text-xs text-text-muted">
                                ({items.length} ajuste{items.length !== 1 ? 's' : ''})
                              </span>
                            </div>
                          </div>

                          {/* Adjustments table */}
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left text-text-muted">
                                  <th className="pr-2 py-1 w-6"></th>
                                  <th className="px-2 py-1">Data</th>
                                  <th className="px-2 py-1">Tipo</th>
                                  <th className="px-2 py-1">Entrada</th>
                                  <th className="px-2 py-1">Intervalo</th>
                                  <th className="px-2 py-1">Retorno</th>
                                  <th className="px-2 py-1">Saida</th>
                                  <th className="px-2 py-1">Motivo</th>
                                  <th className="px-2 py-1 w-8"></th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border-subtle">
                                {items.map((a) => (
                                  <tr key={a.id} className="hover:bg-bg-hover">
                                    {/* Status */}
                                    <td className="pr-2 py-2">
                                      <span className={a.status === 'approved' ? 'text-green-500' : 'text-red-500'}>
                                        {a.status === 'approved' ? '✓' : '✗'}
                                      </span>
                                    </td>
                                    {/* Date */}
                                    <td className="px-2 py-2 font-mono text-text-secondary">
                                      {formatDate(a.date)}
                                    </td>
                                    {/* Type */}
                                    <td className="px-2 py-2">
                                      <span className="text-orange-500">
                                        {a.type === 'missing_punch' ? 'Incompleto' : 'Entrada Tardia'}
                                      </span>
                                    </td>
                                    {/* Punches */}
                                    <td className="px-2 py-2 font-mono text-text-secondary">
                                      {a.corrected_punch_1 || a.current_punch_1 || '-'}
                                    </td>
                                    <td className="px-2 py-2 font-mono text-text-secondary">
                                      {a.corrected_punch_2 || a.current_punch_2 || '-'}
                                    </td>
                                    <td className="px-2 py-2 font-mono text-text-secondary">
                                      {a.corrected_punch_3 || a.current_punch_3 || '-'}
                                    </td>
                                    <td className="px-2 py-2 font-mono text-text-secondary">
                                      {a.corrected_punch_4 || a.current_punch_4 || '-'}
                                    </td>
                                    {/* Motivo */}
                                    <td className="px-2 py-2 text-text-secondary max-w-[200px]">
                                      <div className="truncate" title={a.reason}>
                                        {a.reason}
                                      </div>
                                      {a.manager_comment && (
                                        <div className="text-accent-primary truncate mt-0.5" title={`Gestor: ${a.manager_comment}`}>
                                          Gestor: {a.manager_comment}
                                        </div>
                                      )}
                                    </td>
                                    {/* Delete button */}
                                    <td className="px-2 py-2">
                                      <button
                                        onClick={() => handleDeletePunchAdjustment(a.id)}
                                        disabled={deleting === a.id}
                                        className="text-red-500 hover:text-red-600 disabled:opacity-50"
                                        title="Excluir ajuste"
                                      >
                                        {deleting === a.id ? (
                                          <span className="animate-spin">...</span>
                                        ) : (
                                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                          </svg>
                                        )}
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Summary stats */}
      {!loading && activeTab === 'justifications' && filtered.length > 0 && (
        <div className="card bg-bg-secondary">
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-muted">Total:</span>
            <div className="flex items-center gap-4">
              <span className="text-green-500">
                {filtered.filter(j => j.status === 'approved').length} aprovadas
              </span>
              <span className="text-red-500">
                {filtered.filter(j => j.status === 'rejected').length} reprovadas
              </span>
            </div>
          </div>
        </div>
      )}

      {!loading && activeTab === 'punch_adjustments' && filteredAdjustments.length > 0 && (
        <div className="card bg-bg-secondary">
          <div className="flex items-center justify-between text-sm">
            <span className="text-text-muted">Total:</span>
            <div className="flex items-center gap-4">
              <span className="text-green-500">
                {filteredAdjustments.filter(a => a.status === 'approved').length} aprovados
              </span>
              <span className="text-red-500">
                {filteredAdjustments.filter(a => a.status === 'rejected').length} rejeitados
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
