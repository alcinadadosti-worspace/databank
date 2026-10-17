import { App, LogLevel, type UploadedFile } from '@slack/bolt';
import type { WebClient } from '@slack/web-api';
import { env } from '../config/env';
import { LATE_JUSTIFICATIONS, OVERTIME_JUSTIFICATIONS, MEDICAL_CERTIFICATE_REASON, todayInSaoPaulo } from '../config/constants';
import * as queries from '../models/queries';
import { formatMinutes, classificationLabel } from '../services/hours-calculator';
import {
  CertificateFileError, downloadSlackFile, saveCertificate, countCertificatesForDay,
  MAX_CERTIFICATE_BYTES, MAX_FILES_PER_UPLOAD, MAX_FILES_PER_DAY, SLACK_CERTIFICATE_FILETYPES,
  type CertificateFlow, type CertificateUploader,
} from '../services/medical-certificates';

let slackApp: App | null = null;

// ─── Rate Limit Throttle ──────────────────────────────────────
// Slack's chat.postMessage is Tier 3 (~50 req/min globally, ~1/sec per channel).
// In test mode all messages go to the same DM, so we enforce a minimum gap
// between calls to avoid 429 errors.
let lastPostMessageTime = 0;
const POST_MESSAGE_MIN_GAP_MS = 1100; // slightly over 1 second

async function rateLimitedPostMessage(
  app: App,
  params: Parameters<App['client']['chat']['postMessage']>[0]
): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastPostMessageTime;
  if (elapsed < POST_MESSAGE_MIN_GAP_MS) {
    await new Promise(r => setTimeout(r, POST_MESSAGE_MIN_GAP_MS - elapsed));
  }
  lastPostMessageTime = Date.now();
  await app.client.chat.postMessage(params);
}

function isSlackConfigured(): boolean {
  return Boolean(env.SLACK_BOT_TOKEN && env.SLACK_BOT_TOKEN.startsWith('xoxb-'));
}

export function getSlackApp(): App | null {
  if (!isSlackConfigured()) return null;

  if (!slackApp) {
    slackApp = new App({
      token: env.SLACK_BOT_TOKEN,
      signingSecret: env.SLACK_SIGNING_SECRET,
      socketMode: true,
      appToken: env.SLACK_APP_TOKEN,
      logLevel: LogLevel.INFO,
    });

    registerInteractions(slackApp);
  }
  return slackApp;
}

export async function startSlackBot(): Promise<void> {
  const app = getSlackApp();
  if (!app) {
    console.log('[slack] Bot disabled — no valid tokens');
    return;
  }
  await app.start();
  console.log('[slack] Bot started in socket mode');
}

/**
 * Get the Slack user ID to send messages to.
 * Returns null if no real user ID is set — caller should skip sending.
 */
function getTargetUserId(realUserId: string | null): string | null {
  return realUserId || null;
}

// ─── Send Alert to Employee ────────────────────────────────────

export async function sendEmployeeAlert(
  employeeSlackId: string | null,
  employeeName: string,
  date: string,
  totalWorkedMinutes: number,
  differenceMinutes: number,
  classification: 'late' | 'overtime',
  dailyRecordId: number
): Promise<void> {
  const app = getSlackApp();
  if (!app) return;
  const targetUser = getTargetUserId(employeeSlackId);
  if (!targetUser) {
    console.log(`[slack] Skipping employee alert for ${employeeName} — no slack_id`);
    return;
  }

  const isLate = classification === 'late';
  const emoji = isLate ? ':warning:' : ':clock3:';
  const typeLabel = isLate ? 'ATRASO' : 'HORA EXTRA';
  const justifications = isLate ? LATE_JUSTIFICATIONS : OVERTIME_JUSTIFICATIONS;

  const blocks = [
    {
      type: 'header' as const,
      text: {
        type: 'plain_text' as const,
        text: `${emoji} Alerta de ${typeLabel}`,
        emoji: true,
      },
    },
    {
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: [
          `*Colaborador:* ${employeeName}`,
          `*Data:* ${date}`,
          `*Total trabalhado:* ${formatMinutes(totalWorkedMinutes)}`,
          `*${isLate ? 'Atraso' : 'Hora extra'}:* ${formatMinutes(Math.abs(differenceMinutes))}`,
          '',
          ':bell: *Seu gestor será informado sobre este registro.*',
          '',
          'Por favor, selecione uma justificativa:',
        ].join('\n'),
      },
    },
    {
      type: 'actions' as const,
      block_id: `justification_${dailyRecordId}`,
      elements: [
        ...justifications.map((reason, index) => ({
          type: 'button' as const,
          text: {
            type: 'plain_text' as const,
            text: reason,
            emoji: true,
          },
          value: JSON.stringify({
            daily_record_id: dailyRecordId,
            employee_name: employeeName,
            type: classification,
            reason,
          }),
          action_id: `justify_${index}`,
        })),
        {
          type: 'button' as const,
          text: {
            type: 'plain_text' as const,
            text: 'Outros...',
            emoji: true,
          },
          value: JSON.stringify({
            daily_record_id: dailyRecordId,
            employee_name: employeeName,
            type: classification,
          }),
          action_id: 'justify_other',
        },
      ],
    },
  ];

  try {
    await rateLimitedPostMessage(app, {
      channel: targetUser,
      text: `Alerta de ${typeLabel} para ${employeeName} - ${date}`,
      blocks,
    });

    await queries.markAlertSent(dailyRecordId);
    await queries.logAudit('SLACK_EMPLOYEE_ALERT', 'daily_record', dailyRecordId,
      `Alert sent to ${targetUser} for ${employeeName}`);

    console.log(`[slack] Employee alert sent for ${employeeName} (${date})`);
  } catch (error) {
    console.error(`[slack] Failed to send employee alert:`, error);
  }
}

// ─── Send Reinforce Alert to Employee ──────────────────────────

export async function sendReinforceAlert(
  employeeSlackId: string | null,
  employeeName: string,
  date: string,
  totalWorkedMinutes: number,
  differenceMinutes: number,
  classification: 'late' | 'overtime',
  dailyRecordId: number
): Promise<void> {
  const app = getSlackApp();
  if (!app) return;
  const targetUser = getTargetUserId(employeeSlackId);
  if (!targetUser) {
    console.log(`[slack] Skipping reinforce alert for ${employeeName} — no slack_id`);
    return;
  }

  const isLate = classification === 'late';
  const emoji = isLate ? ':warning:' : ':clock3:';
  const typeLabel = isLate ? 'ATRASO' : 'HORA EXTRA';
  const justifications = isLate ? LATE_JUSTIFICATIONS : OVERTIME_JUSTIFICATIONS;

  const blocks = [
    {
      type: 'header' as const,
      text: { type: 'plain_text' as const, text: `${emoji} Reforço: Justificativa pendente`, emoji: true },
    },
    {
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: [
          `*Colaborador:* ${employeeName}`,
          `*Data:* ${date}`,
          `*Total trabalhado:* ${formatMinutes(totalWorkedMinutes)}`,
          `*${isLate ? 'Atraso' : 'Hora extra'}:* ${formatMinutes(Math.abs(differenceMinutes))}`,
          '',
          ':loudspeaker: *Seu gestor solicita que você justifique este registro.*',
          '',
          'Por favor, selecione uma justificativa:',
        ].join('\n'),
      },
    },
    {
      type: 'actions' as const,
      block_id: `justification_${dailyRecordId}`,
      elements: [
        ...justifications.map((reason, index) => ({
          type: 'button' as const,
          text: { type: 'plain_text' as const, text: reason, emoji: true },
          value: JSON.stringify({ daily_record_id: dailyRecordId, employee_name: employeeName, type: classification, reason }),
          action_id: `justify_${index}`,
        })),
        {
          type: 'button' as const,
          text: { type: 'plain_text' as const, text: 'Outros...', emoji: true },
          value: JSON.stringify({ daily_record_id: dailyRecordId, employee_name: employeeName, type: classification }),
          action_id: 'justify_other',
        },
      ],
    },
  ];

  try {
    await rateLimitedPostMessage(app, {
      channel: targetUser,
      text: `Reforço de alerta: ${typeLabel} pendente de justificativa — ${date}`,
      blocks,
    });
    console.log(`[slack] Reinforce alert sent for ${employeeName} (${date})`);
  } catch (error) {
    console.error(`[slack] Failed to send reinforce alert:`, error);
  }
}

// ─── Send Reinforce Punch Adjustment Alert to Employee ─────────

/**
 * "Batidas registradas: 08:00 · 14:00 · 18:00". Punches fill the slots in time
 * order, so when the lunch-out is forgotten the slot names point at the wrong
 * one — the times let the employee see which punch is really missing.
 */
function registeredPunchesLine(record: { punch_1?: string | null; punch_2?: string | null; punch_3?: string | null; punch_4?: string | null }): string {
  const times = [record.punch_1, record.punch_2, record.punch_3, record.punch_4].filter(Boolean);
  return times.length > 0
    ? `*Batidas registradas:* ${times.join(' · ')}`
    : '*Batidas registradas:* nenhuma';
}

