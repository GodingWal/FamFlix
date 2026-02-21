import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';

// Mock dependencies
vi.mock('../../server/storage', () => ({
  storage: {
    updateUser: vi.fn(),
    getUser: vi.fn(),
  },
}));

vi.mock('../../server/utils/logger-simple', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Config must be mocked before importing billingService
vi.mock('../../server/config', () => ({
  config: {
    STRIPE_SECRET_KEY: 'sk_test_mock',
    STRIPE_WEBHOOK_SECRET: 'whsec_test_mock',
    CLIENT_URL: 'http://localhost:5000',
    NODE_ENV: 'test',
  },
}));

const mockStripeSubscriptionsRetrieve = vi.fn();
const mockCheckoutSessionsCreate = vi.fn();
const mockWebhooksConstructEvent = vi.fn();

vi.mock('stripe', () => {
  const MockStripe = vi.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: mockCheckoutSessionsCreate,
      },
    },
    subscriptions: {
      retrieve: mockStripeSubscriptionsRetrieve,
    },
    webhooks: {
      constructEvent: mockWebhooksConstructEvent,
    },
  }));
  return { default: MockStripe };
});

// Import after mocks are set up
import { storage } from '../../server/storage';

// Dynamically import the billing service to pick up mocked deps
async function getBillingService() {
  // Reset module registry so config mock is used
  const mod = await import('../../server/services/billingService');
  return mod.billingService;
}

describe('BillingService.handleWebhookEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkout.session.completed', () => {
    it('upgrades user plan when checkout completes with subscriptionId', async () => {
      const billingService = await getBillingService();

      const mockSubscription = {
        id: 'sub_123',
        status: 'active',
        metadata: { userId: 'user_1', plan: 'premium' },
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
      } as unknown as Stripe.Subscription;

      mockStripeSubscriptionsRetrieve.mockResolvedValue(mockSubscription);

      const event = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_123',
            metadata: { userId: 'user_1', plan: 'premium' },
            subscription: 'sub_123',
          } as unknown as Stripe.Checkout.Session,
        },
      } as Stripe.Event;

      await billingService.handleWebhookEvent(event);

      expect(mockStripeSubscriptionsRetrieve).toHaveBeenCalledWith('sub_123');
      expect(storage.updateUser).toHaveBeenCalledWith('user_1', expect.objectContaining({
        plan: 'premium',
        planRenewalAt: expect.any(Date),
      }));
    });

    it('upgrades user plan directly when checkout has no subscriptionId', async () => {
      const billingService = await getBillingService();

      const event = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_456',
            metadata: { userId: 'user_2', plan: 'pro' },
            subscription: null,
          } as unknown as Stripe.Checkout.Session,
        },
      } as Stripe.Event;

      await billingService.handleWebhookEvent(event);

      expect(mockStripeSubscriptionsRetrieve).not.toHaveBeenCalled();
      expect(storage.updateUser).toHaveBeenCalledWith('user_2', expect.objectContaining({
        plan: 'pro',
        planRenewalAt: null,
      }));
    });

    it('skips update when checkout session metadata is missing userId', async () => {
      const billingService = await getBillingService();

      const event = {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_789',
            metadata: {},
            subscription: null,
          } as unknown as Stripe.Checkout.Session,
        },
      } as Stripe.Event;

      await billingService.handleWebhookEvent(event);

      expect(storage.updateUser).not.toHaveBeenCalled();
    });
  });

  describe('customer.subscription.updated', () => {
    it('upgrades user plan when subscription becomes active', async () => {
      const billingService = await getBillingService();

      const event = {
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_active',
            status: 'active',
            metadata: { userId: 'user_3', plan: 'premium' },
            current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
          } as unknown as Stripe.Subscription,
        },
      } as Stripe.Event;

      await billingService.handleWebhookEvent(event);

      expect(storage.updateUser).toHaveBeenCalledWith('user_3', expect.objectContaining({
        plan: 'premium',
      }));
    });

    it('downgrades user to free plan when subscription is canceled', async () => {
      const billingService = await getBillingService();

      const event = {
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_canceled',
            status: 'canceled',
            metadata: { userId: 'user_4', plan: 'premium' },
          } as unknown as Stripe.Subscription,
        },
      } as Stripe.Event;

      await billingService.handleWebhookEvent(event);

      expect(storage.updateUser).toHaveBeenCalledWith('user_4', expect.objectContaining({
        plan: 'free',
        planRenewalAt: null,
      }));
    });

    it('downgrades user to free plan when subscription is unpaid', async () => {
      const billingService = await getBillingService();

      const event = {
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_unpaid',
            status: 'unpaid',
            metadata: { userId: 'user_5', plan: 'pro' },
          } as unknown as Stripe.Subscription,
        },
      } as Stripe.Event;

      await billingService.handleWebhookEvent(event);

      expect(storage.updateUser).toHaveBeenCalledWith('user_5', expect.objectContaining({
        plan: 'free',
        planRenewalAt: null,
      }));
    });

    it('skips update when subscription metadata is missing userId', async () => {
      const billingService = await getBillingService();

      const event = {
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_nometa',
            status: 'active',
            metadata: {},
          } as unknown as Stripe.Subscription,
        },
      } as Stripe.Event;

      await billingService.handleWebhookEvent(event);

      expect(storage.updateUser).not.toHaveBeenCalled();
    });
  });

  describe('customer.subscription.deleted', () => {
    it('downgrades user to free plan on subscription deletion', async () => {
      const billingService = await getBillingService();

      const event = {
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_deleted',
            status: 'canceled',
            metadata: { userId: 'user_6' },
          } as unknown as Stripe.Subscription,
        },
      } as Stripe.Event;

      await billingService.handleWebhookEvent(event);

      expect(storage.updateUser).toHaveBeenCalledWith('user_6', expect.objectContaining({
        plan: 'free',
        planRenewalAt: null,
      }));
    });

    it('skips update when deletion event has no userId in metadata', async () => {
      const billingService = await getBillingService();

      const event = {
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_nometa2',
            status: 'canceled',
            metadata: {},
          } as unknown as Stripe.Subscription,
        },
      } as Stripe.Event;

      await billingService.handleWebhookEvent(event);

      expect(storage.updateUser).not.toHaveBeenCalled();
    });
  });

  describe('unhandled event types', () => {
    it('does not throw and does not update storage for unknown event types', async () => {
      const billingService = await getBillingService();

      const event = {
        type: 'payment_intent.created',
        data: { object: {} },
      } as unknown as Stripe.Event;

      await expect(billingService.handleWebhookEvent(event)).resolves.not.toThrow();
      expect(storage.updateUser).not.toHaveBeenCalled();
    });
  });
});

describe('BillingService.isConfigured', () => {
  it('returns true when Stripe secret key is provided', async () => {
    const billingService = await getBillingService();
    expect(billingService.isConfigured()).toBe(true);
  });
});
