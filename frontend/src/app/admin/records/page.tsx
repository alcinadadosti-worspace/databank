'use client';

import { useState } from 'react';
import DateRangePicker from '@/components/DateRangePicker';
import RecordsTable from '@/components/RecordsTable';
import { getAllRecords, editRecord, type DailyRecord } from '@/lib/api';
import { exportRecordsToPDF } from '@/lib/pdf-export';
import { formatDate } from '@/lib/utils';
import * as XLSX from 'xlsx';

export default function AdminRecords() {
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
      case 'aparelho_danificado': return 'Ap. Danificado';
      case 'sem_registro': return 'Sem Registro';
      default: return '-';
    }
  }

  function exportToExcel() {
    if (records.length === 0 || !dateRange) {
      alert('Nenhum registro para exportar');
      return;
    }

    const excelData = records.map(r => {
      const saturday = isSaturday(r.date);
      return {
        'Gestor': r.leader_name || 'Sem Gestor',
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

    // Sort by manager, then employee, then date
    excelData.sort((a, b) => {
      if (a['Gestor'] !== b['Gestor']) return a['Gestor'].localeCompare(b['Gestor']);
      if (a['Colaborador'] !== b['Colaborador']) return a['Colaborador'].localeCompare(b['Colaborador']);
      return a['Data'].localeCompare(b['Data']);
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);

    ws['!cols'] = [
      { wch: 20 },  // Gestor
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

    const filename = `registros_${dateRange.start}_a_${dateRange.end}.xlsx`;
    XLSX.writeFile(wb, filename);
  }

  async function loadRecords(start: string, end: string) {
    setLoading(true);
    setDateRange({ start, end });
    try {
      const data = await getAllRecords(start, end);
      setRecords(data.records);
    } catch (error) {
      console.error('Failed to load records:', error);
    } finally {
      setLoading(false);
    }
  }

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
    if (!editingRecord) return;

    setSaving(true);
    setError('');

    try {
      const result = await editRecord(editingRecord.id, {
        punch_1: editForm.punch_1 || null,
        punch_2: editForm.punch_2 || null,
        punch_3: editForm.punch_3 || null,
        punch_4: editForm.punch_4 || null,
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

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Registros</h2>
        <p className="text-sm text-text-tertiary mt-1">Todos os registros de ponto (clique no lápis para editar)</p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end gap-4">
        <DateRangePicker onRangeChange={loadRecords} />
        <div className="flex gap-2">
          <button
            onClick={() => dateRange && exportRecordsToPDF(records, {
              title: 'Relatorio de Ponto',
              dateRange,
              showLeader: true,
            })}
            disabled={records.length === 0 || !dateRange}
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
            disabled={records.length === 0 || !dateRange}
            className="btn-secondary text-sm flex items-center gap-2 h-fit disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Excel {records.length > 0 ? `(${records.length})` : ''}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-text-tertiary">Carregando...</p>
      ) : (
        <RecordsTable
          records={records}
          showEmployee
          showLeader
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