export async function sendReinforcePunchAdjustmentAlert(
  employee: { id: number; name: string; slack_id?: string | null },
  record: { id: number; punch_1?: string | null; punch_2?: string | null; punch_3?: string | null; punch_4?: string | null },
  date: string,
  missingPunches: string[]
): Promise<void> {
  const app = getSlackApp();
  if (!app) return;
  const targetUser = getTargetUserId(employee.slack_id || null);
  if (!targetUser) {
    console.log(`[slack] Skipping reinforce ajuste alert for ${employee.name} — no slack_id`);
    return;
  }

  const missingCount = missingPunches.length;

  const blocks = [
    {
      type: 'header' as const,
      text: { type: 'plain_text' as const, text: '📣 Reforço: Ajuste de ponto pendente', emoji: true },
    },
    {
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: [
          `*Colaborador:* ${employee.name}`,
          `*Data:* ${date}`,
          '',
          `Você esqueceu de bater *${missingCount} ponto(s)* no dia ${date}.`,
          registeredPunchesLine(record),
          '',
          ':loudspeaker: *Seu gestor solicita que você solicite o ajuste deste registro.*',
        ].join('\n'),
      },
    },
    {
      type: 'actions' as const,
      block_id: `reinforce_adjustment_${record.id}`,
      elements: [
        {
          type: 'button' as const,
          text: { type: 'plain_text' as const, text: '📝 Solicitar Ajuste', emoji: true },
          style: 'primary' as const,
          value: JSON.stringify({
            daily_record_id: record.id,
            employee_id: employee.id,
            employee_name: employee.name,
            date,
            missing_punches: missingPunches,
            type: 'missing_punch',
          }),
          action_id: 'request_punch_adjustment',
        },
      ],
    },
  ];

  try {
    await rateLimitedPostMessage(app, {
      channel: targetUser,
      text: `Reforço: ajuste de ponto pendente para ${date}`,
      blocks,
    });
    console.log(`[slack] Reinforce ajuste alert sent for ${employee.name} (${date})`);
  } catch (error) {
    console.error(`[slack] Failed to send reinforce ajuste alert:`, error);
  }
}

// ─── Send Daily Manager Summary ────────────────────────────────

export async function sendManagerDailySummary(
  leaderSlackId: string | null,
  leaderName: string,
  date: string,
  records: Array<{
    employee_name: string;
    classification: string;
    difference_minutes: number;
    justification_reason?: string | null;
  }>
): Promise<void> {
  const app = getSlackApp();
  if (!app) return;
  const targetUser = getTargetUserId(leaderSlackId);
  if (!targetUser) {
    console.log(`[slack] Skipping daily summary for ${leaderName} — no slack_id`);
    return;
  }

  const alertRecords = records.filter(
    r => r.classification !== 'normal' && Math.abs(r.difference_minutes) >= 11
  );

  if (alertRecords.length === 0) return;

  const lines = alertRecords.map(r => {
    const emoji = r.classification === 'late' ? ':red_circle:' : ':large_blue_circle:';
    const label = classificationLabel(r.classification);
    const mins = formatMinutes(Math.abs(r.difference_minutes));
    const justif = r.justification_reason ? ` | _${r.justification_reason}_` : ' | _Sem justificativa_';
    return `${emoji} *${r.employee_name}* — ${label}: ${mins}${justif}`;
  });

  const panelUrl = `${env.FRONTEND_URL}/manager/justifications`;

  const blocks = [
    {
      type: 'header' as const,
      text: {
        type: 'plain_text' as const,
        text: `:clipboard: Resumo do dia anterior — ${date}`,
        emoji: true,
      },
    },
    {
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: [
          `*Gestor:* ${leaderName}`,
          `*Total de alertas:* ${alertRecords.length}`,
          '',
          ...lines,
        ].join('\n'),
      },
    },
    {
      type: 'actions' as const,
      elements: [
        {
          type: 'button' as const,
          text: {
            type: 'plain_text' as const,
            text: '📋 Revisar Justificativas',
            emoji: true,
          },
          url: panelUrl,
          action_id: 'open_manager_panel',
        },
      ],
    },
  ];

  try {
    await rateLimitedPostMessage(app, {
      channel: targetUser,
      text: `Resumo de banco de horas — ${date}`,
      blocks,
    });

    console.log(`[slack] Manager summary sent to ${leaderName} for ${date}`);
  } catch (error) {
    console.error(`[slack] Failed to send manager summary:`, error);
  }
}

// ─── Send Weekly Manager Summary (Friday) ─────────────────────────

export async function sendManagerWeeklySummary(
  leaderSlackId: string | null,
  leaderName: string,
  startDate: string,
  endDate: string,
  records: Array<{
    employee_name: string;
    date: string;
    classification: string;
    difference_minutes: number;
    justification_reason?: string | null;
  }>
): Promise<void> {
  const app = getSlackApp();
  if (!app) return;
  const targetUser = getTargetUserId(leaderSlackId);
  if (!targetUser) {
    console.log(`[slack] Skipping weekly summary for ${leaderName} — no slack_id`);
    return;
  }

  // Filter only records with alerts (late/overtime with >= 11 min difference)
  const alertRecords = records.filter(
    r => r.classification !== 'normal' && Math.abs(r.difference_minutes) >= 11
  );

  if (alertRecords.length === 0) {
    console.log(`[slack] No alerts for ${leaderName} this week, skipping`);
    return;
  }

  // Group by employee
  const byEmployee = new Map<string, typeof alertRecords>();
  for (const r of alertRecords) {
    if (!byEmployee.has(r.employee_name)) {
      byEmployee.set(r.employee_name, []);
    }
    byEmployee.get(r.employee_name)!.push(r);
  }

  // Calculate totals per employee
  const employeeSummaries: string[] = [];
  for (const [empName, empRecords] of byEmployee) {
    const lateCount = empRecords.filter(r => r.classification === 'late').length;
    const overtimeCount = empRecords.filter(r => r.classification === 'overtime').length;
    const totalLateMin = empRecords
      .filter(r => r.classification === 'late')
      .reduce((sum, r) => sum + Math.abs(r.difference_minutes), 0);
    const totalOvertimeMin = empRecords
      .filter(r => r.classification === 'overtime')
      .reduce((sum, r) => sum + Math.abs(r.difference_minutes), 0);

    const parts: string[] = [];
    if (lateCount > 0) {
      parts.push(`:red_circle: ${lateCount} atraso(s) = ${formatMinutes(totalLateMin)}`);
    }
    if (overtimeCount > 0) {
      parts.push(`:large_blue_circle: ${overtimeCount} hora(s) extra = ${formatMinutes(totalOvertimeMin)}`);
    }

    employeeSummaries.push(`*${empName}*\n  ${parts.join('\n  ')}`);
  }

  const panelUrl = `${env.FRONTEND_URL}/manager/justifications`;
  const dateRange = `${formatDateBR(startDate)} a ${formatDateBR(endDate)}`;

  const blocks = [
    {
      type: 'header' as const,
      text: {
        type: 'plain_text' as const,
        text: `:calendar: Resumo Semanal — ${dateRange}`,
        emoji: true,
      },
    },
    {
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: [
          `*Gestor:* ${leaderName}`,
          `*Colaboradores com alertas:* ${byEmployee.size}`,
          `*Total de ocorrencias:* ${alertRecords.length}`,
          '',
          '---',
          '',
          ...employeeSummaries,
        ].join('\n'),
      },
    },
    {
      type: 'actions' as const,
      elements: [
        {
          type: 'button' as const,
          text: {
            type: 'plain_text' as const,
            text: '📋 Revisar Justificativas',
            emoji: true,
          },
          url: panelUrl,
          action_id: 'open_manager_panel',
        },
      ],
    },
  ];

  try {
    await rateLimitedPostMessage(app, {
      channel: targetUser,
      text: `Resumo semanal de banco de horas — ${dateRange}`,
      blocks,
    });

    console.log(`[slack] Weekly summary sent to ${leaderName} for ${dateRange}`);
  } catch (error) {
    console.error(`[slack] Failed to send weekly summary:`, error);
  }
}

