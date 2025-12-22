import { useUsage } from "@/hooks/useUsage";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Video, BookOpen, Mic2, TrendingUp } from "lucide-react";

interface UsageSummaryProps {
  compact?: boolean;
  className?: string;
}

export function UsageSummary({ compact = false, className = "" }: UsageSummaryProps) {
  const { usage, isLoading } = useUsage();

  if (isLoading || !usage) {
    return null;
  }

  const formatRemaining = (value: number | 'unlimited'): string => {
    if (value === 'unlimited') return 'Unlimited';
    return String(value);
  };

  const getProgressValue = (used: number, limit: number): number => {
    if (limit === -1) return 0;
    return Math.min(100, (used / limit) * 100);
  };

  const getProgressColor = (used: number, limit: number): string => {
    if (limit === -1) return 'bg-green-500';
    const percentage = (used / limit) * 100;
    if (percentage >= 100) return 'bg-red-500';
    if (percentage >= 80) return 'bg-yellow-500';
    return 'bg-primary';
  };

  if (compact) {
    return (
      <div className={`flex items-center gap-4 text-sm ${className}`}>
        <div className="flex items-center gap-1.5">
          <Video className="h-4 w-4 text-muted-foreground" />
          <span>
            {usage.remaining.videos === 'unlimited' 
              ? '∞' 
              : usage.remaining.videos} videos left
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
          <span>
            {usage.remaining.stories === 'unlimited' 
              ? '∞' 
              : usage.remaining.stories} stories left
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Mic2 className="h-4 w-4 text-muted-foreground" />
          <span>{usage.remaining.voiceClones} clones left</span>
        </div>
      </div>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Usage This Month
          </CardTitle>
          <Badge variant="outline" className="capitalize">
            {usage.plan} Plan
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Video className="h-4 w-4 text-muted-foreground" />
              <span>Videos</span>
            </div>
            <span className="text-muted-foreground">
              {usage.videosCreated} / {usage.limits.videosPerMonth === -1 ? '∞' : usage.limits.videosPerMonth}
            </span>
          </div>
          <Progress 
            value={getProgressValue(usage.videosCreated, usage.limits.videosPerMonth)} 
            className="h-2"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <span>Stories</span>
            </div>
            <span className="text-muted-foreground">
              {usage.storiesCreated} / {usage.limits.storiesPerMonth === -1 ? '∞' : usage.limits.storiesPerMonth}
            </span>
          </div>
          <Progress 
            value={getProgressValue(usage.storiesCreated, usage.limits.storiesPerMonth)} 
            className="h-2"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Mic2 className="h-4 w-4 text-muted-foreground" />
              <span>Voice Clones</span>
            </div>
            <span className="text-muted-foreground">
              {usage.voiceClones} / {usage.limits.voiceClones}
            </span>
          </div>
          <Progress 
            value={getProgressValue(usage.voiceClones, usage.limits.voiceClones)} 
            className="h-2"
          />
        </div>

        {usage.plan === 'free' && (
          <div className="pt-2 border-t">
            <Link href="/pricing">
              <Button variant="outline" size="sm" className="w-full">
                Upgrade for More
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
