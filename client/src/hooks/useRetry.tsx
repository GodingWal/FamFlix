import { useState, useCallback } from 'react';
import { toast } from '@/hooks/use-toast';

interface RetryOptions {
  maxAttempts?: number;
  delay?: number;
  backoff?: 'linear' | 'exponential';
  onRetry?: (attempt: number, error: Error) => void;
  onMaxAttemptsReached?: (error: Error) => void;
}

interface RetryState {
  isRetrying: boolean;
  attempts: number;
  lastError: Error | null;
}

export const useRetry = (options: RetryOptions = {}) => {
  const {
    maxAttempts = 3,
    delay = 1000,
    backoff = 'exponential',
    onRetry,
    onMaxAttemptsReached
  } = options;

  const [state, setState] = useState<RetryState>({
    isRetrying: false,
    attempts: 0,
    lastError: null
  });

  const calculateDelay = useCallback((attempt: number): number => {
    if (backoff === 'exponential') {
      return delay * Math.pow(2, attempt - 1);
    }
    return delay * attempt;
  }, [delay, backoff]);

  const retry = useCallback(async <T,>(
    operation: () => Promise<T>,
    customOptions?: Partial<RetryOptions>
  ): Promise<T> => {
    const opts = { ...options, ...customOptions };
    const maxRetries = opts.maxAttempts || maxAttempts;
    
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        setState(prev => ({ ...prev, attempts: attempt, isRetrying: attempt > 1 }));
        
        const result = await operation();
        
        // Success - reset state
        setState({ isRetrying: false, attempts: 0, lastError: null });
        return result;
        
      } catch (error) {
        lastError = error as Error;
        setState(prev => ({ ...prev, lastError }));
        
        if (attempt < maxRetries) {
          const retryDelay = calculateDelay(attempt);
          
          onRetry?.(attempt, lastError);
          
          toast({
            title: "Retrying...",
            description: `Attempt ${attempt} failed. Retrying in ${retryDelay / 1000}s...`,
            variant: "default",
          });
          
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        } else {
          // Max attempts reached
          setState(prev => ({ ...prev, isRetrying: false }));
          onMaxAttemptsReached?.(lastError);
          
          toast({
            title: "Operation Failed",
            description: `Failed after ${maxRetries} attempts. Please try again later.`,
            variant: "destructive",
          });
          
          throw lastError;
        }
      }
    }
    
    throw lastError!;
  }, [maxAttempts, calculateDelay, onRetry, onMaxAttemptsReached, options]);

  const reset = useCallback(() => {
    setState({ isRetrying: false, attempts: 0, lastError: null });
  }, []);

  return {
    retry,
    reset,
    ...state
  };
};

// Specialized hook for API calls
export const useApiRetry = () => {
  return useRetry({
    maxAttempts: 3,
    delay: 1000,
    backoff: 'exponential',
    onRetry: (attempt, error) => {
      console.warn(`API call failed, attempt ${attempt}:`, error.message);
    },
    onMaxAttemptsReached: (error) => {
      console.error('API call failed after all retry attempts:', error);
    }
  });
};
