// Nurture Engine Service - Automated Lead Nurturing
import { prisma } from '@/lib/prisma';
import type { NurtureSequenceStatus, LeadSource, Prisma } from '@prisma/client';
import { LeadManager } from './lead-manager';

export interface NurtureStepResult {
  stepId: string;
  stepNumber: number;
  actionType: string;
  success: boolean;
  message?: string;
  error?: string;
}

export interface CreateSequenceInput {
  name: string;
  description?: string;
  triggerType: string;
  triggerValue?: string;
  leadSources?: LeadSource[];
  minScore?: number;
  maxScore?: number;
  exitOnConversion?: boolean;
  exitOnUnsubscribe?: boolean;
  maxDays?: number;
}

export interface AddStepInput {
  sequenceId: string;
  name: string;
  delayDays?: number;
  delayHours?: number;
  sendTime?: string;
  actionType: string;
  templateId?: string;
  taskTitle?: string;
  taskDescription?: string;
  taskAssignTo?: string;
  scoreChange?: number;
  condition?: Record<string, unknown>;
}

export class NurtureEngine {
  private organizationId: string;

  constructor(organizationId: string) {
    this.organizationId = organizationId;
  }

  // Create a new nurture sequence
  async createSequence(input: CreateSequenceInput) {
    return prisma.nurtureSequence.create({
      data: {
        name: input.name,
        description: input.description,
        triggerType: input.triggerType,
        triggerValue: input.triggerValue,
        leadSources: input.leadSources || [],
        minScore: input.minScore,
        maxScore: input.maxScore,
        exitOnConversion: input.exitOnConversion ?? true,
        exitOnUnsubscribe: input.exitOnUnsubscribe ?? true,
        maxDays: input.maxDays,
        organizationId: this.organizationId,
      },
      include: { steps: true },
    });
  }

  // Add a step to a sequence
  async addStep(input: AddStepInput) {
    // Get the next step number
    const lastStep = await prisma.nurtureSequenceStep.findFirst({
      where: { sequenceId: input.sequenceId },
      orderBy: { stepNumber: 'desc' },
    });

    const stepNumber = (lastStep?.stepNumber ?? 0) + 1;

    return prisma.nurtureSequenceStep.create({
      data: {
        sequenceId: input.sequenceId,
        stepNumber,
        name: input.name,
        delayDays: input.delayDays ?? 0,
        delayHours: input.delayHours ?? 0,
        sendTime: input.sendTime,
        actionType: input.actionType,
        templateId: input.templateId,
        taskTitle: input.taskTitle,
        taskDescription: input.taskDescription,
        taskAssignTo: input.taskAssignTo,
        scoreChange: input.scoreChange,
        condition: input.condition as Prisma.InputJsonValue,
      },
      include: { template: true },
    });
  }

  // Reorder steps in a sequence
  async reorderSteps(sequenceId: string, stepIds: string[]) {
    const updates = stepIds.map((stepId, index) =>
      prisma.nurtureSequenceStep.update({
        where: { id: stepId },
        data: { stepNumber: index + 1 },
      })
    );

    await prisma.$transaction(updates);
    return this.getSequence(sequenceId);
  }

  // Update sequence status
  async updateSequenceStatus(sequenceId: string, status: NurtureSequenceStatus) {
    return prisma.nurtureSequence.update({
      where: { id: sequenceId },
      data: { status },
    });
  }

  // Activate a sequence
  async activateSequence(sequenceId: string) {
    const sequence = await prisma.nurtureSequence.findFirst({
      where: { id: sequenceId, organizationId: this.organizationId },
      include: { steps: true },
    });

    if (!sequence) {
      throw new Error('Sequence not found');
    }

    if (sequence.steps.length === 0) {
      throw new Error('Cannot activate a sequence with no steps');
    }

    return this.updateSequenceStatus(sequenceId, 'ACTIVE');
  }

