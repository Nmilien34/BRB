import { logger } from '../../utils/index.js';
import { deliverApprovalRequest } from '../delivery/delivery.service.js';
import { listDueTimerEscalationApprovalRequests } from './approval-request.service.js';

const APPROVAL_ESCALATION_INTERVAL_MS = 30 * 1000;

let escalationInterval: NodeJS.Timeout | null = null;
let isRunning = false;

async function runApprovalEscalationTick(): Promise<void> {
  if (isRunning) {
    return;
  }

  isRunning = true;

  try {
    const dueApprovals = await listDueTimerEscalationApprovalRequests();

    for (const approvalRequest of dueApprovals) {
      const deliveryResult = await deliverApprovalRequest(approvalRequest);

      if (deliveryResult.delivered) {
        logger.info(
          {
            approvalRequestId: approvalRequest.id,
            channelType: deliveryResult.channelType,
          },
          'Escalated pending local approval to Telegram after timeout',
        );
      } else {
        logger.info(
          { approvalRequestId: approvalRequest.id },
          'Skipped timed escalation because no Telegram channel is connected',
        );
      }
    }
  } catch (error) {
    logger.error({ err: error }, 'Approval escalation job failed');
  } finally {
    isRunning = false;
  }
}

export function startApprovalEscalationJob(): void {
  if (escalationInterval) {
    return;
  }

  escalationInterval = setInterval(() => {
    void runApprovalEscalationTick();
  }, APPROVAL_ESCALATION_INTERVAL_MS);

  escalationInterval.unref?.();
}
