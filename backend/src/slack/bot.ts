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

// ─── Register Interactive Handlers ─────────────────────────────

function registerInteractions(app: App): void {
  // Handle justification button clicks
  for (let i = 0; i < Math.max(LATE_JUSTIFICATIONS.length, OVERTIME_JUSTIFICATIONS.length); i++) {
    app.action(`justify_${i}`, async ({ ack, body, action, client }) => {
      await ack();

      try {
        const payload = JSON.parse((action as any).value);
        const { daily_record_id, employee_name, type, reason } = payload;

        // Find the employee
        const records = await queries.getDailyRecordsByDate(new Date().toISOString().split('T')[0]);
        const record = records.find((r: any) => r.id === daily_record_id);
        const employeeId = record ? (record as any).employee_id : null;

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

      // Find the employee
      const records = await queries.getDailyRecordsByDate(new Date().toISOString().split('T')[0]);
      const record = records.find((r: any) => r.id === daily_record_id);
      const employeeId = record ? (record as any).employee_id : null;

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
}
