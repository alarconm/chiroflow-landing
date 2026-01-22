/**
 * Epic 08: Clearinghouse Integration - Mock Provider
 *
 * Mock implementation of IClearinghouseProvider for development and testing.
 * Simulates clearinghouse responses with realistic delays and data.
 */

import { ClearinghouseProvider, SubmissionStatus, EligibilityStatus } from '@prisma/client';
import {
  IClearinghouseProvider,
  ClearinghouseConfigData,
  ClaimSubmissionRequest,
  ClaimSubmissionResponse,
  BatchSubmissionRequest,
  BatchSubmissionResponse,
  EligibilityRequest,
  EligibilityResponse,
  ClaimStatusRequest,
  ClaimStatusResponse,
  RemittanceFetchRequest,
  RemittanceData,
  AppealRequest,
  AppealResponse,
  CLAIM_STATUS_CATEGORY,
} from './types';

// Helper to generate random control numbers
function generateControlNumber(): string {
  return `MOCK${Date.now()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}

// Helper to simulate network delay
async function simulateDelay(minMs = 200, maxMs = 800): Promise<void> {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  await new Promise((resolve) => setTimeout(resolve, delay));
}

// Helper to generate random batch ID
function generateBatchId(): string {
  return `BATCH-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
}

export class MockClearinghouseProvider implements IClearinghouseProvider {
  readonly providerType = ClearinghouseProvider.MOCK;
  private config: ClearinghouseConfigData | null = null;

  async configure(config: ClearinghouseConfigData): Promise<void> {
    this.config = config;
  }

  async testConnection(): Promise<{ success: boolean; message?: string }> {
    await simulateDelay(100, 300);

    if (!this.config) {
      return { success: false, message: 'Provider not configured' };
    }

    return {
      success: true,
      message: 'Mock clearinghouse connection successful'
    };
  }

  async submitClaim(request: ClaimSubmissionRequest): Promise<ClaimSubmissionResponse> {
    await simulateDelay(500, 1500);

    if (!this.config) {
      return {
        success: false,
        status: SubmissionStatus.ERROR,
        responseCode: 'ERR001',
        responseMessage: 'Provider not configured',
        errors: [{ code: 'ERR001', message: 'Provider not configured' }],
      };
    }

    // Simulate occasional failures (10% chance)
    if (Math.random() < 0.1) {
      return {
        success: false,
        status: SubmissionStatus.REJECTED,
        responseCode: 'ERR002',
        responseMessage: 'Simulated claim rejection - missing required field',
        errors: [
          { code: 'ERR002', message: 'Missing required diagnosis code', field: 'diagnoses' },
        ],
      };
    }

    const controlNumber = generateControlNumber();
    const batchId = generateBatchId();

    return {
      success: true,
      batchId,
      controlNumber,
      status: SubmissionStatus.SUBMITTED,
      responseCode: '200',
      responseMessage: 'Claim accepted for processing',
      ediContent: this.generateMock837P(request, controlNumber),
    };
  }

  async submitClaimBatch(request: BatchSubmissionRequest): Promise<BatchSubmissionResponse> {
    await simulateDelay(1000, 3000);

    if (!this.config) {
      return {
        batchId: '',
        totalClaims: request.claimIds.length,
        submittedClaims: 0,
        failedClaims: request.claimIds.length,
        results: request.claimIds.map((claimId) => ({
          claimId,
          success: false,
          error: 'Provider not configured',
        })),
      };
    }

    const batchId = generateBatchId();
    const results = request.claimIds.map((claimId) => {
      // 90% success rate
      const success = Math.random() > 0.1;
      return {
        claimId,
        success,
        controlNumber: success ? generateControlNumber() : undefined,
        error: success ? undefined : 'Simulated batch submission failure',
      };
    });

    const submittedClaims = results.filter((r) => r.success).length;
    const failedClaims = results.filter((r) => !r.success).length;

    return {
      batchId,
      totalClaims: request.claimIds.length,
      submittedClaims,
      failedClaims,
      results,
    };
  }

