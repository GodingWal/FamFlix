import { useRef, useCallback, useEffect } from 'react';

interface AudioWorkerMessage {
  type: 'success' | 'error';
  id: string;
  result?: any;
  error?: string;
}

interface AudioWorkerRequest {
  type: string;
  data: any;
  id: string;
}

type PendingRequestEntry = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
};

export const useAudioWorker = () => {
  const workerRef = useRef<Worker | null>(null);
  const pendingRequests = useRef<Map<string, PendingRequestEntry>>(new Map());

  useEffect(() => {
    // Initialize worker
    workerRef.current = new Worker('/audio-worker.js');
    
    workerRef.current.onmessage = (e: MessageEvent<AudioWorkerMessage>) => {
      const { type, id, result, error } = e.data;
      const request = pendingRequests.current.get(id);
      
      if (request) {
        if (type === 'success') {
          request.resolve(result);
        } else {
          request.reject(new Error(error || 'Worker error'));
        }
        pendingRequests.current.delete(id);
      }
    };

    workerRef.current.onerror = (error) => {
      console.error('Audio worker error:', error);
      // Reject all pending requests
      pendingRequests.current.forEach(({ reject }) => {
        reject(new Error('Worker error'));
      });
      pendingRequests.current.clear();
    };

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

  const sendMessage = useCallback(<TResult = unknown>(type: string, data: unknown): Promise<TResult> => {
    return new Promise<TResult>((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Worker not initialized'));
        return;
      }

      const id = Math.random().toString(36).substr(2, 9);
      pendingRequests.current.set(id, {
        resolve: (value: unknown) => resolve(value as TResult),
        reject,
      });

      const message: AudioWorkerRequest = { type, data, id };
      workerRef.current.postMessage(message);

      // Timeout after 30 seconds
      setTimeout(() => {
        if (pendingRequests.current.has(id)) {
          pendingRequests.current.delete(id);
          reject(new Error('Worker request timeout'));
        }
      }, 30000);
    });
  }, []);

  const combineAudioBuffers = useCallback(async (audioBuffers: AudioBuffer[]): Promise<ArrayBuffer> => {
    // Convert AudioBuffers to transferable data
    const audioBuffersData = audioBuffers.map(buffer => ({
      numberOfChannels: buffer.numberOfChannels,
      length: buffer.length,
      sampleRate: buffer.sampleRate,
      channelData: Array.from({ length: buffer.numberOfChannels }, (_, i) => 
        Array.from(buffer.getChannelData(i))
      )
    }));

    return sendMessage<ArrayBuffer>('combineAudio', { audioBuffers: audioBuffersData });
  }, [sendMessage]);

  const analyzeAudioQuality = useCallback(async (audioBuffer: AudioBuffer) => {
    const audioBufferData = {
      numberOfChannels: audioBuffer.numberOfChannels,
      length: audioBuffer.length,
      sampleRate: audioBuffer.sampleRate,
      channelData: Array.from({ length: audioBuffer.numberOfChannels }, (_, i) => 
        Array.from(audioBuffer.getChannelData(i))
      )
    };

    return sendMessage('analyzeQuality', { audioBuffer: audioBufferData });
  }, [sendMessage]);

  return {
    combineAudioBuffers,
    analyzeAudioQuality,
    isWorkerReady: !!workerRef.current
  };
};
