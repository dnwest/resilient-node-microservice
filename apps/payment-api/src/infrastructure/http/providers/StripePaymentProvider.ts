import CircuitBreaker from 'opossum';
import axios from 'axios';
import { logger } from '../observability/logger';
import { env } from '../../../config/env';
import { withRetry, isRetryableGatewayError } from './with-retry';

/**
 * Interface representing the outbound boundary for payment processing.
 * Following Dependency Inversion Principle (DIP).
 */
export interface IPaymentGateway {
  processPayment(
    amount: number,
    currency: string
  ): Promise<{ success: boolean; transactionId?: string }>;
}

type PaymentPayload = { amount: number; currency: string };
type PaymentResponse = { success: boolean; transactionId?: string };

export class StripePaymentProvider implements IPaymentGateway {
  private breaker: CircuitBreaker<[PaymentPayload], PaymentResponse>;

  constructor() {
    const options = {
      timeout: env.GATEWAY_BREAKER_TIMEOUT_MS,
      errorThresholdPercentage: 50,
      resetTimeout: 10000,
    };

    this.breaker = new CircuitBreaker(this.makeHttpRequest.bind(this), options);

    this.setupBreakerObservability();
  }

  private setupBreakerObservability(): void {
    this.breaker.on('open', () => logger.warn('Circuit Breaker OPEN: Payment Gateway is unreachable.'));
    this.breaker.on('halfOpen', () => logger.info('Circuit Breaker HALF-OPEN: Testing Gateway health.'));
    this.breaker.on('close', () => logger.info('Circuit Breaker CLOSED: Gateway recovered.'));

    // Fallback is triggered when the circuit is OPEN or the request times out
    this.breaker.fallback(() => {
      logger.warn('Circuit Breaker FALLBACK: Executing contingency logic.');
      return { success: false, reason: 'SERVICE_UNAVAILABLE_FALLBACK' };
    });
  }

  // Retries run inside the breaker-wrapped call, so the breaker observes the
  // final outcome (success or exhausted retries), not each individual attempt.
  private async makeHttpRequest(payload: PaymentPayload): Promise<PaymentResponse> {
    const response = await withRetry(
      () =>
        axios.post(`${env.STRIPE_API_URL}/charges`, payload, {
          timeout: env.GATEWAY_TIMEOUT_MS,
        }),
      {
        retries: env.GATEWAY_MAX_RETRIES,
        baseDelayMs: env.GATEWAY_RETRY_BASE_MS,
        isRetryable: isRetryableGatewayError,
        onRetry: (attempt, err) =>
          logger.warn({ attempt, err }, 'Retrying payment gateway request'),
      },
    );
    return { success: true, transactionId: response.data.id };
  }

  // Readiness signal: the gateway is considered down once the breaker trips open.
  public isAvailable(): boolean {
    return !this.breaker.opened;
  }

  public async processPayment(
    amount: number,
    currency: string
  ): Promise<PaymentResponse> {
    try {
      const result = await this.breaker.fire({ amount, currency });
      return result;
    } catch (error) {
      logger.error({ err: error }, 'Payment processing failed unexpectedly');
      throw new Error('Payment processing failed');
    }
  }
}