  async checkEligibility(request: EligibilityRequest): Promise<EligibilityResponse> {
    await simulateDelay(800, 2000);

    if (!this.config) {
      return {
        success: false,
        status: EligibilityStatus.ERROR,
        responseDate: new Date(),
        errorMessage: 'Provider not configured',
        coverage: { status: 'Unknown' },
        benefits: {},
      };
    }

    // Simulate different eligibility scenarios
    const scenario = Math.random();

    if (scenario < 0.1) {
      // 10% - subscriber not found
      return {
        success: false,
        status: EligibilityStatus.UNKNOWN,
        responseDate: new Date(),
        errorMessage: 'Subscriber not found in payer system',
        coverage: { status: 'Unknown' },
        benefits: {},
        ediRequest: this.generateMock270(request),
      };
    }

    if (scenario < 0.2) {
      // 10% - inactive coverage
      return {
        success: true,
        status: EligibilityStatus.INACTIVE,
        responseDate: new Date(),
        coverage: {
          status: 'Inactive',
          planName: 'Mock Health Plan - Terminated',
          planType: 'PPO',
          effectiveDate: new Date('2023-01-01'),
          terminationDate: new Date('2024-06-30'),
        },
        benefits: {},
        ediRequest: this.generateMock270(request),
        ediResponse: this.generateMock271Inactive(),
      };
    }

    // 80% - active coverage with chiropractic benefits
    const visitMax = Math.floor(Math.random() * 20) + 12; // 12-31 visits
    const visitsUsed = Math.floor(Math.random() * visitMax);

    return {
      success: true,
      status: EligibilityStatus.ACTIVE,
      responseDate: new Date(),
      coverage: {
        status: 'Active',
        planName: 'Mock Health Plan - Gold',
        planType: 'PPO',
        effectiveDate: new Date('2024-01-01'),
      },
      benefits: {
        deductible: 500,
        deductibleMet: Math.floor(Math.random() * 500),
        outOfPocketMax: 3000,
        outOfPocketMet: Math.floor(Math.random() * 1500),
        copay: 25,
        coinsurance: 20,
      },
      visitLimits: {
        max: visitMax,
        used: visitsUsed,
        remaining: visitMax - visitsUsed,
      },
      authorization: {
        required: Math.random() > 0.5,
        number: Math.random() > 0.5 ? `AUTH${Date.now()}` : undefined,
        effectiveDate: new Date(),
        terminationDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
      },
      ediRequest: this.generateMock270(request),
      ediResponse: this.generateMock271Active(visitMax, visitsUsed),
    };
  }

  async checkClaimStatus(request: ClaimStatusRequest): Promise<ClaimStatusResponse> {
    await simulateDelay(600, 1500);

    if (!this.config) {
      return {
        success: false,
        status: SubmissionStatus.ERROR,
        responseDate: new Date(),
        errorMessage: 'Provider not configured',
        claimStatus: {
          categoryCode: 'E0',
          categoryDescription: CLAIM_STATUS_CATEGORY.E0,
        },
      };
    }

    // Simulate different claim status scenarios
    const scenario = Math.random();
    let claimStatus: ClaimStatusResponse['claimStatus'];
    let financial: ClaimStatusResponse['financial'];
    let status: SubmissionStatus;

    if (scenario < 0.1) {
      // 10% - claim not found
      status = SubmissionStatus.ERROR;
      claimStatus = {
        categoryCode: 'A4',
        categoryDescription: CLAIM_STATUS_CATEGORY.A4,
      };
    } else if (scenario < 0.3) {
      // 20% - pending adjudication
      status = SubmissionStatus.PENDING;
      claimStatus = {
        categoryCode: 'P0',
        categoryDescription: CLAIM_STATUS_CATEGORY.P0,
        statusCode: 'P0:0',
        statusDescription: 'Claim in process',
      };
    } else if (scenario < 0.4) {
      // 10% - pending medical review
      status = SubmissionStatus.PENDING;
      claimStatus = {
        categoryCode: 'P2',
        categoryDescription: CLAIM_STATUS_CATEGORY.P2,
        statusCode: 'P2:0',
        statusDescription: 'Claim under medical review',
      };
    } else if (scenario < 0.5) {
      // 10% - request for additional info
      status = SubmissionStatus.PENDING;
      claimStatus = {
        categoryCode: 'R4',
        categoryDescription: CLAIM_STATUS_CATEGORY.R4,
        statusCode: 'R4:0',
        statusDescription: 'Additional documentation requested',
      };
    } else if (scenario < 0.7) {
      // 20% - finalized with full payment
      status = SubmissionStatus.ACCEPTED;
      const totalCharged = Math.floor(Math.random() * 300) + 100;
      const totalPaid = Math.floor(totalCharged * 0.8);
      claimStatus = {
        categoryCode: 'F0',
        categoryDescription: CLAIM_STATUS_CATEGORY.F0,
        statusCode: 'F0:0',
        statusDescription: 'Claim paid',
      };
      financial = {
        totalCharged,
        totalPaid,
        patientResponsibility: totalCharged - totalPaid,
        adjudicationDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        checkNumber: `CHK${Date.now()}`,
        paymentDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      };
    } else if (scenario < 0.85) {
      // 15% - finalized with partial payment
      status = SubmissionStatus.ACCEPTED;
      const totalCharged = Math.floor(Math.random() * 300) + 100;
      const totalPaid = Math.floor(totalCharged * 0.5);
      claimStatus = {
        categoryCode: 'F2',
        categoryDescription: CLAIM_STATUS_CATEGORY.F2,
        statusCode: 'F2:0',
        statusDescription: 'Claim partially paid',
      };
      financial = {
        totalCharged,
        totalPaid,
        patientResponsibility: totalCharged - totalPaid,
        adjudicationDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        checkNumber: `CHK${Date.now()}`,
        paymentDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      };
    } else {
      // 15% - denied
      status = SubmissionStatus.REJECTED;
      claimStatus = {
        categoryCode: 'F1',
        categoryDescription: CLAIM_STATUS_CATEGORY.F1,
        statusCode: 'F1:0',
        statusDescription: 'Claim denied',
      };
      financial = {
        totalCharged: Math.floor(Math.random() * 300) + 100,
        totalPaid: 0,
        patientResponsibility: 0,
        adjudicationDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      };
    }

    return {
      success: true,
      status,
      responseDate: new Date(),
      traceNumber: `TN${Date.now()}`,
      claimStatus,
      financial,
      payerClaimNumber: `PCN${request.claimId.substring(0, 8)}`,
      ediRequest: this.generateMock276(request),
      ediResponse: this.generateMock277(claimStatus.categoryCode),
    };
  }