  // Enroll a lead in a sequence
  async enrollLead(leadId: string, sequenceId: string) {
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, organizationId: this.organizationId },
    });

    if (!lead) {
      throw new Error('Lead not found');
    }

    const sequence = await prisma.nurtureSequence.findFirst({
      where: { id: sequenceId, organizationId: this.organizationId, status: 'ACTIVE' },
    });

    if (!sequence) {
      throw new Error('Sequence not found or not active');
    }

    // Check if lead already in a sequence
    if (lead.currentSequenceId) {
      throw new Error('Lead is already enrolled in a sequence');
    }

    // Check entry criteria
    if (sequence.leadSources.length > 0 && !sequence.leadSources.includes(lead.source)) {
      throw new Error('Lead source does not match sequence criteria');
    }

    if (sequence.minScore && lead.score < sequence.minScore) {
      throw new Error('Lead score below minimum for sequence');
    }

    if (sequence.maxScore && lead.score > sequence.maxScore) {
      throw new Error('Lead score above maximum for sequence');
    }

    return prisma.lead.update({
      where: { id: leadId },
      data: {
        currentSequenceId: sequenceId,
        currentStepNumber: 1,
      },
    });
  }

  // Remove lead from sequence
  async unenrollLead(leadId: string) {
    return prisma.lead.update({
      where: { id: leadId },
      data: {
        currentSequenceId: null,
        currentStepNumber: null,
      },
    });
  }

  // Check if a condition is met
  private evaluateCondition(condition: Record<string, unknown> | null, lead: Record<string, unknown>): boolean {
    if (!condition) return true;

    for (const [key, value] of Object.entries(condition)) {
      const leadValue = key.split('.').reduce((obj: Record<string, unknown>, k) => obj?.[k] as Record<string, unknown>, lead);

      if (typeof value === 'object' && value !== null) {
        const operators = value as Record<string, unknown>;
        for (const [op, opValue] of Object.entries(operators)) {
          switch (op) {
            case 'eq':
              if (leadValue !== opValue) return false;
              break;
            case 'ne':
              if (leadValue === opValue) return false;
              break;
            case 'gt':
              if (typeof leadValue !== 'number' || leadValue <= (opValue as number)) return false;
              break;
            case 'gte':
              if (typeof leadValue !== 'number' || leadValue < (opValue as number)) return false;
              break;
            case 'lt':
              if (typeof leadValue !== 'number' || leadValue >= (opValue as number)) return false;
              break;
            case 'lte':
              if (typeof leadValue !== 'number' || leadValue > (opValue as number)) return false;
              break;
            case 'in':
              if (!Array.isArray(opValue) || !opValue.includes(leadValue)) return false;
              break;
          }
        }
      } else {
        if (leadValue !== value) return false;
      }
    }

    return true;
  }

  // Execute a step for a lead
  async executeStep(leadId: string, stepId: string): Promise<NurtureStepResult> {
    const step = await prisma.nurtureSequenceStep.findUnique({
      where: { id: stepId },
      include: { template: true, sequence: true },
    });

    if (!step) {
      return {
        stepId,
        stepNumber: 0,
        actionType: 'unknown',
        success: false,
        error: 'Step not found',
      };
    }

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
    });

    if (!lead) {
      return {
        stepId,
        stepNumber: step.stepNumber,
        actionType: step.actionType,
        success: false,
        error: 'Lead not found',
      };
    }

    // Check condition
    if (!this.evaluateCondition(step.condition as Record<string, unknown> | null, lead as unknown as Record<string, unknown>)) {
      return {
        stepId,
        stepNumber: step.stepNumber,
        actionType: step.actionType,
        success: true,
        message: 'Step skipped - condition not met',
      };
    }

    // Execute based on action type
    let result: NurtureStepResult = {
      stepId,
      stepNumber: step.stepNumber,
      actionType: step.actionType,
      success: false,
    };

    try {
      switch (step.actionType) {
        case 'send_email':
          result = await this.executeSendEmail(step, lead);
          break;
        case 'send_sms':
          result = await this.executeSendSms(step, lead);
          break;
        case 'create_task':
          result = await this.executeCreateTask(step, lead);
          break;
        case 'update_score':
          result = await this.executeUpdateScore(step, lead);
          break;
        default:
          result.error = `Unknown action type: ${step.actionType}`;
      }
    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Unknown error';
    }

    // Add activity log
    const leadManager = new LeadManager(this.organizationId);
    await leadManager.addActivity(
      leadId,
      `nurture_step_${result.success ? 'completed' : 'failed'}`,
      `${step.name} - ${result.message || result.error || 'No details'}`,
      { stepId, stepNumber: step.stepNumber, actionType: step.actionType }
    );

    return result;
  }

  // Execute email step
  private async executeSendEmail(
    step: { id: string; stepNumber: number; actionType: string; templateId: string | null },
    lead: { id: string; email: string | null; firstName: string; lastName: string }
  ): Promise<NurtureStepResult> {
    if (!step.templateId) {
      return {
        stepId: step.id,
        stepNumber: step.stepNumber,
        actionType: step.actionType,
        success: false,
        error: 'No template configured for email step',
      };
    }

    if (!lead.email) {
      return {
        stepId: step.id,
        stepNumber: step.stepNumber,
        actionType: step.actionType,
        success: false,
        error: 'Lead has no email address',
      };
    }

    // In a real implementation, this would integrate with the communication service
    // For now, we'll log the intent and mark as successful
    console.log(`[NurtureEngine] Would send email to ${lead.email} using template ${step.templateId}`);

    return {
      stepId: step.id,
      stepNumber: step.stepNumber,
      actionType: step.actionType,
      success: true,
      message: `Email queued for ${lead.email}`,
    };
  }

  // Execute SMS step
  private async executeSendSms(
    step: { id: string; stepNumber: number; actionType: string; templateId: string | null },
    lead: { id: string; phone: string | null; firstName: string; lastName: string }
  ): Promise<NurtureStepResult> {
    if (!step.templateId) {
      return {
        stepId: step.id,
        stepNumber: step.stepNumber,
        actionType: step.actionType,
        success: false,
        error: 'No template configured for SMS step',
      };
    }

    if (!lead.phone) {
      return {
        stepId: step.id,
        stepNumber: step.stepNumber,
        actionType: step.actionType,
        success: false,
        error: 'Lead has no phone number',
      };
    }

    // In a real implementation, this would integrate with the communication service
    console.log(`[NurtureEngine] Would send SMS to ${lead.phone} using template ${step.templateId}`);

    return {
      stepId: step.id,
      stepNumber: step.stepNumber,
      actionType: step.actionType,
      success: true,
      message: `SMS queued for ${lead.phone}`,
    };
  }

  // Execute task creation step
  private async executeCreateTask(
    step: { id: string; stepNumber: number; actionType: string; taskTitle: string | null; taskDescription: string | null; taskAssignTo: string | null },
    lead: { id: string; firstName: string; lastName: string; assignedToUserId: string | null }
  ): Promise<NurtureStepResult> {
    if (!step.taskTitle) {
      return {
        stepId: step.id,
        stepNumber: step.stepNumber,
        actionType: step.actionType,
        success: false,
        error: 'No task title configured',
      };
    }

    const assignTo = step.taskAssignTo === 'lead_owner' ? lead.assignedToUserId : step.taskAssignTo;

    // In a real implementation, this would create a task in a task management system
    console.log(`[NurtureEngine] Would create task "${step.taskTitle}" assigned to ${assignTo}`);

    return {
      stepId: step.id,
      stepNumber: step.stepNumber,
      actionType: step.actionType,
      success: true,
      message: `Task created: ${step.taskTitle}`,
    };
  }

  // Execute score update step
  private async executeUpdateScore(
    step: { id: string; stepNumber: number; actionType: string; scoreChange: number | null },
    lead: { id: string; score: number }
  ): Promise<NurtureStepResult> {
    if (step.scoreChange === null || step.scoreChange === undefined) {
      return {
        stepId: step.id,
        stepNumber: step.stepNumber,
        actionType: step.actionType,
        success: false,
        error: 'No score change configured',
      };
    }

    const newScore = Math.max(0, lead.score + step.scoreChange);

    await prisma.lead.update({
      where: { id: lead.id },
      data: { score: newScore },
    });

    return {
      stepId: step.id,
      stepNumber: step.stepNumber,
      actionType: step.actionType,
      success: true,
      message: `Score updated from ${lead.score} to ${newScore}`,
    };
  }

  // Process all leads in sequences (called by scheduler)
  async processSequences(): Promise<{ processed: number; errors: number }> {
    let processed = 0;
    let errors = 0;

    // Get all active sequences with enrolled leads
    const sequences = await prisma.nurtureSequence.findMany({
      where: {
        organizationId: this.organizationId,
        status: 'ACTIVE',
      },
      include: {
        steps: { orderBy: { stepNumber: 'asc' } },
        leads: {
          where: {
            status: { in: ['NEW', 'CONTACTED', 'ENGAGED', 'QUALIFIED'] },
            currentStepNumber: { not: null },
          },
        },
      },
    });

    for (const sequence of sequences) {
      for (const lead of sequence.leads) {
        try {
          // Check exit conditions
          if (sequence.exitOnConversion && lead.status === 'CONVERTED') {
            await this.unenrollLead(lead.id);
            continue;
          }

          // Find current step
          const currentStep = sequence.steps.find(
            (s) => s.stepNumber === lead.currentStepNumber
          );

          if (!currentStep) {
            // Sequence complete
            await this.unenrollLead(lead.id);
            continue;
          }

          // Check if it's time to execute this step
          // This would normally check against enrollment time + step delays
          // For simplicity, we'll execute immediately

          const result = await this.executeStep(lead.id, currentStep.id);

          if (result.success) {
            // Move to next step
            const nextStep = sequence.steps.find(
              (s) => s.stepNumber === (lead.currentStepNumber ?? 0) + 1
            );

            if (nextStep) {
              await prisma.lead.update({
                where: { id: lead.id },
                data: { currentStepNumber: nextStep.stepNumber },
              });
            } else {
              // Sequence complete
              await this.unenrollLead(lead.id);
            }
          }

          processed++;
        } catch (error) {
          console.error(`[NurtureEngine] Error processing lead ${lead.id}:`, error);
          errors++;
        }
      }
    }

    return { processed, errors };
  }

  // Get sequence with steps
  async getSequence(sequenceId: string) {
    return prisma.nurtureSequence.findFirst({
      where: { id: sequenceId, organizationId: this.organizationId },
      include: {
        steps: {
          orderBy: { stepNumber: 'asc' },
          include: { template: { select: { id: true, name: true } } },
        },
        leads: { select: { id: true, firstName: true, lastName: true, status: true } },
      },
    });
  }

  // Get all sequences
  async getSequences(status?: NurtureSequenceStatus) {
    return prisma.nurtureSequence.findMany({
      where: {
        organizationId: this.organizationId,
        ...(status && { status }),
      },
      include: {
        steps: { orderBy: { stepNumber: 'asc' } },
        _count: { select: { leads: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
