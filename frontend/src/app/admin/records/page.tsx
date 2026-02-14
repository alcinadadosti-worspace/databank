'use client';

import { useState } from 'react';
import DateRangePicker from '@/components/DateRangePicker';
import RecordsTable from '@/components/RecordsTable';
import { getAllRecords, editRecord, type DailyRecord } from '@/lib/api';
import { exportRecordsToPDF } from '@/lib/pdf-export';

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
        {records.length > 0 && dateRange && (
          <button
            onClick={() => exportRecordsToPDF(records, {
              title: 'Relatorio de Ponto',
              dateRange,
              showLeader: true,
            })}
            className="btn-secondary text-sm flex items-center gap-2 h-fit"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
            PDF ({records.length})
          </button>
        )}
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