  async fetchRemittances(request: RemittanceFetchRequest): Promise<RemittanceData[]> {
    await simulateDelay(1000, 2500);

    if (!this.config) {
      return [];
    }

    // Generate 0-3 mock remittances
    const count = Math.floor(Math.random() * 4);
    const remittances: RemittanceData[] = [];

    for (let i = 0; i < count; i++) {
      const claimCount = Math.floor(Math.random() * 5) + 1;
      const claims = [];

      for (let j = 0; j < claimCount; j++) {
        const serviceCount = Math.floor(Math.random() * 3) + 1;
        const services = [];

        for (let k = 0; k < serviceCount; k++) {
          const chargedAmount = Math.floor(Math.random() * 150) + 50;
          const allowedAmount = Math.floor(chargedAmount * 0.8);
          const paidAmount = Math.floor(allowedAmount * 0.8);
          const adjustedAmount = chargedAmount - allowedAmount;
          const patientAmount = allowedAmount - paidAmount;

          services.push({
            lineNumber: k + 1,
            serviceDate: new Date(Date.now() - Math.floor(Math.random() * 30) * 24 * 60 * 60 * 1000),
            cptCode: ['98940', '98941', '98942', '97110', '97140'][Math.floor(Math.random() * 5)],
            modifiers: Math.random() > 0.5 ? ['GP'] : [],
            units: Math.floor(Math.random() * 3) + 1,
            chargedAmount,
            allowedAmount,
            paidAmount,
            adjustedAmount,
            patientAmount,
            adjustmentReasonCodes: adjustedAmount > 0 ? ['CO-45'] : [],
            adjustmentAmounts: adjustedAmount > 0 ? { 'CO-45': adjustedAmount } : {},
            remarkCodes: Math.random() > 0.7 ? ['N130'] : [],
          });
        }

        claims.push({
          patientName: `Mock Patient ${j + 1}`,
          patientAccountNumber: `ACCT${Date.now()}${j}`,
          payerClaimNumber: `PCN${Date.now()}${j}`,
          services,
        });
      }

      const totalPaid = claims.reduce(
        (sum, claim) => sum + claim.services.reduce((s, svc) => s + svc.paidAmount, 0),
        0
      );
      const totalAdjusted = claims.reduce(
        (sum, claim) => sum + claim.services.reduce((s, svc) => s + svc.adjustedAmount, 0),
        0
      );
      const totalCharges = claims.reduce(
        (sum, claim) => sum + claim.services.reduce((s, svc) => s + svc.chargedAmount, 0),
        0
      );

      remittances.push({
        checkNumber: `CHK${Date.now()}${i}`,
        checkDate: new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000),
        payerName: 'Mock Insurance Company',
        payerId: 'MOCK001',
        totalPaid,
        totalAdjusted,
        totalCharges,
        claims,
        ediContent: this.generateMock835(totalPaid, totalAdjusted, totalCharges),
      });
    }

