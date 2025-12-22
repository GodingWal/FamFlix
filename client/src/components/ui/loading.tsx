import React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  size = 'md', 
  className 
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };

  return (
    <Loader2 
      className={cn('animate-spin', sizeClasses[size], className)} 
    />
  );
};

interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className }) => {
  return (
    <div 
      className={cn(
        'animate-pulse rounded-md bg-muted', 
        className
      )} 
    />
  );
};

export const CardSkeleton: React.FC = () => {
  return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-20 w-full" />
      <div className="flex space-x-2">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-8 w-16" />
      </div>
    </div>
  );
};

export const TableSkeleton: React.FC<{ rows?: number; cols?: number }> = ({ 
  rows = 5, 
  cols = 4 
}) => {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex space-x-4">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
};

export const AvatarSkeleton: React.FC = () => {
  return <Skeleton className="h-10 w-10 rounded-full" />;
};

interface LoadingStateProps {
  loading: boolean;
  error?: Error | null;
  retry?: () => void;
  children: React.ReactNode;
  skeleton?: React.ReactNode;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  loading,
  error,
  retry,
  children,
  skeleton
}) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        {skeleton || (
          <div className="text-center">
            <LoadingSpinner size="lg" />
            <p className="mt-2 text-sm text-muted-foreground">Loading...</p>
          </div>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <p className="text-sm text-destructive mb-2">
            {error.message || 'Something went wrong'}
          </p>
          {retry && (
            <button
              onClick={retry}
              className="text-sm text-primary hover:underline"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
