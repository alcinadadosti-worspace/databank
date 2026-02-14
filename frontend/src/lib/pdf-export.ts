import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatDate } from './utils';

// ─── Types ──────────────────────────────────────────────────────

interface RecordForPDF {
  employee_name?: string;
  date: string;
  punch_1: string | null;
  punch_2: string | null;
  punch_3: string | null;
  punch_4: string | null;
  classification: string | null;
  difference_minutes: number | null;
  justification_reason?: string | null;
  leader_name?: string;
}

interface JustificationForPDF {
  employee_name: string;
  date: string;
  punch_1?: string | null;
  punch_2?: string | null;
  punch_3?: string | null;
  punch_4?: string | null;
  classification?: string | null;
  difference_minutes?: number | null;
  reason: string;
  status: string;
  reviewed_by?: string;
  manager_comment?: string | null;
}

interface PunchAdjustmentForPDF {
  employee_name: string;
  date: string;
  type: string;
  reason: string;
  status: string;
  corrected_punch_1?: string | null;
  corrected_punch_2?: string | null;
  corrected_punch_3?: string | null;
  corrected_punch_4?: string | null;
  reviewed_by?: string;
  manager_comment?: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────

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
    case 'overtime': return 'H.Extra';
    case 'normal': return 'Normal';
    case 'ajuste': return 'Ajuste';
    case 'folga': return 'Folga';
    case 'falta': return 'Falta';
    case 'aparelho_danificado': return 'Ap.Danif.';
    case 'sem_registro': return 'Sem Reg.';
    default: return '-';
  }
}

function isSaturday(dateStr: string): boolean {
  const date = new Date(dateStr + 'T12:00:00');
  return date.getDay() === 6;
}

function addHeader(doc: jsPDF, title: string, subtitle?: string) {
  const pageWidth = doc.internal.pageSize.getWidth();

  // Title
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(title, pageWidth / 2, 20, { align: 'center' });

  // Subtitle
  if (subtitle) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(subtitle, pageWidth / 2, 28, { align: 'center' });
  }

  // Date generated
  doc.setFontSize(8);
  doc.setTextColor(128);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, pageWidth - 14, 10, { align: 'right' });
  doc.setTextColor(0);
}

function addFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128);
    doc.text(
      `Pagina ${i} de ${pageCount}`,
      doc.internal.pageSize.getWidth() / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
  }
  doc.setTextColor(0);
}

// ─── Export Functions ───────────────────────────────────────────

/**
 * Export daily records to PDF
 */
export function exportRecordsToPDF(
  records: RecordForPDF[],
  options: {
    title?: string;
    dateRange?: { start: string; end: string };
    leaderName?: string;
    showLeader?: boolean;
  } = {}
): void {
  const {
    title = 'Relatorio de Ponto',
    dateRange,
    leaderName,
    showLeader = false,
  } = options;

  const doc = new jsPDF({ orientation: 'landscape' });

  let subtitle = '';
  if (dateRange) {
    subtitle = `Periodo: ${formatDate(dateRange.start)} a ${formatDate(dateRange.end)}`;
  }
  if (leaderName) {
    subtitle += subtitle ? ` | Gestor: ${leaderName}` : `Gestor: ${leaderName}`;
  }

  addHeader(doc, title, subtitle);

  // Prepare table data
  const headers = showLeader
    ? ['Colaborador', 'Gestor', 'Data', 'Entrada', 'Intervalo', 'Retorno', 'Saida', 'Status', 'Diferenca', 'Justificativa']
    : ['Colaborador', 'Data', 'Entrada', 'Intervalo', 'Retorno', 'Saida', 'Status', 'Diferenca', 'Justificativa'];

  const rows = records.map(r => {
    const saturday = isSaturday(r.date);
    const baseRow = [
      r.employee_name || '-',
      ...(showLeader ? [r.leader_name || '-'] : []),
      formatDate(r.date) + (saturday ? ' (Sab)' : ''),
      r.punch_1 || '-',
      saturday ? '-' : (r.punch_2 || '-'),
      saturday ? '-' : (r.punch_3 || '-'),
      saturday ? (r.punch_2 || '-') : (r.punch_4 || '-'),
      classificationLabel(r.classification),
      formatMinutes(r.difference_minutes),
      r.justification_reason || '-',
    ];
    return baseRow;
  });

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 35,
    styles: {
      fontSize: 8,
      cellPadding: 2,
    },
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [245, 247, 250],
    },
    columnStyles: showLeader
      ? {
          0: { cellWidth: 35 },
          1: { cellWidth: 30 },
          2: { cellWidth: 22 },
          9: { cellWidth: 40 },
        }
      : {
          0: { cellWidth: 40 },
          1: { cellWidth: 22 },
          8: { cellWidth: 45 },
        },
  });

  addFooter(doc);

  // Generate filename
  const filename = dateRange
    ? `relatorio_ponto_${dateRange.start}_a_${dateRange.end}.pdf`
    : `relatorio_ponto_${new Date().toISOString().split('T')[0]}.pdf`;

  doc.save(filename);
}