    return remittances;
  }

  async submitAppeal(request: AppealRequest): Promise<AppealResponse> {
    await simulateDelay(500, 1200);

    if (!this.config) {
      return {
        success: false,
        message: 'Provider not configured',
        errors: ['Provider not configured'],
      };
    }

    // 80% success rate for appeals
    if (Math.random() < 0.8) {
      return {
        success: true,
        appealNumber: `APL${Date.now()}`,
        message: 'Appeal submitted successfully. Expected response within 30 days.',
      };
    }

    return {
      success: false,
      message: 'Appeal submission failed',
      errors: ['Supporting documentation is incomplete or missing required elements'],
    };
  }

  // Mock EDI generators (simplified)
  private generateMock837P(request: ClaimSubmissionRequest, controlNumber: string): string {
    return `ISA*00*          *00*          *ZZ*MOCK           *ZZ*PAYER          *${this.formatDate()}*${this.formatTime()}*^*00501*${controlNumber}*0*P*:~
GS*HC*MOCK*PAYER*${this.formatDate()}*${this.formatTime()}*1*X*005010X222A1~
ST*837*0001*005010X222A1~
BHT*0019*00*${controlNumber}*${this.formatDate()}*${this.formatTime()}*CH~
NM1*41*2*${request.provider.name}****XX*${request.provider.npi}~
NM1*40*2*${request.insurance.payerName}****PI*${request.insurance.payerId}~
HL*1**20*1~
NM1*85*2*${request.provider.name}****XX*${request.provider.npi}~
HL*2*1*22*0~
NM1*IL*1*${request.patient.lastName}*${request.patient.firstName}****MI*${request.insurance.subscriberId}~
CLM*${request.claim.claimNumber}*${request.claim.totalCharges}***${request.claim.placeOfService}:B:1*Y*A*Y*Y~
SE*12*0001~
GE*1*1~
IEA*1*${controlNumber}~`;
  }

  private generateMock270(request: EligibilityRequest): string {
    return `ISA*00*          *00*          *ZZ*MOCK           *ZZ*PAYER          *${this.formatDate()}*${this.formatTime()}*^*00501*000000001*0*P*:~
GS*HS*MOCK*PAYER*${this.formatDate()}*${this.formatTime()}*1*X*005010X279A1~
ST*270*0001*005010X279A1~
BHT*0022*13*TN${Date.now()}*${this.formatDate()}*${this.formatTime()}~
HL*1**20*1~
NM1*PR*2*${request.payer.payerName}****PI*${request.payer.payerId}~
HL*2*1*21*1~
NM1*1P*1******XX*PROVIDERNPI~
HL*3*2*22*0~
NM1*IL*1*${request.patient.lastName}*${request.patient.firstName}~
DMG*D8*${this.formatDateOfBirth(request.patient.dateOfBirth)}~
EQ*30~
SE*12*0001~
GE*1*1~
IEA*1*000000001~`;
  }

  private generateMock271Active(visitMax: number, visitsUsed: number): string {
    return `ISA*00*          *00*          *ZZ*PAYER          *ZZ*MOCK           *${this.formatDate()}*${this.formatTime()}*^*00501*000000001*0*P*:~
GS*HB*PAYER*MOCK*${this.formatDate()}*${this.formatTime()}*1*X*005010X279A1~
ST*271*0001*005010X279A1~
BHT*0022*11*TN${Date.now()}*${this.formatDate()}*${this.formatTime()}~
HL*1**20*1~
NM1*PR*2*MOCK INSURANCE COMPANY****PI*MOCK001~
HL*2*1*21*1~
NM1*1P*1******XX*PROVIDERNPI~
HL*3*2*22*0~
NM1*IL*1*PATIENT*TEST~
EB*1**30*HN*ACTIVE~
EB*C*IND*30**25~
EB*G*FAM*30**500~
MSG*CHIROPRACTIC VISITS: ${visitsUsed} USED OF ${visitMax} MAXIMUM~
SE*15*0001~
GE*1*1~
IEA*1*000000001~`;
  }

  private generateMock271Inactive(): string {
    return `ISA*00*          *00*          *ZZ*PAYER          *ZZ*MOCK           *${this.formatDate()}*${this.formatTime()}*^*00501*000000001*0*P*:~
GS*HB*PAYER*MOCK*${this.formatDate()}*${this.formatTime()}*1*X*005010X279A1~
ST*271*0001*005010X279A1~
BHT*0022*11*TN${Date.now()}*${this.formatDate()}*${this.formatTime()}~
HL*1**20*1~
NM1*PR*2*MOCK INSURANCE COMPANY****PI*MOCK001~
HL*2*1*21*1~
NM1*1P*1******XX*PROVIDERNPI~
HL*3*2*22*0~
NM1*IL*1*PATIENT*TEST~
EB*6**30**INACTIVE - COVERAGE TERMINATED~
SE*12*0001~
GE*1*1~
IEA*1*000000001~`;
  }

  private generateMock276(request: ClaimStatusRequest): string {
    return `ISA*00*          *00*          *ZZ*MOCK           *ZZ*PAYER          *${this.formatDate()}*${this.formatTime()}*^*00501*000000001*0*P*:~
GS*HR*MOCK*PAYER*${this.formatDate()}*${this.formatTime()}*1*X*005010X212~
ST*276*0001*005010X212~
BHT*0010*13*TN${Date.now()}*${this.formatDate()}*${this.formatTime()}~
HL*1**20*1~
NM1*PR*2*${request.payer.payerName}****PI*${request.payer.payerId}~
HL*2*1*21*1~
NM1*41*1******XX*PROVIDERNPI~
HL*3*2*19*0~
NM1*IL*1*${request.patient.lastName}*${request.patient.firstName}****MI*${request.patient.memberId || ''}~
TRN*1*${request.claimNumber || request.claimId}~
SE*12*0001~
GE*1*1~
IEA*1*000000001~`;
  }

  private generateMock277(statusCategory: string): string {
    const description = CLAIM_STATUS_CATEGORY[statusCategory as keyof typeof CLAIM_STATUS_CATEGORY] || 'Unknown';
    return `ISA*00*          *00*          *ZZ*PAYER          *ZZ*MOCK           *${this.formatDate()}*${this.formatTime()}*^*00501*000000001*0*P*:~
GS*HN*PAYER*MOCK*${this.formatDate()}*${this.formatTime()}*1*X*005010X212~
ST*277*0001*005010X212~
BHT*0085*08*TN${Date.now()}*${this.formatDate()}*${this.formatTime()}~
HL*1**20*1~
NM1*PR*2*MOCK INSURANCE COMPANY****PI*MOCK001~
HL*2*1*21*1~
NM1*41*1******XX*PROVIDERNPI~
HL*3*2*19*0~
NM1*IL*1*PATIENT*TEST~
STC*${statusCategory}:0:0*${this.formatDate()}**${description}~
SE*12*0001~
GE*1*1~
IEA*1*000000001~`;
  }

  private generateMock835(totalPaid: number, totalAdjusted: number, totalCharges: number): string {
    return `ISA*00*          *00*          *ZZ*PAYER          *ZZ*MOCK           *${this.formatDate()}*${this.formatTime()}*^*00501*000000001*0*P*:~
GS*HP*PAYER*MOCK*${this.formatDate()}*${this.formatTime()}*1*X*005010X221A1~
ST*835*0001*005010X221A1~
BPR*I*${totalPaid.toFixed(2)}*C*CHK*CCP*01*XXXXXXXX*DA*XXXXXXXX*MOCK INSURANCE~
TRN*1*TN${Date.now()}*1MOCK001~
DTM*405*${this.formatDate()}~
N1*PR*MOCK INSURANCE COMPANY~
N1*PE*PROVIDER NAME*XX*PROVIDERNPI~
PLB*PROVIDERNPI*${this.formatDate()}*FB:0*${totalAdjusted.toFixed(2)}~
SE*10*0001~
GE*1*1~
IEA*1*000000001~`;
  }

  private formatDate(): string {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  }

  private formatTime(): string {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  }

  private formatDateOfBirth(dob: Date): string {
    return `${dob.getFullYear()}${String(dob.getMonth() + 1).padStart(2, '0')}${String(dob.getDate()).padStart(2, '0')}`;
  }
}
