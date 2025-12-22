import Stripe from "stripe";
import { config } from "../config";
import { logger } from "../utils/logger-simple";
import { storage } from "../storage";
import { subscriptionPlans, type SubscriptionPlan, PLAN_LIMITS } from "@shared/subscriptions";

const stripeApiVersion = "2024-06-20" as Stripe.LatestApiVersion;

type PaidSubscriptionPlan = Exclude<SubscriptionPlan, "free">;

const PLAN_DETAILS: Record<PaidSubscriptionPlan, { amount: number; name: string }> = {
  premium: {
    amount: 2000, // $20.00
    name: "FamFlix Premium",
  },
  pro: {
    amount: 4000, // $40.00
    name: "FamFlix Pro",
  },
};

const isPaidPlan = (plan: SubscriptionPlan): plan is PaidSubscriptionPlan => plan !== "free";

class BillingService {
  private readonly stripe: Stripe | null;
  private readonly webhookSecret?: string;

  constructor() {
    if (config.STRIPE_SECRET_KEY) {
      this.stripe = new Stripe(config.STRIPE_SECRET_KEY, {
        apiVersion: stripeApiVersion,
      });
      this.webhookSecret = config.STRIPE_WEBHOOK_SECRET;
    } else {
      this.stripe = null;
      this.webhookSecret = undefined;
      logger.warn("Stripe secret key not configured. Billing features are disabled.");
    }
  }

  isConfigured(): boolean {
    return Boolean(this.stripe);
  }

  async createCheckoutSession(user: { id: string; email: string }, plan: SubscriptionPlan) {
    if (!this.stripe) {
      throw new Error("Stripe is not configured");
    }

    if (!isPaidPlan(plan)) {
      throw new Error("Free plan does not require checkout");
    }

    const planDetails = PLAN_DETAILS[plan];
    if (!planDetails) {
      throw new Error("Unsupported subscription plan");
    }

    logger.info("Creating Stripe checkout session", { userId: user.id, plan });

    return this.stripe.checkout.sessions.create({
      mode: "subscription",
      client_reference_id: user.id,
      customer_email: user.email,
      success_url: `${config.CLIENT_URL}/pricing?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.CLIENT_URL}/pricing?status=cancelled`,
      metadata: {
        userId: user.id,
        plan,
      },
      subscription_data: {
        metadata: {
          userId: user.id,
          plan,
        },
      },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: planDetails.amount,
            recurring: {
              interval: "month",
            },
            product_data: {
              name: planDetails.name,
            },
          },
        },
      ],
      allow_promotion_codes: true,
      automatic_tax: { enabled: true },
    });
  }

  constructEvent(payload: Buffer | string, signature: string) {
    if (!this.stripe || !this.webhookSecret) {
      throw new Error("Stripe webhook handling is not configured");
    }

    return this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
  }

  async handleWebhookEvent(event: Stripe.Event) {
    try {
      switch (event.type) {
        case "checkout.session.completed":
          await this.handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
          break;
        case "customer.subscription.created":
        case "customer.subscription.updated":
          await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
          break;
        case "customer.subscription.deleted":
          await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
          break;
        default:
          logger.debug("Unhandled Stripe webhook event", { eventType: event.type });
      }
    } catch (error) {
      logger.error("Failed to process Stripe webhook event", { eventType: event.type, error });
      throw error;
    }
  }

  private async handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
    if (!this.stripe) {
      return;
    }

    const userId = session.metadata?.userId;
    const plan = session.metadata?.plan as SubscriptionPlan | undefined;

    if (!userId || !plan) {
      logger.warn("Checkout session missing metadata", { sessionId: session.id });
      return;
    }

    logger.info("Checkout session completed", { userId, plan, sessionId: session.id });

    const subscriptionId = typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;

    if (subscriptionId) {
      await this.syncSubscription(subscriptionId, userId, plan);
    } else {
      await this.updateUserPlan(userId, plan, null);
    }
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    const userId = subscription.metadata?.userId;
    const plan = subscription.metadata?.plan as SubscriptionPlan | undefined;

    if (!userId || !plan) {
      logger.warn("Subscription update missing metadata", { subscriptionId: subscription.id });
      return;
    }

    if (subscription.status === "canceled" || subscription.status === "unpaid" || subscription.status === "incomplete_expired") {
      await this.updateUserPlan(userId, "free", null);
      return;
    }

    const renewalTimestamp = this.getRenewalTimestamp(subscription);
    await this.updateUserPlan(userId, plan, renewalTimestamp);
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    const userId = subscription.metadata?.userId;

    if (!userId) {
      logger.warn("Subscription deletion missing user metadata", { subscriptionId: subscription.id });
      return;
    }

    await this.updateUserPlan(userId, "free", null);
  }

  private async syncSubscription(subscriptionId: string, userId: string, fallbackPlan: SubscriptionPlan) {
    if (!this.stripe) {
      return;
    }

    try {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
      const plan = (subscription.metadata?.plan as SubscriptionPlan | undefined) ?? fallbackPlan;
      const renewalTimestamp = this.getRenewalTimestamp(subscription);

      await this.updateUserPlan(userId, plan, renewalTimestamp);
    } catch (error) {
      logger.error("Failed to synchronize Stripe subscription", { subscriptionId, userId, error });
      throw error;
    }
  }

  private getRenewalTimestamp(subscription: Stripe.Subscription): number | null {
    const raw = (subscription as Stripe.Subscription & { current_period_end?: number }).current_period_end;
    if (typeof raw === "number") {
      return raw;
    }

    const alternate = (subscription as Stripe.Subscription & { current_period?: { end?: number } }).current_period?.end;
    return typeof alternate === "number" ? alternate : null;
  }

  private async updateUserPlan(userId: string, plan: SubscriptionPlan, renewalTimestamp: number | null) {
    const renewalDate = renewalTimestamp ? new Date(renewalTimestamp * 1000) : null;

    await storage.updateUser(userId, {
      plan,
      planRenewalAt: renewalDate,
    });

    logger.info("Updated user subscription", {
      userId,
      plan,
      renewalAt: renewalDate ? renewalDate.toISOString() : null,
    });
  }
}

export const billingService = new BillingService();
export { subscriptionPlans };
