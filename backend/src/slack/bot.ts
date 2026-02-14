import { App, LogLevel } from '@slack/bolt';
import { env } from '../config/env';
import { LATE_JUSTIFICATIONS, OVERTIME_JUSTIFICATIONS } from '../config/constants';
import * as queries from '../models/queries';
import { formatMinutes, classificationLabel } from '../services/hours-calculator';

let slackApp: App | null = null;

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
 * In test mode, ALL messages go to SLACK_TEST_USER_ID.
 */
function getTargetUserId(realUserId: string | null): string {
  // ALWAYS use test user in current phase
  return env.SLACK_TEST_USER_ID;
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
    await app.client.chat.postMessage({
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

  const alertRecords = records.filter(
    r => r.classification !== 'normal' && Math.abs(r.difference_minutes) >= 11
  );

  if (alertRecords.length === 0) return;

  const lines = alertRecords.map(r => {
    const emoji = r.classification === 'late' ? ':red_circle:' : ':large_blue_circle:';
    const label = classificationLabel(r.classification as any);
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
    await app.client.chat.postMessage({
      channel: targetUser,
      text: `Resumo de banco de horas — ${date}`,
      blocks,
    });

    console.log(`[slack] Manager summary sent to ${leaderName} for ${date}`);
  } catch (error) {
    console.error(`[slack] Failed to send manager summary:`, error);
  }
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
    await app.client.chat.postMessage({
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

  const isApproved = status === 'approved';
  const emoji = isApproved ? ':white_check_mark:' : ':x:';
  const statusLabel = isApproved ? 'APROVADA' : 'REJEITADA';
  const typeLabel = type === 'late' ? 'Atraso' : 'Hora Extra';
  const color = isApproved ? '#36a64f' : '#e01e5a';

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
    await app.client.chat.postMessage({
      channel: targetUser,
      text: `Sua justificativa de ${typeLabel.toLowerCase()} foi ${statusLabel.toLowerCase()}`,
      blocks,
    });

    console.log(`[slack] Justification review notification sent to ${employeeName} (${status})`);
  } catch (error) {
    console.error(`[slack] Failed to send justification review notification:`, error);
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
          'Por favor, indique se foi *folga* ou *falta*:',
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
      ],
    },
  ];

  try {
    await app.client.chat.postMessage({
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

  const missingCount = missingPunches.length;
  const punchesText = missingPunches.map(p => `• ${p}`).join('\n');

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
          `Você esqueceu de bater *${missingCount} ponto(s)*:`,
          punchesText,
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
    await app.client.chat.postMessage({
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

  const blocks = [
    {
      type: 'header' as const,
      text: {
        type: 'plain_text' as const,
        text: '⚠️ Entrada Após 12:00',
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
          'Seu primeiro ponto foi registrado após 12:00.',
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
    await app.client.chat.postMessage({
      channel: targetUser,
      text: `Seu primeiro ponto em ${date} foi após 12:00`,
      blocks,
    });

    await queries.logAudit('SLACK_LATE_START_NOTIFICATION', 'daily_record', record.id,
      `Sent to ${employee.name} for ${date}`);

    console.log(`[slack] Late start notification sent to ${employee.name} (${date})`);
  } catch (error) {
    console.error(`[slack] Failed to send late start notification:`, error);
  }
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
          channel: (body as any).channel?.id || (body as any).user?.id,
          ts: (body as any).message?.ts,
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

  // ─── Handle Manager Folga/Falta Decisions ───────────────────────

  app.action('set_folga', async ({ ack, body, action, client }) => {
    await ack();

    try {
      const payload = JSON.parse((action as any).value);
      const { employee_id, employee_name, date } = payload;

      // Find the record for this employee/date
      const record = await queries.getDailyRecord(employee_id, date);
      if (record) {
        await queries.updateRecordClassification(record.id, 'folga');
        await queries.logAudit('MANAGER_SET_FOLGA', 'daily_record', record.id,
          `${employee_name} on ${date} marked as folga`);
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

      // Find the record for this employee/date
      const record = await queries.getDailyRecord(employee_id, date);
      if (record) {
        await queries.updateRecordClassification(record.id, 'falta');
        await queries.logAudit('MANAGER_SET_FALTA', 'daily_record', record.id,
          `${employee_name} on ${date} marked as falta`);
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
        : '*Tipo:* Entrada após 12:00';

      await client.views.open({
        trigger_id: (body as any).trigger_id,
        view: {
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
          ],
        },
      });
    } catch (error) {
      console.error('[slack] Error opening punch adjustment modal:', error);
    }
  });

  // Handle punch adjustment modal submission
  app.view('punch_adjustment_modal', async ({ ack, body, view, client }) => {
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

      // Update the original message
      if (message_ts && channel_id) {
        const missingText = missing_punches.length > 0
          ? `*Pontos faltando:* ${missing_punches.join(', ')}`
          : '*Tipo:* Entrada após 12:00';

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
                  '',
                  '_Aguarde a revisão do seu gestor._',
                ].join('\n'),
              },
            },
          ],
        });
      }

      console.log(`[slack] Punch adjustment requested by ${employee_name} for ${date}`);
    } catch (error) {
      console.error('[slack] Error handling punch adjustment modal:', error);
    }
  });
}
