import { useUsage } from "@/hooks/useUsage";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { X, Sparkles } from "lucide-react";
import { useState } from "react";

interface AdBannerProps {
  placement?: "sidebar" | "inline" | "banner";
  className?: string;
}

export function AdBanner({ placement = "banner", className = "" }: AdBannerProps) {
  const { isAuthenticated } = useAuth();
  const { showAds, usage } = useUsage();
  const [dismissed, setDismissed] = useState(false);

  if (!isAuthenticated || !showAds || dismissed) {
    return null;
  }

  const bannerContent = () => {
    switch (placement) {
      case "sidebar":
        return (
          <div className={`bg-gradient-to-br from-brand-green/10 to-brand-gold/10 border border-brand-green/20 rounded-lg p-4 ${className}`}>
            <div className="flex items-start justify-between mb-2">
              <Sparkles className="h-5 w-5 text-brand-green" />
              <button 
                onClick={() => setDismissed(true)}
                className="text-muted-foreground hover:text-foreground p-1"
                aria-label="Dismiss ad"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <h4 className="font-semibold text-sm mb-1">Upgrade to Premium</h4>
            <p className="text-xs text-muted-foreground mb-3">
              Remove ads and unlock more videos, stories, and voice clones.
            </p>
            <Link href="/pricing">
              <Button size="sm" variant="secondary" className="w-full text-xs">
                View Plans
              </Button>
            </Link>
          </div>
        );

      case "inline":
        return (
          <div className={`bg-muted/50 border rounded-lg p-3 flex items-center justify-between ${className}`}>
            <div className="flex items-center gap-3">
              <div className="bg-brand-green/20 p-2 rounded-full">
                <Sparkles className="h-4 w-4 text-brand-green" />
              </div>
              <div>
                <p className="text-sm font-medium">Want more features?</p>
                <p className="text-xs text-muted-foreground">
                  {usage?.remaining?.videos !== 'unlimited' 
                    ? `${usage?.remaining?.videos} videos remaining this month` 
                    : 'Upgrade for unlimited access'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/pricing">
                <Button size="sm" variant="outline" className="text-xs">
                  Upgrade
                </Button>
              </Link>
              <button 
                onClick={() => setDismissed(true)}
                className="text-muted-foreground hover:text-foreground p-1"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        );

      case "banner":
      default:
        return (
          <div className={`bg-gradient-to-r from-brand-green/20 via-brand-gold/10 to-brand-green/20 border-y border-brand-green/20 py-2 px-4 ${className}`}>
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Sparkles className="h-4 w-4 text-brand-green" />
                <span className="text-sm">
                  <span className="font-medium">Free Plan:</span>
                  <span className="text-muted-foreground ml-2">
                    {usage?.remaining?.videos !== 'unlimited' 
                      ? `${usage?.remaining?.videos} videos left this month` 
                      : 'Upgrade for unlimited access'}
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Link href="/pricing">
                  <Button size="sm" variant="secondary" className="text-xs h-7">
                    Upgrade Now
                  </Button>
                </Link>
                <button 
                  onClick={() => setDismissed(true)}
                  className="text-muted-foreground hover:text-foreground p-1"
                  aria-label="Dismiss banner"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        );
    }
  };

  return bannerContent();
}
