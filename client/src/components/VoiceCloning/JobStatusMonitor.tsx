import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Clock, 
  CheckCircle, 
  AlertTriangle, 
  Loader2, 
  RefreshCw,
  Download,
  Play,
  Eye,
  Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

export interface VoiceJob {
  id: string;
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  stage: string;
  estimatedTime?: number;
  startTime: Date;
  completedTime?: Date;
  error?: string;
  result?: {
    voiceId: string;
    sampleUrl: string;
    qualityScore: number;
  };
}

interface JobStatusMonitorProps {
  jobs: VoiceJob[];
  onRefresh: () => void;
  onCancel?: (jobId: string) => void;
  onRetry?: (jobId: string) => void;
  onPlaySample?: (sampleUrl: string) => void;
  onViewDetails?: (jobId: string) => void;
}

const JOB_STAGES = {
  pending: 'Waiting in queue',
  uploading: 'Uploading audio files',
  preprocessing: 'Processing audio quality',
  training: 'Training voice model',
  validation: 'Validating voice quality',
  finalizing: 'Finalizing voice profile',
  completed: 'Voice profile ready',
  failed: 'Processing failed'
};

export const JobStatusMonitor: React.FC<JobStatusMonitorProps> = ({
  jobs,
  onRefresh,
  onCancel,
  onRetry,
  onPlaySample,
  onViewDetails,
}) => {
  const [expandedJobs, setExpandedJobs] = useState<Set<string>>(new Set());

  // Auto-refresh for active jobs
  useEffect(() => {
    const hasActiveJobs = jobs.some(job => 
      job.status === 'pending' || job.status === 'processing'
    );
    
    if (hasActiveJobs) {
      const interval = setInterval(onRefresh, 3000); // Refresh every 3 seconds
      return () => clearInterval(interval);
    }
  }, [jobs, onRefresh]);

  const toggleExpanded = (jobId: string) => {
    setExpandedJobs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(jobId)) {
        newSet.delete(jobId);
      } else {
        newSet.add(jobId);
      }
      return newSet;
    });
  };

  const getStatusIcon = (status: VoiceJob['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'processing':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
    }
  };

  const getStatusBadgeVariant = (status: VoiceJob['status']) => {
    switch (status) {
      case 'pending':
        return 'secondary';
      case 'processing':
        return 'default';
      case 'completed':
        return 'default';
      case 'failed':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  const formatDuration = (startTime: Date, endTime?: Date) => {
    const end = endTime || new Date();
    const duration = Math.floor((end.getTime() - startTime.getTime()) / 1000);
    
    if (duration < 60) {
      return `${duration}s`;
    } else if (duration < 3600) {
      return `${Math.floor(duration / 60)}m ${duration % 60}s`;
    } else {
      const hours = Math.floor(duration / 3600);
      const minutes = Math.floor((duration % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  };

  const getEstimatedTimeRemaining = (job: VoiceJob) => {
    if (job.status !== 'processing' || !job.estimatedTime) return null;
    
    const elapsed = Math.floor((Date.now() - job.startTime.getTime()) / 1000);
    const remaining = Math.max(0, job.estimatedTime - elapsed);
    
    if (remaining < 60) {
      return `~${remaining}s remaining`;
    } else {
      return `~${Math.ceil(remaining / 60)}m remaining`;
    }
  };

  if (jobs.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <Zap className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No voice processing jobs yet</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Voice Processing Jobs</h3>
        <Button onClick={onRefresh} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {jobs.map((job) => {
        const isExpanded = expandedJobs.has(job.id);
        const estimatedTime = getEstimatedTimeRemaining(job);
        
        return (
          <Card key={job.id} className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getStatusIcon(job.status)}
                  <div>
                    <CardTitle className="text-base">{job.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {JOB_STAGES[job.stage as keyof typeof JOB_STAGES] || job.stage}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Badge variant={getStatusBadgeVariant(job.status)}>
                    {job.status}
                  </Badge>
                  <Button
                    onClick={() => toggleExpanded(job.id)}
                    variant="ghost"
                    size="sm"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-4">
              {/* Progress Bar */}
              {job.status === 'processing' && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Progress</span>
                    <span>{job.progress}%</span>
                  </div>
                  <Progress value={job.progress} className="w-full" />
                  {estimatedTime && (
                    <p className="text-xs text-muted-foreground text-right">
                      {estimatedTime}
                    </p>
                  )}
                </div>
              )}

              {/* Error Message */}
              {job.status === 'failed' && job.error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{job.error}</AlertDescription>
                </Alert>
              )}

              {/* Success Result */}
              {job.status === 'completed' && job.result && (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    Voice profile created successfully! Quality score: {job.result.qualityScore}/100
                  </AlertDescription>
                </Alert>
              )}

              {/* Expanded Details */}
              {isExpanded && (
                <div className="space-y-3 pt-3 border-t">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Started:</span>
                      <p className="text-muted-foreground">
                        {job.startTime.toLocaleString()}
                      </p>
                    </div>
                    
                    {job.completedTime && (
                      <div>
                        <span className="font-medium">Completed:</span>
                        <p className="text-muted-foreground">
                          {job.completedTime.toLocaleString()}
                        </p>
                      </div>
                    )}
                    
                    <div>
                      <span className="font-medium">Duration:</span>
                      <p className="text-muted-foreground">
                        {formatDuration(job.startTime, job.completedTime)}
                      </p>
                    </div>
                    
                    {job.result && (
                      <div>
                        <span className="font-medium">Voice ID:</span>
                        <p className="text-muted-foreground font-mono text-xs">
                          {job.result.voiceId}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Processing Stages */}
                  {job.status === 'processing' && (
                    <div className="space-y-2">
                      <span className="font-medium text-sm">Processing Stages:</span>
                      <div className="grid grid-cols-1 gap-1">
                        {Object.entries(JOB_STAGES).slice(1, -2).map(([stage, label]) => {
                          const isCurrentStage = job.stage === stage;
                          const isCompleted = job.progress > (Object.keys(JOB_STAGES).indexOf(stage) * 20);
                          
                          return (
                            <div
                              key={stage}
                              className={cn(
                                "flex items-center gap-2 text-xs p-2 rounded",
                                isCurrentStage ? "bg-primary/10 text-primary" :
                                isCompleted ? "bg-green-50 text-green-700" :
                                "text-muted-foreground"
                              )}
                            >
                              {isCompleted ? (
                                <CheckCircle className="h-3 w-3" />
                              ) : isCurrentStage ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Clock className="h-3 w-3" />
                              )}
                              {label}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                {job.status === 'completed' && job.result && (
                  <>
                    {onPlaySample && (
                      <Button
                        onClick={() => onPlaySample(job.result!.sampleUrl)}
                        variant="outline"
                        size="sm"
                      >
                        <Play className="h-4 w-4 mr-2" />
                        Play Sample
                      </Button>
                    )}
                    <Button
                      onClick={() => {
                        navigator.clipboard.writeText(job.result!.voiceId);
                        toast({
                          title: "Copied!",
                          description: "Voice ID copied to clipboard",
                        });
                      }}
                      variant="outline"
                      size="sm"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Copy Voice ID
                    </Button>
                  </>
                )}

                {job.status === 'failed' && onRetry && (
                  <Button
                    onClick={() => onRetry(job.id)}
                    variant="outline"
                    size="sm"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry
                  </Button>
                )}

                {(job.status === 'pending' || job.status === 'processing') && onCancel && (
                  <Button
                    onClick={() => onCancel(job.id)}
                    variant="outline"
                    size="sm"
                  >
                    Cancel
                  </Button>
                )}

                {onViewDetails && (
                  <Button
                    onClick={() => onViewDetails(job.id)}
                    variant="ghost"
                    size="sm"
                  >
                    View Details
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
