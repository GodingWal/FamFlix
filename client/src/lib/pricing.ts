import type { SubscriptionPlan } from "@shared/subscriptions";

export interface PricingPlan {
  plan: SubscriptionPlan;
  name: string;
  priceMonthly: number;
  description: string;
  headline: string;
  features: string[];
  highlight?: boolean;
  limits: {
    videosPerMonth: number | 'unlimited';
    storiesPerMonth: number | 'unlimited';
    voiceClones: number;
    showAds: boolean;
  };
}

export const pricingPlans: PricingPlan[] = [
  {
    plan: "free",
    name: "Free",
    priceMonthly: 0,
    description: "Get started with basic features to explore the platform.",
    headline: "Try it free",
    features: [
      "2 videos per month",
      "2 stories per month",
      "1 voice clone",
      "Basic video exports",
      "Community support",
    ],
    limits: {
      videosPerMonth: 2,
      storiesPerMonth: 2,
      voiceClones: 1,
      showAds: true,
    },
  },
  {
    plan: "premium",
    name: "Premium",
    priceMonthly: 20,
    description: "Perfect for families who want more creative freedom.",
    headline: "Most popular choice",
    features: [
      "5 videos per month",
      "5 stories per month",
      "2 voice clones",
      "HD video exports",
      "No ads",
      "Priority support",
    ],
    highlight: true,
    limits: {
      videosPerMonth: 5,
      storiesPerMonth: 5,
      voiceClones: 2,
      showAds: false,
    },
  },
  {
    plan: "pro",
    name: "Pro",
    priceMonthly: 40,
    description: "For power users and content creators who need it all.",
    headline: "Unlimited creativity",
    features: [
      "Unlimited videos",
      "Unlimited stories",
      "5 voice clones",
      "4K video exports",
      "No ads",
      "Priority support",
      "API access",
    ],
    limits: {
      videosPerMonth: 'unlimited',
      storiesPerMonth: 'unlimited',
      voiceClones: 5,
      showAds: false,
    },
  },
];

export const formatMonthlyPrice = (price: number) => {
  if (price === 0) {
    return "$0";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(price);
};

export const getPricingPlan = (plan: SubscriptionPlan): PricingPlan | undefined =>
  pricingPlans.find((tier) => tier.plan === plan);
