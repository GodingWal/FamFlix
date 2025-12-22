import { useMemo } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { loadStripe } from "@stripe/stripe-js";
import { format } from "date-fns";
import { Navigation } from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, ApiError } from "@/lib/queryClient";
import { pricingPlans, formatMonthlyPrice, getPricingPlan } from "@/lib/pricing";
import type { SubscriptionPlan } from "@shared/subscriptions";

const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

export default function Pricing() {
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const currentPlanDetails = useMemo(() => (
    user ? getPricingPlan(user.plan) : undefined
  ), [user]);

  const renewalDate = useMemo(() => {
    if (!user?.planRenewalAt) {
      return null;
    }

    const date = new Date(user.planRenewalAt);
    return Number.isNaN(date.getTime()) ? null : format(date, "PPP");
  }, [user?.planRenewalAt]);

  const checkoutMutation = useMutation({
    mutationFn: async (plan: SubscriptionPlan) => {
      const response = await apiRequest("POST", "/api/billing/checkout", { plan });
      return response.json() as Promise<{ sessionId: string }>;
    },
    onSuccess: async ({ sessionId }) => {
      if (!sessionId) {
        throw new Error("Missing Stripe checkout session identifier");
      }

      if (!stripePromise) {
        toast({
          title: "Checkout created",
          description: "Stripe publishable key is not configured. Please contact support to complete your upgrade.",
          variant: "destructive",
        });
        return;
      }

      const stripe = await stripePromise;
      if (!stripe) {
        throw new Error("Stripe failed to initialize. Please refresh and try again.");
      }

      const { error } = await stripe.redirectToCheckout({ sessionId });
      if (error) {
        throw new Error(error.message);
      }
    },
    onError: (error) => {
      const message = error instanceof ApiError
        ? error.message
        : error instanceof Error
          ? error.message
          : "We couldn't start the checkout process. Please try again.";

      toast({
        title: "Upgrade failed",
        description: message,
        variant: "destructive",
      });
    },
  });

  const handleUpgrade = (plan: SubscriptionPlan) => {
    if (plan === "free") {
      return;
    }

    if (!isAuthenticated) {
      navigate("/login");
      return;
    }

    checkoutMutation.mutate(plan);
  };

  const stripeConfigured = Boolean(publishableKey);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navigation />
      <main className="pt-20 pb-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <section className="text-center space-y-4">
            <Badge variant="outline" className="uppercase tracking-wide">Flexible plans for every family</Badge>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">Choose the perfect FamFlix plan</h1>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Start free and unlock premium storytelling experiences with advanced voice cloning, cinematic exports,
              and collaborative family workspaces.
            </p>
            {user && (
              <div className="flex flex-col sm:flex-row gap-2 justify-center items-center text-sm text-muted-foreground">
                <span>
                  Current plan: <span className="font-medium text-foreground">{currentPlanDetails?.name ?? user.plan}</span>
                </span>
                {renewalDate && (
                  <span className="flex items-center gap-2">
                    <i className="fas fa-rotate fa-sm text-primary" aria-hidden="true"></i>
                    Renews on {renewalDate}
                  </span>
                )}
              </div>
            )}
          </section>

          {!stripeConfigured && (
            <Alert variant="destructive" className="max-w-3xl mx-auto">
              <AlertTitle>Stripe is not configured</AlertTitle>
              <AlertDescription>
                Billing upgrades are temporarily unavailable while Stripe credentials are missing. Please contact support to
                complete an upgrade.
              </AlertDescription>
            </Alert>
          )}

          <section className="grid gap-8 md:grid-cols-3">
            {pricingPlans.map((plan) => {
              const isCurrentPlan = user?.plan === plan.plan;
              const isPaidPlan = plan.plan !== "free";
              const buttonLabel = !isAuthenticated && isPaidPlan
                ? "Sign in to upgrade"
                : isCurrentPlan
                  ? "Current plan"
                  : plan.plan === "free"
                    ? "Included"
                    : `Upgrade to ${plan.name}`;

              return (
                <Card
                  key={plan.plan}
                  className={`relative flex flex-col h-full ${plan.highlight ? 'border-primary shadow-lg' : ''}`}
                >
                  {plan.highlight && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
                      Most popular
                    </Badge>
                  )}
                  <CardHeader className="space-y-2 pb-6">
                    <CardTitle className="text-2xl flex items-center justify-between">
                      {plan.name}
                      {isCurrentPlan && (
                        <Badge variant="outline" className="text-xs">Active</Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="text-sm text-muted-foreground">
                      {plan.description}
                    </CardDescription>
                    <div className="text-left">
                      <p className="text-3xl font-bold">
                        {formatMonthlyPrice(plan.priceMonthly)}
                        <span className="text-base font-normal text-muted-foreground"> / month</span>
                      </p>
                      <p className="text-sm text-primary font-medium">{plan.headline}</p>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <ul className="space-y-3 text-sm">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-3">
                          <i className="fas fa-check text-primary mt-1" aria-hidden="true"></i>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter className="mt-auto">
                    <Button
                      className="w-full"
                      variant={plan.highlight ? "default" : "secondary"}
                      disabled={checkoutMutation.isPending || isCurrentPlan || plan.plan === "free"}
                      onClick={() => handleUpgrade(plan.plan)}
                    >
                      {checkoutMutation.isPending && isPaidPlan ? 'Connecting to Stripe…' : buttonLabel}
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </section>
        </div>
      </main>
    </div>
  );
}