function formatDateBR(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}`;
}

// ─── Send Punch Reminders ──────────────────────────────────────

export type ReminderType = 'entry' | 'lunch_return' | 'exit';

export async function sendPunchReminder(
  employeeSlackId: string | null,
  employeeName: string,
  reminderType: ReminderType,
  minutesLeft: number
): Promise<void> {
  const app = getSlackApp();
  if (!app) return;
  const targetUser = getTargetUserId(employeeSlackId);
  if (!targetUser) {
    console.log(`[slack] Skipping punch reminder for ${employeeName} — no slack_id`);
    return;
  }

  let emoji: string;
  let message: string;
  let punchName: string;

  switch (reminderType) {
    case 'entry':
      emoji = ':alarm_clock:';
      punchName = 'entrada';
      message = `Bom dia! Esta chegando a hora de bater o ponto de *entrada*.`;
      break;
    case 'lunch_return':
      emoji = ':fork_and_knife:';
      punchName = 'retorno do almoco';
      message = `Hora de voltar! Nao esqueca de bater o ponto de *retorno do almoco*.`;
      break;
    case 'exit':
      emoji = ':house:';
      punchName = 'saida';
      message = `Fim de expediente chegando! Nao esqueca de bater o ponto de *saida*.`;
      break;
  }

  const blocks = [
    {
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: [
          `${emoji} *Lembrete de Ponto*`,
          '',
          message,
          '',
          `:clock3: *Faltam ${minutesLeft} minutos* para o horario do ponto de ${punchName}.`,
        ].join('\n'),
      },
    },
  ];

  try {
    await rateLimitedPostMessage(app, {
      channel: targetUser,
      text: `Lembrete: faltam ${minutesLeft} min para bater o ponto de ${punchName}`,
      blocks,
    });

    console.log(`[slack] Punch reminder (${reminderType}) sent to ${employeeName}`);
  } catch (error) {
    console.error(`[slack] Failed to send punch reminder:`, error);
  }
}

// ─── Send Justification Review Notification ────────────────────

export async function sendJustificationReviewNotification(
  employeeSlackId: string | null,
  employeeName: string,
  date: string,
  type: 'late' | 'overtime',
  status: 'approved' | 'rejected',
  managerName: string,
  managerComment: string
): Promise<void> {
  const app = getSlackApp();
  if (!app) return;
  const targetUser = getTargetUserId(employeeSlackId);
  if (!targetUser) {
    console.log(`[slack] Skipping justification review notification for ${employeeName} — no slack_id`);
    return;
  }

  const isApproved = status === 'approved';
  const emoji = isApproved ? ':white_check_mark:' : ':x:';
  const statusLabel = isApproved ? 'APROVADA' : 'REJEITADA';
  const typeLabel = type === 'late' ? 'Atraso' : 'Hora Extra';

  const blocks = [
    {
      type: 'header' as const,
      text: {
        type: 'plain_text' as const,
        text: `${emoji} Justificativa ${statusLabel}`,
        emoji: true,
      },
    },
    {
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: [
          `*Colaborador:* ${employeeName}`,
          `*Data:* ${date}`,
          `*Tipo:* ${typeLabel}`,
          `*Status:* ${statusLabel}`,
          `*Revisado por:* ${managerName}`,
          '',
          `*Comentário do gestor:*`,
          `> ${managerComment}`,
        ].join('\n'),
      },
    },
  ];

  try {
    await rateLimitedPostMessage(app, {
      channel: targetUser,
      text: `Sua justificativa de ${typeLabel.toLowerCase()} foi ${statusLabel.toLowerCase()}`,
      blocks,
    });

    console.log(`[slack] Justification review notification sent to ${employeeName} (${status})`);
  } catch (error) {
    console.error(`[slack] Failed to send justification review notification:`, error);
  }
}

// ─── Send Punch Adjustment Review Notification ─────────────────

/** Tells the employee how the gestor ruled on their punch-adjustment request (Slack said "Aguarde a revisão"). */
export async function sendPunchAdjustmentReviewNotification(
  employeeSlackId: string | null,
  employeeName: string,
  date: string,
  status: 'approved' | 'rejected',
  managerName: string,
  managerComment: string | null,
  correctedPunches?: { punch_1: string | null; punch_2: string | null; punch_3: string | null; punch_4: string | null },
  opts: { requestedByEmployee?: boolean } = {}
): Promise<void> {
  const app = getSlackApp();
  if (!app) return;
  const targetUser = getTargetUserId(employeeSlackId);
  if (!targetUser) {
    console.log(`[slack] Skipping punch adjustment review notification for ${employeeName} — no slack_id`);
    return;
  }

  const requested = opts.requestedByEmployee !== false;
  const isApproved = status === 'approved';
  const emoji = isApproved ? ':white_check_mark:' : ':x:';
  const statusLabel = isApproved ? 'APROVADO' : 'REJEITADO';
  const header = requested ? `${emoji} Ajuste de ponto ${statusLabel}` : `${emoji} Ponto ajustado pelo gestor`;
  const summary = requested
    ? `Seu pedido de ajuste de ponto foi ${statusLabel.toLowerCase()}`
    : `Seu gestor ajustou o seu ponto de ${formatDateBR(date)}`;

  const lines = [
    `*Colaborador:* ${employeeName}`,
    `*Data:* ${formatDateBR(date)}`,
    ...(requested ? [`*Status:* ${statusLabel}`] : []),
    `*Revisado por:* ${managerName}`,
  ];
  if (isApproved && correctedPunches) {
    const labels: [keyof typeof correctedPunches, string][] = [
      ['punch_1', 'Entrada'], ['punch_2', 'Intervalo'], ['punch_3', 'Retorno'], ['punch_4', 'Saída'],
    ];
    const set = labels.filter(([k]) => correctedPunches[k]).map(([k, label]) => `${label} ${correctedPunches[k]}`);
    if (set.length > 0) lines.push(`*Horários registrados:* ${set.join(' · ')}`);
  }
  if (managerComment) lines.push('', '*Comentário do gestor:*', `> ${managerComment}`);

  try {
    await rateLimitedPostMessage(app, {
      channel: targetUser,
      text: summary,
      blocks: [
        { type: 'header' as const, text: { type: 'plain_text' as const, text: header, emoji: true } },
        { type: 'section' as const, text: { type: 'mrkdwn' as const, text: lines.join('\n') } },
      ],
    });
    console.log(`[slack] Punch adjustment review notification sent to ${employeeName} (${status})`);
  } catch (error) {
    console.error(`[slack] Failed to send punch adjustment review notification:`, error);
  }
}

// ─── Send No Record Notification (to Manager) ─────────────────

export async function sendNoRecordNotification(
  employee: { id: number; name: string; leader_id: number; leader_name?: string; leader_slack_id?: string | null },
  date: string
): Promise<void> {
  const app = getSlackApp();
  if (!app) return;
  const targetUser = getTargetUserId(employee.leader_slack_id || null);
  if (!targetUser) {
    console.log(`[slack] Skipping no-record notification for ${employee.name} — leader has no slack_id`);
    return;
  }

  const blocks = [
    {
      type: 'header' as const,
      text: {
        type: 'plain_text' as const,
        text: ':clipboard: Decisão Necessária - Sem Registro',
        emoji: true,
      },
    },
    {
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: [
          `*Colaborador:* ${employee.name}`,
          `*Data:* ${date}`,
          '',
          'Este colaborador não bateu nenhum ponto nesta data.',
          'Por favor, indique o motivo:',
        ].join('\n'),
      },
    },
    {
      type: 'actions' as const,
      block_id: `no_record_${date}_${employee.id}`,
      elements: [
        {
          type: 'button' as const,
          text: {
            type: 'plain_text' as const,
            text: '🏖️ Folga',
            emoji: true,
          },
          style: 'primary' as const,
          value: JSON.stringify({
            employee_id: employee.id,
            employee_name: employee.name,
            date: date,
            decision: 'folga',
          }),
          action_id: 'set_folga',
        },
        {
          type: 'button' as const,
          text: {
            type: 'plain_text' as const,
            text: '❌ Falta',
            emoji: true,
          },
          style: 'danger' as const,
          value: JSON.stringify({
            employee_id: employee.id,
            employee_name: employee.name,
            date: date,
            decision: 'falta',
          }),
          action_id: 'set_falta',
        },
        {
          type: 'button' as const,
          text: {
            type: 'plain_text' as const,
            text: '🔧 Aparelho Danificado',
            emoji: true,
          },
          value: JSON.stringify({
            employee_id: employee.id,
            employee_name: employee.name,
            date: date,
            decision: 'aparelho_danificado',
          }),
          action_id: 'set_aparelho_danificado',
        },
        {
          type: 'button' as const,
          text: {
            type: 'plain_text' as const,
            text: '🏥 Atestado Médico',
            emoji: true,
          },
          value: JSON.stringify({
            employee_id: employee.id,
            employee_name: employee.name,
            date: date,
            decision: 'atestado_medico',
          }),
          action_id: 'set_atestado_medico',
        },
        {
          type: 'button' as const,
          text: {
            type: 'plain_text' as const,
            text: '📝 Outros',
            emoji: true,
          },
          value: JSON.stringify({
            employee_id: employee.id,
            employee_name: employee.name,
            date: date,
          }),
          action_id: 'set_outros_no_record',
        },
      ],
    },
  ];

  try {
    await rateLimitedPostMessage(app, {
      channel: targetUser,
      text: `Decisão necessária: ${employee.name} não bateu ponto em ${date}`,
      blocks,
    });

    await queries.logAudit('SLACK_NO_RECORD_NOTIFICATION', 'employee', employee.id,
      `Sent to manager for ${employee.name} on ${date}`);

    console.log(`[slack] No record notification sent for ${employee.name} (${date})`);
  } catch (error) {
    console.error(`[slack] Failed to send no record notification:`, error);
  }
}

// ─── Send Missing Punch Notification (to Employee) ─────────────

export async function sendMissingPunchNotification(
  employee: { id: number; name: string; slack_id?: string | null },
  record: { id: number; punch_1?: string | null; punch_2?: string | null; punch_3?: string | null; punch_4?: string | null },
  date: string,
  missingPunches: string[]
): Promise<void> {
  const app = getSlackApp();
  if (!app) return;
  const targetUser = getTargetUserId(employee.slack_id || null);
  if (!targetUser) {
    console.log(`[slack] Skipping missing punch notification for ${employee.name} — no slack_id`);
    return;
  }

  const missingCount = missingPunches.length;

  const blocks = [
    {
      type: 'header' as const,
      text: {
        type: 'plain_text' as const,
        text: '⚠️ Ponto Incompleto',
        emoji: true,
      },
    },
    {
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: [
          `*Colaborador:* ${employee.name}`,
          `*Data:* ${date}`,
          '',
          `Você esqueceu de bater *${missingCount} ponto(s)* no dia ${date}.`,
          registeredPunchesLine(record),
          '',
          'Por favor, solicite um ajuste explicando o motivo.',
        ].join('\n'),
      },
    },
    {
      type: 'actions' as const,
      block_id: `missing_punch_${date}_${employee.id}`,
      elements: [
        {
          type: 'button' as const,
          text: {
            type: 'plain_text' as const,
            text: '📝 Solicitar Ajuste',
            emoji: true,
          },
          style: 'primary' as const,
          value: JSON.stringify({
            daily_record_id: record.id,
            employee_id: employee.id,
            employee_name: employee.name,
            date: date,
            missing_punches: missingPunches,
            type: 'missing_punch',
          }),
          action_id: 'request_punch_adjustment',
        },
      ],
    },
  ];

  try {
    await rateLimitedPostMessage(app, {
      channel: targetUser,
      text: `Você esqueceu de bater ${missingCount} ponto(s) no dia ${date}`,
      blocks,
    });

    await queries.logAudit('SLACK_MISSING_PUNCH_NOTIFICATION', 'daily_record', record.id,
      `Sent to ${employee.name} for ${date}`);

    console.log(`[slack] Missing punch notification sent to ${employee.name} (${date})`);
  } catch (error) {
    console.error(`[slack] Failed to send missing punch notification:`, error);
  }
}

// ─── Send Late Start Notification (to Employee) ────────────────

export async function sendLateStartNotification(
  employee: { id: number; name: string; slack_id?: string | null },
  record: { id: number; punch_1?: string | null },
  date: string
): Promise<void> {
  const app = getSlackApp();
  if (!app) return;
  const targetUser = getTargetUserId(employee.slack_id || null);
  if (!targetUser) {
    console.log(`[slack] Skipping late start notification for ${employee.name} — no slack_id`);
    return;
  }

  const blocks = [
    {
      type: 'header' as const,
      text: {
        type: 'plain_text' as const,
        text: '⚠️ Entrada Após 10:00',
        emoji: true,
      },
    },
    {
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: [
          `*Colaborador:* ${employee.name}`,
          `*Data:* ${date}`,
          `*Primeiro ponto:* ${record.punch_1}`,
          '',
          'Seu primeiro ponto foi registrado após 10:00.',
          'Por favor, solicite um ajuste explicando o motivo.',
        ].join('\n'),
      },
    },
    {
      type: 'actions' as const,
      block_id: `late_start_${date}_${employee.id}`,
      elements: [
        {
          type: 'button' as const,
          text: {
            type: 'plain_text' as const,
            text: '📝 Solicitar Ajuste',
            emoji: true,
          },
          style: 'primary' as const,
          value: JSON.stringify({
            daily_record_id: record.id,
            employee_id: employee.id,
            employee_name: employee.name,
            date: date,
            missing_punches: [],
            type: 'late_start',
          }),
          action_id: 'request_punch_adjustment',
        },
      ],
    },
  ];

  try {
    await rateLimitedPostMessage(app, {
      channel: targetUser,
      text: `Seu primeiro ponto em ${date} foi após 10:00`,
      blocks,
    });

    await queries.logAudit('SLACK_LATE_START_NOTIFICATION', 'daily_record', record.id,
      `Sent to ${employee.name} for ${date}`);

    console.log(`[slack] Late start notification sent to ${employee.name} (${date})`);
  } catch (error) {
    console.error(`[slack] Failed to send late start notification:`, error);
  }
}

/**
 * Send notification to employee when any non-last punch is after 17:00.
 */
export async function sendLatePunchNotification(
  employee: queries.EmployeeWithLeader,
  record: queries.DailyRecord,
  date: string,
  latePunch: string
): Promise<void> {
  const app = getSlackApp();
  if (!app) return;
  const targetUser = getTargetUserId(employee.slack_id || null);
  if (!targetUser) {
    console.log(`[slack] Skipping late punch notification for ${employee.name} — no slack_id`);
    return;
  }

  const blocks = [
    {
      type: 'header' as const,
      text: {
        type: 'plain_text' as const,
        text: '⚠️ Ponto Após 17:00',
        emoji: true,
      },
    },
    {
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: [
          `*Colaborador:* ${employee.name}`,
          `*Data:* ${date}`,
          `*Ponto registrado:* ${latePunch}`,
          '',
          'Foi registrado um ponto (que não é o de saída) após as 17:00.',
          'Por favor, solicite um ajuste explicando o motivo.',
        ].join('\n'),
      },
    },
    {
      type: 'actions' as const,
      block_id: `late_punch_${date}_${employee.id}`,
      elements: [
        {
          type: 'button' as const,
          text: {
            type: 'plain_text' as const,
            text: '📝 Solicitar Ajuste',
            emoji: true,
          },
          style: 'primary' as const,
          value: JSON.stringify({
            daily_record_id: record.id,
            employee_id: employee.id,
            employee_name: employee.name,
            date: date,
            missing_punches: [],
            type: 'late_punch',
          }),
          action_id: 'request_punch_adjustment',
        },
      ],
    },
  ];

  try {
    await rateLimitedPostMessage(app, {
      channel: targetUser,
      text: `Você registrou um ponto às ${latePunch} em ${date} (após 17:00)`,
      blocks,
    });

    await queries.logAudit('SLACK_LATE_PUNCH_NOTIFICATION', 'daily_record', record.id,
      `Sent to ${employee.name} for ${date} - punch at ${latePunch}`);

    console.log(`[slack] Late punch notification sent to ${employee.name} (${date}, ${latePunch})`);
  } catch (error) {
    console.error(`[slack] Failed to send late punch notification:`, error);
  }
}


/**
 * Reply when the employee clicks a justification button for a day they already
 * justified. Only say "revisado" once the gestor actually reviewed it.
 */
function alreadyJustifiedMessage(existing: { status?: string | null } | null): { plain: string; mrkdwn: string } {
  if (existing?.status === 'approved' || existing?.status === 'rejected') {
    return {
      plain: 'Este registro já foi revisado pelo seu gestor.',
      mrkdwn: ':information_source: *Este registro já foi revisado pelo seu gestor. Nenhuma ação necessária.*',
    };
  }
  return {
    plain: 'Você já enviou uma justificativa para este dia.',
    mrkdwn: ':information_source: *Você já enviou uma justificativa para este dia.* Ela está aguardando a revisão do seu gestor.',
  };
}

// ─── Medical Certificate (atestado) Upload ─────────────────────

const MEDICAL_CERTIFICATE_MODAL = 'medical_certificate_modal';
const CERT_FILES_BLOCK = 'certificate_files_block';
const CERT_FILES_INPUT = 'certificate_files_input';
const CERT_NOTE_BLOCK = 'certificate_note_block';
const CERT_NOTE_INPUT = 'certificate_note_input';

/**
 * What an atestado modal is for:
 * - justify: the late alert's "Atestado médico" button — registers the
 *   justification, file optional (it can come later);
 * - decide: the gestor's "🏥 Atestado Médico" for a day without punches — marks
 *   the day, file optional (the employee gets no message);
 * - attach: files for a day already marked (sent later by employee or gestor).
 */
interface CertificateTarget {
  mode: 'justify' | 'decide' | 'attach';
  flow: CertificateFlow;
  /** Who fills the modal: changes the texts, and the gestor's uploads are flagged */
  by?: CertificateUploader;
  daily_record_id: number | null;
  employee_id: number | null;
  employee_name: string;
  date: string | null;
  type?: 'late' | 'overtime';
}

interface CertificateModalMeta extends CertificateTarget {
  message_ts?: string;
  channel_id?: string;
}

interface CertificateFilesOutcome {
  saved: number;
  /** Files of that employee/day after this upload */
  total: number;
  failed: { name: string; reason: string }[];
}

function formatFullDateBR(date: string): string {
  const [y, m, d] = date.split('-');
  return d && m && y ? `${d}/${m}/${y}` : date;
}

function certificateButton(target: CertificateTarget, hasFiles: boolean) {
  const byManager = target.by === 'manager';
  const text = byManager
    ? (hasFiles ? '📎 Anexar mais um arquivo' : '📎 Anexar atestado')
    : (hasFiles ? '📎 Enviar mais um arquivo' : '📎 Enviar atestado');
  return {
    type: 'button' as const,
    text: { type: 'plain_text' as const, text, emoji: true },
    value: JSON.stringify(target),
    action_id: 'upload_medical_certificate',
  };
}

function certificateFilesInputBlock(optional: boolean, label: string, hint: string) {
  return {
    type: 'input',
    block_id: CERT_FILES_BLOCK,
    optional,
    label: { type: 'plain_text', text: label },
    hint: { type: 'plain_text', text: hint },
    element: {
      type: 'file_input',
      action_id: CERT_FILES_INPUT,
      filetypes: SLACK_CERTIFICATE_FILETYPES,
      max_files: MAX_FILES_PER_UPLOAD,
    },
  };
}

function submittedCertificateFiles(view: { state: { values: Record<string, Record<string, { files?: UploadedFile[] }>> } }): UploadedFile[] {
  return view.state.values[CERT_FILES_BLOCK]?.[CERT_FILES_INPUT]?.files ?? [];
}

/** Error to show on the modal's file field before ack, or null when the sizes are fine. */
function certificateSizeError(files: UploadedFile[]): Record<string, string> | null {
  const tooBig = files.find(f => (f.size ?? 0) > MAX_CERTIFICATE_BYTES);
  return tooBig ? { [CERT_FILES_BLOCK]: `"${tooBig.name}" passa de 10 MB.` } : null;
}

/**
 * views.open for a modal with a file field. The extension filter is only a
 * convenience (bytes are checked on save): if Slack rejects it, open without it.
 */
async function openModalWithFileInput(client: WebClient, triggerId: string, view: any): Promise<void> {
  try {
    await client.views.open({ trigger_id: triggerId, view });
  } catch (error) {
    if ((error as { data?: { error?: string } }).data?.error !== 'invalid_arguments') throw error;
    console.warn('[slack] views.open rejected the file filter, retrying without it:', (error as any).data);
    for (const block of view.blocks) {
      if (block.element?.type === 'file_input') delete block.element.filetypes;
    }
    await client.views.open({ trigger_id: triggerId, view });
  }
}

async function openCertificateModal(client: WebClient, triggerId: string, meta: CertificateModalMeta): Promise<void> {
  const limits = `Até ${MAX_FILES_PER_UPLOAD} arquivos (ex.: frente e verso), 10 MB cada.`;
  const intro: string[] = [`*Colaborador:* ${meta.employee_name}`];
  if (meta.date) intro.push(`*Data:* ${formatFullDateBR(meta.date)}`);
  let fileBlock;
  if (meta.mode === 'decide') {
    intro.push('', 'Ao confirmar, o dia fica marcado como 🏥 *Atestado Médico*.');
    fileBlock = certificateFilesInputBlock(true, 'Foto ou PDF do atestado (opcional)',
      `${limits} Sem arquivo, o dia só fica marcado como atestado; dá para anexar depois.`);
  } else if (meta.mode === 'justify') {
    fileBlock = certificateFilesInputBlock(true, 'Foto ou PDF do atestado',
      `${limits} Ainda não está com o atestado? Envie sem arquivo e anexe depois pelo botão "Enviar atestado".`);
  } else {
    fileBlock = certificateFilesInputBlock(false, 'Foto ou PDF do atestado', limits);
  }

  const blocks: any[] = [
    { type: 'section', text: { type: 'mrkdwn', text: intro.join('\n') } },
    fileBlock,
  ];
  if (meta.mode === 'justify') {
    blocks.push({
      type: 'input',
      block_id: CERT_NOTE_BLOCK,
      optional: true,
      label: { type: 'plain_text', text: 'Observação' },
      element: { type: 'plain_text_input', action_id: CERT_NOTE_INPUT, multiline: true, max_length: 500 },
    });
  }

  await openModalWithFileInput(client, triggerId, {
    type: 'modal',
    callback_id: MEDICAL_CERTIFICATE_MODAL,
    private_metadata: JSON.stringify(meta),
    title: { type: 'plain_text', text: 'Atestado médico' },
    submit: { type: 'plain_text', text: meta.mode === 'decide' ? 'Confirmar' : 'Enviar' },
    close: { type: 'plain_text', text: 'Cancelar' },
    blocks,
  });
}

/** Downloads the modal's files from Slack and stores them (capped per employee/day). */
async function saveSlackCertificateFiles(
  client: WebClient,
  files: UploadedFile[],
  ctx: {
    employeeId: number; employeeName: string; date: string; dailyRecordId: number | null;
    justificationId: number | null; flow: CertificateFlow; uploadedBy: CertificateUploader; slackUserId: string;
  }
): Promise<CertificateFilesOutcome> {
  const already = await countCertificatesForDay(ctx.employeeId, ctx.date, ctx.flow === 'test');
  const room = Math.max(0, MAX_FILES_PER_DAY - already);
  let saved = 0;
  const failed: CertificateFilesOutcome['failed'] = [];

  for (const [i, file] of files.entries()) {
    if (i >= room) {
      failed.push({ name: file.name, reason: `o limite é de ${MAX_FILES_PER_DAY} arquivos por dia` });
      continue;
    }
    try {
      const url = file.url_private_download
        || ((await client.files.info({ file: file.id })).file as { url_private_download?: string } | undefined)?.url_private_download;
      if (!url) throw new CertificateFileError('o Slack não informou o link do arquivo');
      const buffer = await downloadSlackFile(url, env.SLACK_BOT_TOKEN);
      await saveCertificate({
        buffer, originalName: file.name, employeeId: ctx.employeeId, date: ctx.date,
        dailyRecordId: ctx.dailyRecordId, justificationId: ctx.justificationId, flow: ctx.flow,
        uploadedBy: ctx.uploadedBy, uploadedBySlackId: ctx.slackUserId, slackFileId: file.id,
      });
      saved++;
    } catch (error) {
      console.error(`[slack] Medical certificate file ${file.id} (${file.name}) failed:`, error);
      failed.push({ name: file.name, reason: error instanceof CertificateFileError ? error.message : 'erro ao salvar' });
    }
  }

  if (saved > 0) {
    await queries.logAudit('MEDICAL_CERTIFICATE_UPLOADED', 'employee', ctx.employeeId,
      `${ctx.employeeName}: ${saved} file(s) for ${ctx.date} (${ctx.flow}, by ${ctx.uploadedBy})`);
  }
  return { saved, total: already + saved, failed };
}

function certificateOutcomeLines(outcome: CertificateFilesOutcome, by: CertificateUploader): string[] {
  const lines: string[] = [];
  if (outcome.total > 0) {
    const count = `${outcome.total} arquivo${outcome.total > 1 ? 's' : ''}`;
    lines.push(by === 'manager'
      ? `:paperclip: *Atestado anexado* (${count}). O RH já pode ver.`
      : `:paperclip: *Atestado recebido* (${count}). O RH e o seu gestor já podem ver.`);
  } else {
    lines.push(by === 'manager'
      ? ':hourglass_flowing_sand: *Sem atestado anexado.* Se o documento chegar depois, use *Anexar atestado*.'
      : ':hourglass_flowing_sand: *Atestado ainda não enviado.* Quando estiver com ele, toque em *Enviar atestado*.');
  }
  for (const f of outcome.failed) lines.push(`:x: Não consegui salvar *${f.name}*: ${f.reason}.`);
  return lines;
}

/** Shows the outcome where the user clicked (or as a new DM when that message is unknown). */
async function showCertificateMessage(
  client: WebClient, meta: CertificateModalMeta, slackUserId: string, text: string, blocks: any[]
): Promise<void> {
  if (meta.message_ts && meta.channel_id) {
    await client.chat.update({ channel: meta.channel_id, ts: meta.message_ts, text, blocks });
  } else {
    await client.chat.postMessage({ channel: slackUserId, text, blocks });
  }
}

/** The gestor's "🏥 Atestado Médico" decision for a day without punches. Returns the record id. */
async function markDayAsAtestado(employeeId: number, employeeName: string, date: string): Promise<number | null> {
  const record = await queries.getDailyRecord(employeeId, date);
  if (record) {
    await queries.updateRecordClassification(record.id, 'atestado_medico');
    await queries.logAudit('MANAGER_SET_ATESTADO_MEDICO', 'daily_record', record.id,
      `${employeeName} on ${date} marked as atestado medico`);
    return record.id;
  }
  await queries.upsertDailyRecord(employeeId, date, null, null, null, null, null, null, 'atestado_medico');
  await queries.logAudit('MANAGER_SET_ATESTADO_MEDICO', 'employee', employeeId,
    `${employeeName} on ${date} marked as atestado medico (no prior record)`);
  return (await queries.getDailyRecord(employeeId, date))?.id ?? null;
}

/**
 * Handles a submitted atestado modal: justify registers the "Atestado médico"
 * justification and decide marks the no-punch day (both work without a file),
 * then the files are stored and the message updated.
 */
async function handleCertificateSubmission(
  client: WebClient, meta: CertificateModalMeta, files: UploadedFile[], note: string, slackUserId: string
): Promise<void> {
  const by = meta.by ?? 'employee';
  const isTest = meta.flow === 'test';
  let employeeId = meta.employee_id;
  let date = meta.date;
  let dailyRecordId = meta.daily_record_id;
  let justificationId: number | null = null;

  const showError = (text: string) => showCertificateMessage(client, meta, slackUserId, 'Não foi possível registrar o atestado', [
    { type: 'section', text: { type: 'mrkdwn', text } },
  ]);

  if (isTest) {
    employeeId = 0;
    date = date ?? todayInSaoPaulo();
  } else if (meta.mode === 'justify') {
    const record = dailyRecordId ? await queries.getDailyRecordById(dailyRecordId) : undefined;
    if (!record) {
      await showError(':x: *Não encontrei o registro deste dia.* Fale com o RH para enviar o atestado.');
      return;
    }
    employeeId = record.employee_id;
    date = record.date;
    dailyRecordId = record.id;

    const existing = await queries.getJustificationByRecordId(record.id);
    if (existing && existing.reason !== MEDICAL_CERTIFICATE_REASON) {
      const msg = alreadyJustifiedMessage(existing);
      await showCertificateMessage(client, meta, slackUserId, msg.plain, [{ type: 'section', text: { type: 'mrkdwn', text: msg.mrkdwn } }]);
      return;
    }
    if (existing) {
      justificationId = existing.id;
    } else {
      justificationId = await queries.insertJustification(record.id, employeeId, meta.type ?? 'late', MEDICAL_CERTIFICATE_REASON, note || undefined);
      await queries.logAudit('JUSTIFICATION_VIA_SLACK', 'justification', justificationId,
        `${meta.employee_name}: ${meta.type ?? 'late'} - ${MEDICAL_CERTIFICATE_REASON}${note ? `: ${note}` : ''}`);
    }
  } else if (meta.mode === 'decide') {
    if (employeeId === null || !date) {
      await showError(':x: *Não consegui identificar o colaborador ou o dia.* Fale com o RH.');
      return;
    }
    dailyRecordId = await markDayAsAtestado(employeeId, meta.employee_name, date);
  } else if (dailyRecordId) {
    const existing = await queries.getJustificationByRecordId(dailyRecordId);
    if (existing?.reason === MEDICAL_CERTIFICATE_REASON) justificationId = existing.id;
  }

  if (employeeId === null || !date) {
    await showError(':x: *Não consegui identificar o dia deste atestado.* Fale com o RH.');
    return;
  }

  const outcome = await saveSlackCertificateFiles(client, files, {
    employeeId, employeeName: meta.employee_name, date, dailyRecordId, justificationId,
    flow: meta.flow, uploadedBy: by, slackUserId,
  });

  let lines: string[];
  let text: string;
  if (meta.mode === 'justify') {
    lines = [
      ':white_check_mark: *Justificativa registrada com sucesso!*',
      '',
      `*Colaborador:* ${meta.employee_name}`,
      `*Tipo:* ${meta.type === 'overtime' ? 'Hora Extra' : 'Atraso'}`,
      `*Motivo:* ${MEDICAL_CERTIFICATE_REASON}`,
      ...(note ? [`*Observação:* ${note}`] : []),
    ];
    text = `Justificativa registrada: ${MEDICAL_CERTIFICATE_REASON}`;
  } else if (meta.mode === 'decide') {
    lines = [
      ':white_check_mark: *Decisão registrada!*',
      '',
      `*Colaborador:* ${meta.employee_name}`,
      `*Data:* ${date}`,
      '*Status:* 🏥 Atestado Médico',
    ];
    text = `Marcado como Atestado Médico: ${meta.employee_name} - ${date}`;
  } else {
    lines = [`:hospital: *Atestado médico — ${formatFullDateBR(date)}*`, `*Colaborador:* ${meta.employee_name}`];
    text = outcome.total > 0 ? 'Atestado recebido' : 'Atestado médico';
  }
  lines.push('', ...certificateOutcomeLines(outcome, by));
  if (isTest) lines.push('', '_Teste: nenhum registro de ponto foi alterado._');

  const blocks: any[] = [{ type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } }];
  if (outcome.total < MAX_FILES_PER_DAY) {
    const next: CertificateTarget = {
      mode: 'attach', flow: meta.flow, by, daily_record_id: dailyRecordId, employee_id: employeeId,
      employee_name: meta.employee_name, date, type: meta.type,
    };
    blocks.push({ type: 'actions', elements: [certificateButton(next, outcome.total > 0)] });
  }
  await showCertificateMessage(client, meta, slackUserId, text, blocks);
}

// ─── Register Interactive Handlers ─────────────────────────────

function registerInteractions(app: App): void {
  // Handle justification button clicks
  for (let i = 0; i < Math.max(LATE_JUSTIFICATIONS.length, OVERTIME_JUSTIFICATIONS.length); i++) {
    app.action(`justify_${i}`, async ({ ack, body, action, client }) => {
      await ack();

      try {
        const payload = JSON.parse((action as any).value);
        const { daily_record_id, employee_name, type, reason } = payload;

        const channel = (body as any).channel?.id || (body as any).user?.id;
        const ts = (body as any).message?.ts;

        // "Atestado médico" opens the modal to attach the certificate; the
        // justification is registered on submit (with or without the file)
        if (reason === MEDICAL_CERTIFICATE_REASON) {
          await openCertificateModal(client, (body as any).trigger_id, {
            mode: 'justify', flow: 'late', daily_record_id, employee_id: null,
            employee_name, date: null, type, message_ts: ts, channel_id: channel,
          });
          return;
        }

        // Guard: check if already reviewed by manager
        const existing = await queries.getJustificationByRecordId(daily_record_id);
        if (existing) {
          await client.chat.update({
            channel,
            ts,
            text: alreadyJustifiedMessage(existing).plain,
            blocks: [{
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: alreadyJustifiedMessage(existing).mrkdwn,
              },
            }],
          });
          return;
        }

        // Find the employee by record ID
        const record = await queries.getDailyRecordById(daily_record_id);
        const employeeId = record?.employee_id || null;

        if (employeeId) {
          await queries.insertJustification(daily_record_id, employeeId, type, reason);
          await queries.logAudit('JUSTIFICATION_VIA_SLACK', 'justification', undefined,
            `${employee_name}: ${type} - ${reason}`);
        }

        // Update the message to confirm
        await client.chat.update({
          channel,
          ts,
          text: `Justificativa registrada: ${reason}`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: [
                  `:white_check_mark: *Justificativa registrada com sucesso!*`,
                  '',
                  `*Colaborador:* ${employee_name}`,
                  `*Tipo:* ${type === 'late' ? 'Atraso' : 'Hora Extra'}`,
                  `*Motivo:* ${reason}`,
                ].join('\n'),
              },
            },
          ],
        });
      } catch (error) {
        console.error('[slack] Error handling justification:', error);
      }
    });
  }

  // Handle "Outros" button - opens modal for custom justification
  app.action('justify_other', async ({ ack, body, action, client }) => {
    await ack();

    try {
      const payload = JSON.parse((action as any).value);
      const { daily_record_id, employee_name, type } = payload;

      // Store message info for later update
      const messageTs = (body as any).message?.ts;
      const channelId = (body as any).channel?.id || (body as any).user?.id;

      await client.views.open({
        trigger_id: (body as any).trigger_id,
        view: {
          type: 'modal',
          callback_id: 'custom_justification_modal',
          private_metadata: JSON.stringify({
            daily_record_id,
            employee_name,
            type,
            message_ts: messageTs,
            channel_id: channelId,
          }),
          title: {
            type: 'plain_text',
            text: 'Justificativa',
          },
          submit: {
            type: 'plain_text',
            text: 'Enviar',
          },
          close: {
            type: 'plain_text',
            text: 'Cancelar',
          },
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Colaborador:* ${employee_name}\n*Tipo:* ${type === 'late' ? 'Atraso' : 'Hora Extra'}`,
              },
            },
            {
              type: 'input',
              block_id: 'custom_reason_block',
              element: {
                type: 'plain_text_input',
                action_id: 'custom_reason_input',
                multiline: true,
                placeholder: {
                  type: 'plain_text',
                  text: 'Descreva o motivo do atraso ou hora extra...',
                },
                max_length: 500,
              },
              label: {
                type: 'plain_text',
                text: 'Motivo',
              },
            },
          ],
        },
      });
    } catch (error) {
      console.error('[slack] Error opening custom justification modal:', error);
    }
  });

  // Handle custom justification modal submission
  app.view('custom_justification_modal', async ({ ack, body, view, client }) => {
    await ack();

    try {
      const metadata = JSON.parse(view.private_metadata);
      const { daily_record_id, employee_name, type, message_ts, channel_id } = metadata;

      const customReason = view.state.values.custom_reason_block.custom_reason_input.value || '';

      // Guard: check if already reviewed by manager
      const existingJustif = await queries.getJustificationByRecordId(daily_record_id);
      if (existingJustif) {
        if (message_ts && channel_id) {
          await client.chat.update({
            channel: channel_id,
            ts: message_ts,
            text: alreadyJustifiedMessage(existingJustif).plain,
            blocks: [{
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: alreadyJustifiedMessage(existingJustif).mrkdwn,
              },
            }],
          });
        }
        return;
      }

      // Find the employee by record ID
      const record = await queries.getDailyRecordById(daily_record_id);
      const employeeId = record?.employee_id || null;

      if (employeeId && customReason.trim()) {
        await queries.insertJustification(daily_record_id, employeeId, type, 'Outros', customReason);
        await queries.logAudit('JUSTIFICATION_VIA_SLACK', 'justification', undefined,
          `${employee_name}: ${type} - Outros: ${customReason}`);
      }

      // Update the original message
      if (message_ts && channel_id) {
        await client.chat.update({
          channel: channel_id,
          ts: message_ts,
          text: `Justificativa registrada: Outros`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: [
                  `:white_check_mark: *Justificativa registrada com sucesso!*`,
                  '',
                  `*Colaborador:* ${employee_name}`,
                  `*Tipo:* ${type === 'late' ? 'Atraso' : 'Hora Extra'}`,
                  `*Motivo:* Outros`,
                  `*Descricao:* ${customReason}`,
                ].join('\n'),
              },
            },
          ],
        });
      }

      console.log(`[slack] Custom justification submitted for ${employee_name}`);
    } catch (error) {
      console.error('[slack] Error handling custom justification:', error);
    }
  });

  // "Enviar atestado" — file for a day already marked as atestado (or the RH test)
  app.action('upload_medical_certificate', async ({ ack, body, action, client }) => {
    await ack();

    try {
      const target = JSON.parse((action as any).value) as CertificateTarget;
      await openCertificateModal(client, (body as any).trigger_id, {
        ...target,
        message_ts: (body as any).message?.ts,
        channel_id: (body as any).channel?.id || (body as any).user?.id,
      });
    } catch (error) {
      console.error('[slack] Error opening medical certificate modal:', error);
    }
  });

  app.view(MEDICAL_CERTIFICATE_MODAL, async ({ ack, body, view, client }) => {
    const meta = JSON.parse(view.private_metadata) as CertificateModalMeta;
    const files = submittedCertificateFiles(view);

    const sizeError = certificateSizeError(files);
    if (sizeError) {
      await ack({ response_action: 'errors', errors: sizeError });
      return;
    }
    if (meta.mode === 'attach' && files.length === 0) {
      await ack({ response_action: 'errors', errors: { [CERT_FILES_BLOCK]: 'Anexe a foto ou o PDF do atestado.' } });
      return;
    }
    // Downloading + storing can take longer than Slack's 3s, so close the modal first
    await ack();

    const note = (view.state.values[CERT_NOTE_BLOCK]?.[CERT_NOTE_INPUT]?.value || '').trim();
    const slackUserId = body.user.id;
    try {
      await handleCertificateSubmission(client, meta, files, note, slackUserId);
      console.log(`[slack] Medical certificate ${meta.mode} for ${meta.employee_name} (${meta.flow}, by ${meta.by ?? 'employee'}, ${files.length} file(s))`);
    } catch (error) {
      console.error('[slack] Error handling medical certificate:', error);
      await client.chat.postMessage({
        channel: slackUserId,
        text: ':x: Não consegui registrar o atestado. Tente de novo pelo botão ou fale com o RH.',
      }).catch(() => undefined);
    }
  });

  // ─── Handle Manager Folga/Falta Decisions ───────────────────────

  app.action('set_folga', async ({ ack, body, action, client }) => {
    await ack();

    try {
      const payload = JSON.parse((action as any).value);
      const { employee_id, employee_name, date } = payload;

      // Find the record for this employee/date (may not exist if employee never punched)
      const record = await queries.getDailyRecord(employee_id, date);
      if (record) {
        await queries.updateRecordClassification(record.id, 'folga');
        await queries.logAudit('MANAGER_SET_FOLGA', 'daily_record', record.id,
          `${employee_name} on ${date} marked as folga`);
      } else {
        await queries.upsertDailyRecord(employee_id, date, null, null, null, null, null, null, 'folga');
        await queries.logAudit('MANAGER_SET_FOLGA', 'employee', employee_id,
          `${employee_name} on ${date} marked as folga (no prior record)`);
      }

      // Also register it as a real integral folga, so it shows in the Folgas tabs
      // and in presence (before, it only changed the record's label)
      const employee = await queries.getEmployeeById(employee_id);
      const alreadyHasFolga = (await queries.getEmployeesOnFolga(date)).has(employee_id);
      if (employee && !alreadyHasFolga) {
        const clicker = await queries.getLeaderBySlackId((body as any).user?.id ?? '');
        const isSaturday = new Date(date + 'T12:00:00Z').getUTCDay() === 6;
        await queries.insertFolga(
          employee_id, employee.leader_id, date, 'integral', isSaturday ? 4 : 8,
          'Registrada pelo gestor no Slack (dia sem registro de ponto)',
          clicker?.name ?? 'Gestor (Slack)'
        );
      }

      // Update the message to confirm
      await client.chat.update({
        channel: (body as any).channel?.id || (body as any).user?.id,
        ts: (body as any).message?.ts,
        text: `Marcado como Folga: ${employee_name} - ${date}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: [
                `:white_check_mark: *Decisão registrada!*`,
                '',
                `*Colaborador:* ${employee_name}`,
                `*Data:* ${date}`,
                `*Status:* 🏖️ Folga`,
              ].join('\n'),
            },
          },
        ],
      });

      console.log(`[slack] Manager set folga for ${employee_name} (${date})`);
    } catch (error) {
      console.error('[slack] Error setting folga:', error);
    }
  });

  app.action('set_falta', async ({ ack, body, action, client }) => {
    await ack();

    try {
      const payload = JSON.parse((action as any).value);
      const { employee_id, employee_name, date } = payload;

      // Find the record for this employee/date (may not exist if employee never punched)
      const record = await queries.getDailyRecord(employee_id, date);
      if (record) {
        await queries.updateRecordClassification(record.id, 'falta');
        await queries.logAudit('MANAGER_SET_FALTA', 'daily_record', record.id,
          `${employee_name} on ${date} marked as falta`);
      } else {
        await queries.upsertDailyRecord(employee_id, date, null, null, null, null, null, null, 'falta');
        await queries.logAudit('MANAGER_SET_FALTA', 'employee', employee_id,
          `${employee_name} on ${date} marked as falta (no prior record)`);
      }

      // Update the message to confirm
      await client.chat.update({
        channel: (body as any).channel?.id || (body as any).user?.id,
        ts: (body as any).message?.ts,
        text: `Marcado como Falta: ${employee_name} - ${date}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: [
                `:white_check_mark: *Decisão registrada!*`,
                '',
                `*Colaborador:* ${employee_name}`,
                `*Data:* ${date}`,
                `*Status:* ❌ Falta`,
              ].join('\n'),
            },
          },
        ],
      });

      console.log(`[slack] Manager set falta for ${employee_name} (${date})`);
    } catch (error) {
      console.error('[slack] Error setting falta:', error);
    }
  });

  app.action('set_aparelho_danificado', async ({ ack, body, action, client }) => {
    await ack();

    try {
      const payload = JSON.parse((action as any).value);
      const { employee_id, employee_name, date } = payload;

      // Find the record for this employee/date (may not exist if employee never punched)
      const record = await queries.getDailyRecord(employee_id, date);
      if (record) {
        await queries.updateRecordClassification(record.id, 'aparelho_danificado');
        await queries.logAudit('MANAGER_SET_APARELHO_DANIFICADO', 'daily_record', record.id,
          `${employee_name} on ${date} marked as aparelho danificado`);
      } else {
        await queries.upsertDailyRecord(employee_id, date, null, null, null, null, null, null, 'aparelho_danificado');
        await queries.logAudit('MANAGER_SET_APARELHO_DANIFICADO', 'employee', employee_id,
          `${employee_name} on ${date} marked as aparelho danificado (no prior record)`);
      }

      // Update the message to confirm
      await client.chat.update({
        channel: (body as any).channel?.id || (body as any).user?.id,
        ts: (body as any).message?.ts,
        text: `Marcado como Aparelho Danificado: ${employee_name} - ${date}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: [
                `:white_check_mark: *Decisão registrada!*`,
                '',
                `*Colaborador:* ${employee_name}`,
                `*Data:* ${date}`,
                `*Status:* 🔧 Aparelho Danificado`,
              ].join('\n'),
            },
          },
        ],
      });

      console.log(`[slack] Manager set aparelho_danificado for ${employee_name} (${date})`);
    } catch (error) {
      console.error('[slack] Error setting aparelho_danificado:', error);
    }
  });

  // Gestor's "🏥 Atestado Médico": a modal to confirm, with the certificate file
  // optional (the day is marked on submit; the employee gets no message)
  app.action('set_atestado_medico', async ({ ack, body, action, client }) => {
    await ack();

    try {
      const payload = JSON.parse((action as any).value);
      const { employee_id, employee_name, date } = payload;

      await openCertificateModal(client, (body as any).trigger_id, {
        mode: 'decide', flow: 'full_day', by: 'manager', daily_record_id: null,
        employee_id, employee_name, date,
        message_ts: (body as any).message?.ts,
        channel_id: (body as any).channel?.id || (body as any).user?.id,
      });
    } catch (error) {
      console.error('[slack] Error opening atestado_medico modal:', error);
    }
  });

  // Handle "Outros" button for no-record — opens modal for manager to type a reason
  app.action('set_outros_no_record', async ({ ack, body, action, client }) => {
    await ack();

    try {
      const payload = JSON.parse((action as any).value);
      const { employee_id, employee_name, date } = payload;

      const messageTs = (body as any).message?.ts;
      const channelId = (body as any).channel?.id || (body as any).user?.id;

      await client.views.open({
        trigger_id: (body as any).trigger_id,
        view: {
          type: 'modal',
          callback_id: 'no_record_outros_modal',
          private_metadata: JSON.stringify({
            employee_id,
            employee_name,
            date,
            message_ts: messageTs,
            channel_id: channelId,
          }),
          title: {
            type: 'plain_text',
            text: 'Outros',
          },
          submit: {
            type: 'plain_text',
            text: 'Registrar',
          },
          close: {
            type: 'plain_text',
            text: 'Cancelar',
          },
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Colaborador:* ${employee_name}\n*Data:* ${date}`,
              },
            },
            {
              type: 'input',
              block_id: 'outros_reason_block',
              element: {
                type: 'plain_text_input',
                action_id: 'outros_reason_input',
                multiline: true,
                placeholder: {
                  type: 'plain_text',
                  text: 'Descreva o motivo da ausência...',
                },
                max_length: 500,
              },
              label: {
                type: 'plain_text',
                text: 'Motivo da ausência',
              },
            },
          ],
        },
      });
    } catch (error) {
      console.error('[slack] Error opening outros no-record modal:', error);
    }
  });

  // Handle "Outros" modal submission
  app.view('no_record_outros_modal', async ({ ack, body, view, client }) => {
    await ack();

    try {
      const metadata = JSON.parse(view.private_metadata);
      const { employee_id, employee_name, date, message_ts, channel_id } = metadata;

      const reason = view.state.values.outros_reason_block.outros_reason_input.value || '';

      const record = await queries.getDailyRecord(employee_id, date);
      if (record) {
        await queries.updateRecordClassificationWithNote(record.id, 'outros', reason.trim());
        await queries.logAudit('MANAGER_SET_OUTROS', 'daily_record', record.id,
          `${employee_name} on ${date}: ${reason}`);
      } else {
        await queries.upsertDailyRecord(employee_id, date, null, null, null, null, null, null, 'outros');
        const newRecord = await queries.getDailyRecord(employee_id, date);
        if (newRecord) {
          await queries.updateRecordClassificationWithNote(newRecord.id, 'outros', reason.trim());
        }
        await queries.logAudit('MANAGER_SET_OUTROS', 'employee', employee_id,
          `${employee_name} on ${date}: ${reason} (no prior record)`);
      }

      if (message_ts && channel_id) {
        await client.chat.update({
          channel: channel_id,
          ts: message_ts,
          text: `Marcado como Outros: ${employee_name} - ${date}`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: [
                  `:white_check_mark: *Decisão registrada!*`,
                  '',
                  `*Colaborador:* ${employee_name}`,
                  `*Data:* ${date}`,
                  `*Status:* 📝 Outros`,
                  `*Motivo:* ${reason}`,
                ].join('\n'),
              },
            },
          ],
        });
      }

      console.log(`[slack] Manager set outros for ${employee_name} (${date}): ${reason}`);
    } catch (error) {
      console.error('[slack] Error handling no_record_outros_modal:', error);
    }
  });

  // ─── Handle Punch Adjustment Request ────────────────────────────

  app.action('request_punch_adjustment', async ({ ack, body, action, client }) => {
    await ack();

    try {
      const payload = JSON.parse((action as any).value);
      const { daily_record_id, employee_id, employee_name, date, missing_punches, type } = payload;

      const messageTs = (body as any).message?.ts;
      const channelId = (body as any).channel?.id || (body as any).user?.id;

      const missingText = missing_punches.length > 0
        ? `*Pontos faltando:* ${missing_punches.join(', ')}`
        : type === 'late_punch'
          ? '*Tipo:* Ponto após 17:00'
          : '*Tipo:* Entrada após 10:00';

      await openModalWithFileInput(client, (body as any).trigger_id, {
          type: 'modal',
          callback_id: 'punch_adjustment_modal',
          private_metadata: JSON.stringify({
            daily_record_id,
            employee_id,
            employee_name,
            date,
            missing_punches,
            type,
            message_ts: messageTs,
            channel_id: channelId,
          }),
          title: {
            type: 'plain_text',
            text: 'Solicitar Ajuste',
          },
          submit: {
            type: 'plain_text',
            text: 'Enviar',
          },
          close: {
            type: 'plain_text',
            text: 'Cancelar',
          },
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: [
                  `*Colaborador:* ${employee_name}`,
                  `*Data:* ${date}`,
                  missingText,
                ].join('\n'),
              },
            },
            {
              type: 'input',
              block_id: 'adjustment_reason_block',
              element: {
                type: 'plain_text_input',
                action_id: 'adjustment_reason_input',
                multiline: true,
                placeholder: {
                  type: 'plain_text',
                  text: 'Ex: Estava em reunião externa, Problemas com a máquina de ponto...',
                },
                max_length: 500,
              },
              label: {
                type: 'plain_text',
                text: 'Por que você esqueceu de bater o ponto?',
              },
            },
            certificateFilesInputBlock(true, 'Atestado médico (opcional)',
              `Se foi por motivo de saúde, anexe a foto ou o PDF do atestado. Até ${MAX_FILES_PER_UPLOAD} arquivos, 10 MB cada.`),
          ],
      });
    } catch (error) {
      console.error('[slack] Error opening punch adjustment modal:', error);
    }
  });

  // Handle punch adjustment modal submission
  app.view('punch_adjustment_modal', async ({ ack, body, view, client }) => {
    const files = submittedCertificateFiles(view);
    const sizeError = certificateSizeError(files);
    if (sizeError) {
      await ack({ response_action: 'errors', errors: sizeError });
      return;
    }
    // Downloading + storing an atestado can take longer than Slack's 3s
    await ack();

    try {
      const metadata = JSON.parse(view.private_metadata);
      const { daily_record_id, employee_id, employee_name, date, missing_punches, type, message_ts, channel_id } = metadata;

      const reason = view.state.values.adjustment_reason_block.adjustment_reason_input.value || '';

      if (reason.trim()) {
        // Create punch adjustment request
        await queries.insertPunchAdjustmentRequest({
          daily_record_id,
          employee_id,
          type,
          missing_punches,
          reason: reason.trim(),
        });

        await queries.logAudit('PUNCH_ADJUSTMENT_REQUESTED', 'daily_record', daily_record_id,
          `${employee_name}: ${type} - ${reason}`);
      }

      // Optional atestado attached to the request (RH: Atestados; gestor: Ajustes)
      let certificate: { outcome: CertificateFilesOutcome; target: CertificateTarget } | null = null;
      if (files.length > 0) {
        const record = await queries.getDailyRecordById(daily_record_id);
        const certDate: string = record?.date ?? date;
        const outcome = await saveSlackCertificateFiles(client, files, {
          employeeId: employee_id, employeeName: employee_name, date: certDate, dailyRecordId: daily_record_id,
          justificationId: null, flow: 'adjustment', uploadedBy: 'employee', slackUserId: body.user.id,
        });
        certificate = {
          outcome,
          target: {
            mode: 'attach', flow: 'adjustment', by: 'employee', daily_record_id, employee_id,
            employee_name, date: certDate,
          },
        };
      }

      // Update the original message
      if (message_ts && channel_id) {
        const missingText = missing_punches.length > 0
          ? `*Pontos faltando:* ${missing_punches.join(', ')}`
          : type === 'late_punch'
            ? '*Tipo:* Ponto após 17:00'
            : '*Tipo:* Entrada após 10:00';

        await client.chat.update({
          channel: channel_id,
          ts: message_ts,
          text: `Ajuste solicitado para ${date}`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: [
                  `:white_check_mark: *Solicitação de ajuste enviada!*`,
                  '',
                  `*Colaborador:* ${employee_name}`,
                  `*Data:* ${date}`,
                  missingText,
                  `*Motivo:* ${reason}`,
                  ...(certificate ? ['', ...certificateOutcomeLines(certificate.outcome, 'employee')] : []),
                  '',
                  '_Aguarde a revisão do seu gestor._',
                ].join('\n'),
              },
            },
            // A file that didn't save can be sent again from the same message
            ...(certificate && certificate.outcome.failed.length > 0 && certificate.outcome.total < MAX_FILES_PER_DAY
              ? [{ type: 'actions' as const, elements: [certificateButton(certificate.target, certificate.outcome.total > 0)] }]
              : []),
          ],
        });
      }

      console.log(`[slack] Punch adjustment requested by ${employee_name} for ${date}`);
    } catch (error) {
      console.error('[slack] Error handling punch adjustment modal:', error);
    }
  });

}