/**
 * Export justifications to PDF
 */
export function exportJustificationsToPDF(
  justifications: JustificationForPDF[],
  options: {
    title?: string;
    dateRange?: { start: string; end: string };
    status?: 'all' | 'approved' | 'rejected';
  } = {}
): void {
  const {
    title = 'Relatorio de Justificativas',
    dateRange,
    status = 'all',
  } = options;

  const doc = new jsPDF({ orientation: 'landscape' });

  let subtitle = '';
  if (dateRange) {
    subtitle = `Periodo: ${formatDate(dateRange.start)} a ${formatDate(dateRange.end)}`;
  }
  if (status !== 'all') {
    const statusLabel = status === 'approved' ? 'Aprovadas' : 'Reprovadas';
    subtitle += subtitle ? ` | ${statusLabel}` : statusLabel;
  }

  addHeader(doc, title, subtitle);

  const headers = ['Colaborador', 'Data', 'Entrada', 'Saida', 'Status', 'Diferenca', 'Motivo', 'Aprovado', 'Revisado por', 'Comentario'];

  const rows = justifications.map(j => {
    const saturday = isSaturday(j.date);
    return [
      j.employee_name,
      formatDate(j.date),
      j.punch_1 || '-',
      saturday ? (j.punch_2 || '-') : (j.punch_4 || '-'),
      classificationLabel(j.classification || null),
      formatMinutes(j.difference_minutes),
      j.reason,
      j.status === 'approved' ? 'Sim' : 'Nao',
      j.reviewed_by || '-',
      j.manager_comment || '-',
    ];
  });

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 35,
    styles: {
      fontSize: 7,
      cellPadding: 2,
    },
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [245, 247, 250],
    },
    columnStyles: {
      0: { cellWidth: 30 },
      6: { cellWidth: 35 },
      9: { cellWidth: 30 },
    },
  });

  addFooter(doc);

  const filename = dateRange
    ? `justificativas_${dateRange.start}_a_${dateRange.end}.pdf`
    : `justificativas_${new Date().toISOString().split('T')[0]}.pdf`;

  doc.save(filename);
}

/**
 * Export punch adjustments to PDF
 */
export function exportPunchAdjustmentsToPDF(
  adjustments: PunchAdjustmentForPDF[],
  options: {
    title?: string;
    dateRange?: { start: string; end: string };
  } = {}
): void {
  const {
    title = 'Relatorio de Ajustes de Ponto',
    dateRange,
  } = options;

  const doc = new jsPDF({ orientation: 'landscape' });

  let subtitle = '';
  if (dateRange) {
    subtitle = `Periodo: ${formatDate(dateRange.start)} a ${formatDate(dateRange.end)}`;
  }

  addHeader(doc, title, subtitle);

  const headers = ['Colaborador', 'Data', 'Tipo', 'Entrada', 'Intervalo', 'Retorno', 'Saida', 'Motivo', 'Status', 'Revisado por'];

  const rows = adjustments.map(a => [
    a.employee_name,
    formatDate(a.date),
    a.type === 'missing_punch' ? 'Incompleto' : 'Entrada Tardia',
    a.corrected_punch_1 || '-',
    a.corrected_punch_2 || '-',
    a.corrected_punch_3 || '-',
    a.corrected_punch_4 || '-',
    a.reason,
    a.status === 'approved' ? 'Aprovado' : a.status === 'rejected' ? 'Rejeitado' : 'Pendente',
    a.reviewed_by || '-',
  ]);

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 35,
    styles: {
      fontSize: 8,
      cellPadding: 2,
    },
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [245, 247, 250],
    },
    columnStyles: {
      0: { cellWidth: 30 },
      7: { cellWidth: 40 },
    },
  });

  addFooter(doc);

  const filename = dateRange
    ? `ajustes_ponto_${dateRange.start}_a_${dateRange.end}.pdf`
    : `ajustes_ponto_${new Date().toISOString().split('T')[0]}.pdf`;

  doc.save(filename);
}

