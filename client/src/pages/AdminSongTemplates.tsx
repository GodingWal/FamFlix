import React, { useEffect, useState } from 'react';
import {
    Upload,
    Music,
    Trash2,
    Play,
    Pause,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Navigation } from '@/components/Navigation';

type SongTemplate = {
    id: string;
    title: string;
    description?: string;
    guideAudioUrl: string;
    lyrics?: string;
    key?: string;
    tempo?: number;
    durationSec?: number;
    createdAt: string;
};

export default function AdminSongTemplates() {
    const { toast } = useToast();
    const [templates, setTemplates] = useState<SongTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form state
    const [file, setFile] = useState<File | null>(null);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [lyrics, setLyrics] = useState('');
    const [key, setKey] = useState('');
    const [tempo, setTempo] = useState('');

    const [playingId, setPlayingId] = useState<string | null>(null);
    const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);

    const loadTemplates = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/song-templates', { credentials: 'include' });
            if (!res.ok) throw new Error('Failed to fetch templates');
            const data = await res.json();
            setTemplates(data);
        } catch (err) {
            console.error(err);
            toast({
                title: 'Error',
                description: 'Failed to load song templates',
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadTemplates();
        return () => {
            if (audioEl) {
                audioEl.pause();
            }
        };
    }, []);

    const handlePlay = (url: string, id: string) => {
        if (playingId === id && audioEl) {
            audioEl.pause();
            setPlayingId(null);
            return;
        }

        if (audioEl) {
            audioEl.pause();
        }

        const audio = new Audio(url);
        audio.onended = () => setPlayingId(null);
        audio.play();
        setAudioEl(audio);
        setPlayingId(id);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this template?')) return;

        try {
            const res = await fetch(`/api/song-templates/${id}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            if (!res.ok) throw new Error('Failed to delete');

            toast({ title: 'Template deleted' });
            loadTemplates();
        } catch (err) {
            toast({
                title: 'Error',
                description: 'Failed to delete template',
                variant: 'destructive',
            });
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file || !title) return;

        setUploading(true);
        setError(null);

        try {
            const formData = new FormData();
            formData.append('guideAudio', file);
            formData.append('title', title);
            if (description) formData.append('description', description);
            if (lyrics) formData.append('lyrics', lyrics);
            if (key) formData.append('key', key);
            if (tempo) formData.append('tempo', tempo);

            const res = await fetch('/api/song-templates', {
                method: 'POST',
                body: formData,
                credentials: 'include',
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Upload failed');
            }

            toast({ title: 'Template uploaded successfully' });

            // Reset form
            setTitle('');
            setDescription('');
            setLyrics('');
            setKey('');
            setTempo('');
            setFile(null);

            loadTemplates();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="min-h-screen bg-background">
            <Navigation />
            <div className="container mx-auto py-10 space-y-8">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold">Song Templates</h1>
                        <p className="text-muted-foreground">Manage guide tracks for singing synthesis.</p>
                    </div>
                </div>

                <div className="grid gap-8 md:grid-cols-[1fr_2fr]">
                    {/* Upload Form */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Add New Template</CardTitle>
                            <CardDescription>Upload a guide audio file (WAV/MP3) for voice synthesis.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Title</label>
                                    <Input
                                        value={title}
                                        onChange={e => setTitle(e.target.value)}
                                        placeholder="e.g., Twinkle Twinkle Little Star"
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Guide Audio</label>
                                    <Input
                                        type="file"
                                        accept="audio/*"
                                        onChange={e => setFile(e.target.files?.[0] ?? null)}
                                        required
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Key</label>
                                        <Input
                                            value={key}
                                            onChange={e => setKey(e.target.value)}
                                            placeholder="e.g., C Major"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Tempo (BPM)</label>
                                        <Input
                                            type="number"
                                            value={tempo}
                                            onChange={e => setTempo(e.target.value)}
                                            placeholder="120"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Description</label>
                                    <Textarea
                                        value={description}
                                        onChange={e => setDescription(e.target.value)}
                                        placeholder="Optional description..."
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Lyrics</label>
                                    <Textarea
                                        value={lyrics}
                                        onChange={e => setLyrics(e.target.value)}
                                        placeholder="Lyrics for reference..."
                                        className="min-h-[100px]"
                                    />
                                </div>

                                {error && (
                                    <Alert variant="destructive">
                                        <AlertTitle>Error</AlertTitle>
                                        <AlertDescription>{error}</AlertDescription>
                                    </Alert>
                                )}

                                <Button type="submit" className="w-full" disabled={uploading}>
                                    {uploading ? (
                                        <>
                                            <Upload className="mr-2 h-4 w-4 animate-spin" />
                                            Uploading...
                                        </>
                                    ) : (
                                        <>
                                            <Upload className="mr-2 h-4 w-4" />
                                            Upload Template
                                        </>
                                    )}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>

                    {/* Template List */}
                    <div className="space-y-4">
                        <h2 className="text-xl font-semibold">Library ({templates.length})</h2>
                        {loading ? (
                            <p>Loading...</p>
                        ) : templates.length === 0 ? (
                            <p className="text-muted-foreground">No templates found.</p>
                        ) : (
                            <div className="grid gap-4">
                                {templates.map(template => (
                                    <Card key={template.id}>
                                        <CardContent className="p-4 flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <Button
                                                    variant="outline"
                                                    size="icon"
                                                    className="h-10 w-10 rounded-full"
                                                    onClick={() => handlePlay(template.guideAudioUrl, template.id)}
                                                >
                                                    {playingId === template.id ? (
                                                        <Pause className="h-4 w-4" />
                                                    ) : (
                                                        <Play className="h-4 w-4 ml-0.5" />
                                                    )}
                                                </Button>
                                                <div>
                                                    <h3 className="font-medium">{template.title}</h3>
                                                    <div className="flex gap-2 text-xs text-muted-foreground">
                                                        {template.key && <span>{template.key}</span>}
                                                        {template.tempo && <span>{template.tempo} BPM</span>}
                                                    </div>
                                                </div>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-destructive hover:text-destructive/90"
                                                onClick={() => handleDelete(template.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
