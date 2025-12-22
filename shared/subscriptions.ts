export const subscriptionPlans = ["free", "premium", "pro"] as const satisfies readonly [string, ...string[]];

export type SubscriptionPlan = typeof subscriptionPlans[number];

export interface PlanLimits {
  videosPerMonth: number;
  storiesPerMonth: number;
  voiceClones: number;
  showAds: boolean;
  price: number;
  name: string;
  description: string;
  features: string[];
}

export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  free: {
    videosPerMonth: 2,
    storiesPerMonth: 2,
    voiceClones: 1,
    showAds: true,
    price: 0,
    name: "Free",
    description: "Get started with basic features",
    features: [
      "2 videos per month",
      "2 stories per month",
      "1 voice clone",
      "Basic support",
      "Watermarked exports"
    ]
  },
  premium: {
    videosPerMonth: 5,
    storiesPerMonth: 5,
    voiceClones: 2,
    showAds: false,
    price: 20,
    name: "Premium",
    description: "Perfect for families",
    features: [
      "5 videos per month",
      "5 stories per month",
      "2 voice clones",
      "No ads",
      "Priority support",
      "HD exports"
    ]
  },
  pro: {
    videosPerMonth: -1, // -1 means unlimited
    storiesPerMonth: -1,
    voiceClones: 5,
    showAds: false,
    price: 40,
    name: "Pro",
    description: "For power users and creators",
    features: [
      "Unlimited videos",
      "Unlimited stories",
      "5 voice clones",
      "No ads",
      "Priority support",
      "4K exports",
      "API access"
    ]
  }
};

export function getPlanLimits(plan: SubscriptionPlan): PlanLimits {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

export function canCreateVideo(plan: SubscriptionPlan, currentCount: number): boolean {
  const limits = getPlanLimits(plan);
  return limits.videosPerMonth === -1 || currentCount < limits.videosPerMonth;
}

export function canCreateStory(plan: SubscriptionPlan, currentCount: number): boolean {
  const limits = getPlanLimits(plan);
  return limits.storiesPerMonth === -1 || currentCount < limits.storiesPerMonth;
}

export function canCreateVoiceClone(plan: SubscriptionPlan, currentCount: number): boolean {
  const limits = getPlanLimits(plan);
  return currentCount < limits.voiceClones;
}

export function getRemainingVideos(plan: SubscriptionPlan, currentCount: number): number | 'unlimited' {
  const limits = getPlanLimits(plan);
  if (limits.videosPerMonth === -1) return 'unlimited';
  return Math.max(0, limits.videosPerMonth - currentCount);
}

export function getRemainingStories(plan: SubscriptionPlan, currentCount: number): number | 'unlimited' {
  const limits = getPlanLimits(plan);
  if (limits.storiesPerMonth === -1) return 'unlimited';
  return Math.max(0, limits.storiesPerMonth - currentCount);
}

export function getRemainingVoiceClones(plan: SubscriptionPlan, currentCount: number): number {
  const limits = getPlanLimits(plan);
  return Math.max(0, limits.voiceClones - currentCount);
}