/**
 * Export manager weekly summary to PDF
 */
export function exportWeeklySummaryToPDF(
  records: RecordForPDF[],
  options: {
    managerName: string;
    dateRange: { start: string; end: string };
  }
): void {
  const { managerName, dateRange } = options;

  const doc = new jsPDF();

  addHeader(doc, 'Resumo Semanal', `Gestor: ${managerName} | ${formatDate(dateRange.start)} a ${formatDate(dateRange.end)}`);

  // Calculate summary by employee
  const byEmployee = new Map<string, {
    lateCount: number;
    lateMinutes: number;
    overtimeCount: number;
    overtimeMinutes: number;
    totalDays: number;
  }>();

  for (const r of records) {
    const name = r.employee_name || 'Desconhecido';
    if (!byEmployee.has(name)) {
      byEmployee.set(name, { lateCount: 0, lateMinutes: 0, overtimeCount: 0, overtimeMinutes: 0, totalDays: 0 });
    }
    const emp = byEmployee.get(name)!;
    emp.totalDays++;

    if (r.classification === 'late' && r.difference_minutes) {
      emp.lateCount++;
      emp.lateMinutes += Math.abs(r.difference_minutes);
    } else if (r.classification === 'overtime' && r.difference_minutes) {
      emp.overtimeCount++;
      emp.overtimeMinutes += Math.abs(r.difference_minutes);
    }
  }

  const headers = ['Colaborador', 'Dias', 'Atrasos', 'Total Atraso', 'H.Extras', 'Total H.Extra', 'Saldo'];

  const rows = Array.from(byEmployee.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, data]) => {
      const balance = data.overtimeMinutes - data.lateMinutes;
      return [
        name,
        data.totalDays.toString(),
        data.lateCount.toString(),
        formatMinutes(-data.lateMinutes),
        data.overtimeCount.toString(),
        formatMinutes(data.overtimeMinutes),
        formatMinutes(balance),
      ];
    });

  // Add totals row
  const totals = Array.from(byEmployee.values()).reduce(
    (acc, data) => ({
      totalDays: acc.totalDays + data.totalDays,
      lateCount: acc.lateCount + data.lateCount,
      lateMinutes: acc.lateMinutes + data.lateMinutes,
      overtimeCount: acc.overtimeCount + data.overtimeCount,
      overtimeMinutes: acc.overtimeMinutes + data.overtimeMinutes,
    }),
    { totalDays: 0, lateCount: 0, lateMinutes: 0, overtimeCount: 0, overtimeMinutes: 0 }
  );

  rows.push([
    'TOTAL',
    totals.totalDays.toString(),
    totals.lateCount.toString(),
    formatMinutes(-totals.lateMinutes),
    totals.overtimeCount.toString(),
    formatMinutes(totals.overtimeMinutes),
    formatMinutes(totals.overtimeMinutes - totals.lateMinutes),
  ]);

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: 35,
    styles: {
      fontSize: 9,
      cellPadding: 3,
    },
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [245, 247, 250],
    },
    didParseCell: (data) => {
      // Style the totals row
      if (data.row.index === rows.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [220, 220, 220];
      }
    },
  });

  addFooter(doc);

  const filename = `resumo_semanal_${managerName.replace(/\s+/g, '_')}_${dateRange.start}_a_${dateRange.end}.pdf`;
  doc.save(filename);
}
