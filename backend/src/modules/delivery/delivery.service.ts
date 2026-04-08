import { ChannelConnection } from '../channel-connections/channel-connection.model.js';
import type { ApprovalRequestDocument } from '../approval-requests/approval-request.model.js';
import { logger } from '../../utils/index.js';
import { markApprovalRequestDelivered } from '../approval-requests/approval-request.service.js';
import { formatTelegramApprovalMessage } from './formatters/approval-message.formatter.js';
import { sendTelegramDeliveryMessage } from './providers/telegram.delivery.js';

export async function deliverApprovalRequest(
  approvalRequest: ApprovalRequestDocument,
): Promise<{ delivered: boolean; channelType: 'telegram' | null }> {
  const telegramConnection = await ChannelConnection.findOne({
    userId: approvalRequest.userId,
    type: 'telegram',
    status: 'connected',
    identifier: { $type: 'string' },
  });

  if (!telegramConnection?.identifier) {
    logger.info({ approvalRequestId: approvalRequest.id }, 'Skipped approval delivery because no Telegram channel is connected');
    return { delivered: false, channelType: null };
  }

  const message = formatTelegramApprovalMessage(approvalRequest);

  await sendTelegramDeliveryMessage(telegramConnection.identifier, message);
  await markApprovalRequestDelivered(approvalRequest, 'telegram');

  return { delivered: true, channelType: 'telegram' };
}
