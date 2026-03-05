import CircuitBreaker from 'opossum';
import axios from 'axios';
import { logger } from '../observability/logger';
import { env } from '../../../config/env';

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
      timeout: 3000, 
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

  private async makeHttpRequest(payload: PaymentPayload): Promise<PaymentResponse> {
    const response = await axios.post(`${env.STRIPE_API_URL}/charges`, payload);
    return { success: true, transactionId: response.data.id };
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