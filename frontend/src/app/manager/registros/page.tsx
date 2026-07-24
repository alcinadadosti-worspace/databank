'use client';

import { useState, useEffect, useMemo } from 'react';
import DateRangePicker from '@/components/DateRangePicker';
import RecordsTable from '@/components/RecordsTable';
import { getLeaderRecords, editLeaderRecord, type DailyRecord } from '@/lib/api';
import { exportRecordsToPDF } from '@/lib/pdf-export';
import { formatDate, daysAgo, todayISO } from '@/lib/utils';
import * as XLSX from 'xlsx';
import { useManagerAuth } from '../ManagerAuthContext';

export default function ManagerRecords() {
  const { manager } = useManagerAuth();
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null);

  // Edit modal state
  const [editingRecord, setEditingRecord] = useState<DailyRecord | null>(null);
  const [editForm, setEditForm] = useState({
    punch_1: '',
    punch_2: '',
    punch_3: '',
    punch_4: '',
    reason: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Filters
  const [searchName, setSearchName] = useState('');

  const filteredRecords = useMemo(() => {
    if (!searchName.trim()) return records;
    const q = searchName.toLowerCase().trim();
    return records.filter(r => r.employee_name?.toLowerCase().includes(q));
  }, [records, searchName]);

  function isSaturday(dateStr: string): boolean {
    const date = new Date(dateStr + 'T12:00:00');
    return date.getDay() === 6;
  }

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

  function classificationLabel(classification: string | null): string {
    switch (classification) {
      case 'late': return 'Atraso';
      case 'overtime': return 'Hora Extra';
      case 'normal': return 'Normal';
      case 'ajuste': return 'Ajuste';
      case 'folga': return 'Folga';
      case 'falta': return 'Falta';
      case 'ferias': return 'Férias';
      case 'aparelho_danificado': return 'Ap. Danificado';
      case 'atestado_medico': return 'Atestado Médico';
      case 'outros': return 'Outros';
      case 'sem_registro': return 'Sem Registro';
      default: return '-';
    }
  }

  function exportToExcel() {
    if (filteredRecords.length === 0 || !dateRange) {
      alert('Nenhum registro para exportar');
      return;
    }

    // Sort by employee, then date (raw ISO date — formatted DD/MM/YYYY doesn't sort chronologically)
    const sortedRecords = [...filteredRecords].sort((a, b) => {
      const nameA = a.employee_name || '';
      const nameB = b.employee_name || '';
      if (nameA !== nameB) return nameA.localeCompare(nameB);
      return a.date.localeCompare(b.date);
    });

    const excelData = sortedRecords.map(r => {
      const saturday = isSaturday(r.date);
      return {
        'ID': r.employee_id,
        'Colaborador': r.employee_name || '-',
        'Data': formatDate(r.date),
        'Dia': saturday ? 'Sabado' : 'Semana',
        'Entrada': r.punch_1 || '-',
        'Intervalo': saturday ? '-' : (r.punch_2 || '-'),
        'Retorno': saturday ? '-' : (r.punch_3 || '-'),
        'Saida': saturday ? (r.punch_2 || '-') : (r.punch_4 || '-'),
        'Classificacao': classificationLabel(r.classification),
        'Diferenca (min)': r.difference_minutes ?? '-',
        'Diferenca': formatMinutes(r.difference_minutes),
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);

    ws['!cols'] = [
      { wch: 8 },   // ID
      { wch: 25 },  // Colaborador
      { wch: 12 },  // Data
      { wch: 8 },   // Dia
      { wch: 8 },   // Entrada
      { wch: 8 },   // Intervalo
      { wch: 8 },   // Retorno
      { wch: 8 },   // Saida
      { wch: 14 },  // Classificacao
      { wch: 14 },  // Diferenca (min)
      { wch: 12 },  // Diferenca
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Registros');

    const filename = `registros_equipe_${dateRange.start}_a_${dateRange.end}.xlsx`;
    XLSX.writeFile(wb, filename);
  }

  async function loadRecords(start: string, end: string) {
    if (!manager) return;
    setLoading(true);
    setDateRange({ start, end });
    try {
      const data = await getLeaderRecords(manager.id, start, end);
      setRecords(data.records);
    } catch (error) {
      console.error('Failed to load records:', error);
    } finally {
      setLoading(false);
    }
  }

  // Initial load with the DateRangePicker's default range (last 30 days)
  useEffect(() => {
    if (manager) loadRecords(daysAgo(30), todayISO());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manager?.id]);

  function openEditModal(record: DailyRecord) {
    setEditingRecord(record);
    setEditForm({
      punch_1: record.punch_1 || '',
      punch_2: record.punch_2 || '',
      punch_3: record.punch_3 || '',
      punch_4: record.punch_4 || '',
      reason: '',
    });
    setError('');
  }

  function closeEditModal() {
    setEditingRecord(null);
    setError('');
  }

  async function handleSaveEdit() {
    if (!editingRecord || !manager) return;

    setSaving(true);
    setError('');

    try {
      const result = await editLeaderRecord(manager.id, editingRecord.id, {
        punch_1: editForm.punch_1 || null,
        punch_2: editForm.punch_2 || null,
        punch_3: editForm.punch_3 || null,
        punch_4: editForm.punch_4 || null,
        editedBy: manager.name,
        reason: editForm.reason || 'Correção manual',
      });

      // Update the record in the list
      setRecords(prev => prev.map(r =>
        r.id === editingRecord.id
          ? {
              ...r,
              punch_1: result.record.punch_1,
              punch_2: result.record.punch_2,
              punch_3: result.record.punch_3,
              punch_4: result.record.punch_4,
              total_worked_minutes: result.record.total_worked_minutes,
              difference_minutes: result.record.difference_minutes,
              classification: result.record.classification as DailyRecord['classification'],
            }
          : r
      ));

      closeEditModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  if (!manager) {
    return null;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Registros</h2>
        <p className="text-sm text-text-tertiary mt-1">Registros de ponto da sua equipe (clique no lápis para corrigir)</p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end gap-4">
        <DateRangePicker onRangeChange={loadRecords} />
        <div className="flex gap-2">
          <button
            onClick={() => dateRange && exportRecordsToPDF(filteredRecords, {
              title: 'Relatorio de Ponto - Equipe',
              dateRange,
              leaderName: manager.name,
            })}
            disabled={filteredRecords.length === 0 || !dateRange}
            className="btn-secondary text-sm flex items-center gap-2 h-fit disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            PDF
          </button>
          <button
            onClick={exportToExcel}
            disabled={filteredRecords.length === 0 || !dateRange}
            className="btn-secondary text-sm flex items-center gap-2 h-fit disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Excel {filteredRecords.length > 0 ? `(${filteredRecords.length})` : ''}
          </button>
        </div>
      </div>

      {/* Filters */}
      {records.length > 0 && (
        <div className="card p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs text-text-tertiary">Buscar colaborador</label>
              <input
                type="text"
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                placeholder="Digite o nome..."
                className="input"
              />
            </div>
            {searchName && (
              <div className="flex items-end">
                <button
                  onClick={() => setSearchName('')}
                  className="btn-secondary text-sm px-3 py-2"
                >
                  Limpar
                </button>
              </div>
            )}
          </div>
          {searchName && (
            <p className="text-xs text-text-tertiary mt-2">
              {filteredRecords.length} de {records.length} registros
            </p>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-text-tertiary">Carregando...</p>
      ) : (
        <RecordsTable
          records={filteredRecords}
          showEmployee
          onEdit={openEditModal}
        />
      )}

      {/* Edit Modal */}
      {editingRecord && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Editar Registro
            </h3>

            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600">
                  <strong>Colaborador:</strong> {editingRecord.employee_name}
                </p>
                <p className="text-sm text-gray-600">
                  <strong>Data:</strong> {editingRecord.date}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Entrada
                  </label>
                  <input
                    type="time"
                    value={editForm.punch_1}
                    onChange={(e) => setEditForm(prev => ({ ...prev, punch_1: e.target.value }))}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Saída Almoço
                  </label>
                  <input
                    type="time"
                    value={editForm.punch_2}
                    onChange={(e) => setEditForm(prev => ({ ...prev, punch_2: e.target.value }))}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Retorno Almoço
                  </label>
                  <input
                    type="time"
                    value={editForm.punch_3}
                    onChange={(e) => setEditForm(prev => ({ ...prev, punch_3: e.target.value }))}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Saída
                  </label>
                  <input
                    type="time"
                    value={editForm.punch_4}
                    onChange={(e) => setEditForm(prev => ({ ...prev, punch_4: e.target.value }))}
                    className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Motivo da correção
                </label>
                <textarea
                  value={editForm.reason}
                  onChange={(e) => setEditForm(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="Ex: Correção de ponto esquecido"
                  rows={2}
                  className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={closeEditModal}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
