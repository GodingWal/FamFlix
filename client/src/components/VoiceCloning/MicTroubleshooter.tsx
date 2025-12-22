import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Mic, CheckCircle, XCircle, AlertTriangle, RefreshCw } from 'lucide-react';

export const MicTroubleshooter: React.FC = () => {
    const [steps, setSteps] = useState([
        { id: 'browser', name: 'Browser Support', status: 'pending', message: '' },
        { id: 'permission', name: 'Microphone Permission', status: 'pending', message: '' },
        { id: 'stream', name: 'Audio Stream', status: 'pending', message: '' },
        { id: 'level', name: 'Audio Input', status: 'pending', message: '' },
    ]);
    const [isRunning, setIsRunning] = useState(false);
    const [audioLevel, setAudioLevel] = useState(0);
    const streamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const animationRef = useRef<number>();

    const updateStep = (id: string, status: 'success' | 'error' | 'running', message: string = '') => {
        setSteps(prev => prev.map(step =>
            step.id === id ? { ...step, status, message } : step
        ));
    };

    const runDiagnostics = async () => {
        setIsRunning(true);
        setAudioLevel(0);

        // Reset steps
        setSteps(prev => prev.map(step => ({ ...step, status: 'pending', message: '' })));

        try {
            // 1. Check Browser Support
            updateStep('browser', 'running');
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('navigator.mediaDevices.getUserMedia is not supported in this browser.');
            }
            if (typeof MediaRecorder === 'undefined') {
                throw new Error('MediaRecorder is not supported in this browser.');
            }
            updateStep('browser', 'success', 'Browser APIs are available.');

            // 2. Check Permission & Stream
            updateStep('permission', 'running');
            updateStep('stream', 'running');

            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: false
                    }
                });
                streamRef.current = stream;
                updateStep('permission', 'success', 'Permission granted.');

                const tracks = stream.getAudioTracks();
                if (tracks.length === 0) {
                    throw new Error('No audio tracks found in stream.');
                }
                updateStep('stream', 'success', `Stream active: ${tracks[0].label}`);

                // 3. Check Audio Input Level
                updateStep('level', 'running', 'Speak into your microphone...');

                const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                audioContextRef.current = audioContext;
                const analyser = audioContext.createAnalyser();
                const source = audioContext.createMediaStreamSource(stream);
                source.connect(analyser);

                analyser.fftSize = 256;
                const bufferLength = analyser.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);

                let maxLevel = 0;
                const startTime = Date.now();

                const checkLevel = () => {
                    analyser.getByteFrequencyData(dataArray);
                    let sum = 0;
                    for (let i = 0; i < bufferLength; i++) {
                        sum += dataArray[i];
                    }
                    const average = sum / bufferLength;
                    const normalized = average / 128;

                    setAudioLevel(normalized);
                    maxLevel = Math.max(maxLevel, normalized);

                    if (Date.now() - startTime < 5000) { // Test for 5 seconds
                        animationRef.current = requestAnimationFrame(checkLevel);
                    } else {
                        // Test finished
                        if (maxLevel > 0.01) {
                            updateStep('level', 'success', 'Audio input detected.');
                        } else {
                            updateStep('level', 'error', 'No audio detected. Check input volume/mute.');
                        }
                        cleanup();
                        setIsRunning(false);
                    }
                };

                checkLevel();

            } catch (err: any) {
                updateStep('permission', 'error', err.message);
                updateStep('stream', 'error', 'Failed to get stream.');
                updateStep('level', 'error', 'Skipped due to stream error.');
                setIsRunning(false);
            }

        } catch (error: any) {
            updateStep('browser', 'error', error.message);
            setIsRunning(false);
        }
    };

    const cleanup = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }
        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
        }
    };

    useEffect(() => {
        return cleanup;
    }, []);

    return (
        <Card className="w-full max-w-md mx-auto mt-4">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Mic className="w-5 h-5" />
                    Microphone Troubleshooter
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <Button onClick={runDiagnostics} disabled={isRunning} className="w-full">
                    {isRunning ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : null}
                    {isRunning ? 'Running Diagnostics...' : 'Start Diagnostics'}
                </Button>

                <div className="space-y-2">
                    {steps.map(step => (
                        <div key={step.id} className="flex items-center justify-between p-2 border rounded">
                            <div className="flex items-center gap-2">
                                {step.status === 'pending' && <div className="w-4 h-4 rounded-full bg-gray-200" />}
                                {step.status === 'running' && <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />}
                                {step.status === 'success' && <CheckCircle className="w-4 h-4 text-green-500" />}
                                {step.status === 'error' && <XCircle className="w-4 h-4 text-red-500" />}
                                <span className="font-medium">{step.name}</span>
                            </div>
                            <span className="text-xs text-gray-500 max-w-[150px] truncate" title={step.message}>
                                {step.message}
                            </span>
                        </div>
                    ))}
                </div>

                {isRunning && (
                    <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                            <span>Input Level</span>
                            <span>{(audioLevel * 100).toFixed(0)}%</span>
                        </div>
                        <Progress value={audioLevel * 100} className="h-2" />
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
