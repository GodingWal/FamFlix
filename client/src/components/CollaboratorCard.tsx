import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface CollaboratorCardProps {
  collaborator: {
    id: string;
    user: {
      id: string;
      firstName?: string;
      lastName?: string;
      username: string;
      avatar?: string;
    };
    isActive: boolean;
    lastActivity: string;
    sessionData?: {
      currentAction?: string;
      currentProject?: string;
    };
  };
  onViewActivity?: () => void;
}

export function CollaboratorCard({ collaborator, onViewActivity }: CollaboratorCardProps) {
  const getActivityIcon = (action?: string) => {
    switch (action) {
      case 'editing':
        return 'fa-edit';
      case 'recording':
        return 'fa-microphone';
      case 'reviewing':
        return 'fa-eye';
      case 'uploading':
        return 'fa-upload';
      default:
        return 'fa-user';
    }
  };

  const getActivityText = (action?: string) => {
    switch (action) {
      case 'editing':
        return 'Editing timeline';
      case 'recording':
        return 'Recording voice';
      case 'reviewing':
        return 'Reviewing content';
      case 'uploading':
        return 'Uploading files';
      default:
        return 'Active';
    }
  };

  const formatLastActivity = (dateString: string) => {
    const now = new Date();
    const activity = new Date(dateString);
    const diffInMinutes = Math.floor((now.getTime() - activity.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'just now';
    if (diffInMinutes < 60) return `${diffInMinutes} min ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)} hr ago`;
    return `${Math.floor(diffInMinutes / 1440)} day ago`;
  };

  const displayName = collaborator.user.firstName && collaborator.user.lastName
    ? `${collaborator.user.firstName} ${collaborator.user.lastName}`
    : collaborator.user.username;

  return (
    <Card 
      className="bg-secondary/50 hover:bg-secondary/70 transition-colors"
      data-testid={`collaborator-${collaborator.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {/* Avatar */}
            <div className="relative">
              {collaborator.user.avatar ? (
                <img 
                  src={collaborator.user.avatar} 
                  alt={displayName}
                  className="w-10 h-10 rounded-full"
                />
              ) : (
                <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center">
                  <i className="fas fa-user text-primary"></i>
                </div>
              )}
              
              {/* Online Status Indicator */}
              <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-background ${
                collaborator.isActive ? 'bg-green-500' : 'bg-gray-400'
              }`} />
            </div>
            
            {/* User Info */}
            <div className="flex-1">
              <h4 className="font-medium" data-testid="collaborator-name">
                {displayName}
              </h4>
              <div className="flex items-center space-x-2 mt-1">
                <p className="text-xs text-muted-foreground flex items-center">
                  <i className={`fas ${getActivityIcon(collaborator.sessionData?.currentAction)} mr-1`}></i>
                  {getActivityText(collaborator.sessionData?.currentAction)}
                </p>
                {collaborator.isActive && (
                  <Badge variant="secondary" className="text-xs px-2 py-0">
                    Online
                  </Badge>
                )}
              </div>
            </div>
          </div>
          
          {/* Actions */}
          <div className="flex items-center space-x-2">
            <div className="text-right">
              <p className="text-xs text-muted-foreground" data-testid="last-activity">
                {formatLastActivity(collaborator.lastActivity)}
              </p>
              {collaborator.sessionData?.currentProject && (
                <p className="text-xs text-primary truncate max-w-20">
                  {collaborator.sessionData.currentProject}
                </p>
              )}
            </div>
            
            {onViewActivity && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onViewActivity}
                className="text-muted-foreground hover:text-primary"
                data-testid="button-view-activity"
              >
                <i className="fas fa-eye"></i>
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
