import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: string;
  check: (data: OnboardingData) => boolean;
}

interface OnboardingData {
  hasVoiceProfile: boolean;
  hasVideo: boolean;
  hasFamily: boolean;
}

const DISMISSED_KEY = "famflix_onboarding_dismissed";

const checklist: ChecklistItem[] = [
  {
    id: "voice",
    label: "Create your first voice profile",
    description: "Record or upload a voice sample for AI cloning",
    href: "/voice-cloning",
    icon: "fas fa-microphone",
    check: (d) => d.hasVoiceProfile,
  },
  {
    id: "video",
    label: "Create your first video",
    description: "Pick a template and generate a family video",
    href: "/create",
    icon: "fas fa-video",
    check: (d) => d.hasVideo,
  },
  {
    id: "family",
    label: "Set up your family",
    description: "Create a family group to collaborate with loved ones",
    href: "/videos",
    icon: "fas fa-users",
    check: (d) => d.hasFamily,
  },
];

export function OnboardingChecklist() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(() =>
    localStorage.getItem(DISMISSED_KEY) === "true"
  );

  const { data: videos } = useQuery({
    queryKey: ["/api/videos"],
    enabled: !dismissed,
  });

  const { data: voiceProfiles } = useQuery({
    queryKey: ["/api/voice-profiles"],
    enabled: !dismissed,
  });

  const { data: families } = useQuery({
    queryKey: ["/api/families"],
    enabled: !dismissed,
  });

  if (dismissed) return null;

  const data: OnboardingData = {
    hasVoiceProfile: Array.isArray(voiceProfiles) && voiceProfiles.length > 0,
    hasVideo: Array.isArray(videos) && videos.length > 0,
    hasFamily: Array.isArray(families) && families.length > 0,
  };

  const completed = checklist.filter((item) => item.check(data)).length;
  const progress = Math.round((completed / checklist.length) * 100);

  // Auto-dismiss when all steps done
  if (completed === checklist.length) {
    return null;
  }

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "true");
    setDismissed(true);
  };

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">
            Welcome to FamFlix{user?.firstName ? `, ${user.firstName}` : ""}!
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Dismiss onboarding checklist"
          >
            <i className="fas fa-times"></i>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Complete these steps to get the most out of the platform.
        </p>
        <div className="flex items-center gap-3 pt-2">
          <Progress value={progress} className="h-2 flex-1" />
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {completed}/{checklist.length} done
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {checklist.map((item) => {
          const done = item.check(data);
          return (
            <Link key={item.id} href={done ? "#" : item.href}>
              <div
                className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                  done
                    ? "bg-primary/10 opacity-70"
                    : "bg-card hover:bg-secondary/50 cursor-pointer"
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    done ? "bg-green-500/20 text-green-500" : "bg-primary/20 text-primary"
                  }`}
                >
                  {done ? (
                    <i className="fas fa-check text-sm"></i>
                  ) : (
                    <i className={`${item.icon} text-sm`}></i>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-medium ${
                      done ? "line-through text-muted-foreground" : ""
                    }`}
                  >
                    {item.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
                {!done && (
                  <i className="fas fa-chevron-right text-muted-foreground text-xs"></i>
                )}
              </div>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
