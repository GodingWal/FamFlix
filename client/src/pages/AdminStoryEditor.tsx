import React, { useEffect, useState } from 'react';
import { useParams, useLocation } from 'wouter';
import {
    Save,
    ArrowLeft,
    Music,
    Mic,
    Play,
    Pause,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Navigation } from '@/components/Navigation';

type SongTemplate = {
    id: string;
    title: string;
    guideAudioUrl: string;
};

type StorySection = {
    id: string;
    sectionIndex: number;
    text: string;
    sectionType: 'speech' | 'singing';
    songTemplateId?: string;
};

type Story = {
    id: string;
    title: string;
    sections: StorySection[];
};

export default function AdminStoryEditor() {
    const { id } = useParams();
    const [story, setStory] = useState<Story | null>(null);
    const [templates, setTemplates] = useState<SongTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const { toast } = useToast();
    const [, setLocation] = useLocation();

    const [playingTemplateId, setPlayingTemplateId] = useState<string | null>(null);
    const [audioEl, setAudioEl] = useState<HTMLAudioElement | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [storyRes, templatesRes] = await Promise.all([
                    fetch(`/api/stories/${id}`, { credentials: 'include' }),
                    fetch('/api/song-templates', { credentials: 'include' })
                ]);

                if (!storyRes.ok) throw new Error('Failed to fetch story');
                if (!templatesRes.ok) throw new Error('Failed to fetch templates');

                const storyData = await storyRes.json();
                const templatesData = await templatesRes.json();

                setStory(storyData);
                setTemplates(templatesData);
            } catch (error) {
                console.error(error);
                toast({
                    title: 'Error',
                    description: 'Failed to load data',
                    variant: 'destructive',
                });
            } finally {
                setLoading(false);
            }
        };

        if (id) fetchData();

        return () => {
            if (audioEl) audioEl.pause();
        };
    }, [id]);

    const handleSectionChange = (index: number, field: keyof StorySection, value: any) => {
        if (!story) return;
        const newSections = [...story.sections];
        newSections[index] = { ...newSections[index], [field]: value };
        setStory({ ...story, sections: newSections });
    };

    const handleSave = async () => {
        if (!story) return;
        setSaving(true);
        try {
            // We need an endpoint to update sections. 
            // Existing stories-admin might not have a granular update, so we might need to add one.
            // Or we can use a PUT /api/stories/:id/sections endpoint.
            // For now, let's assume we'll create/use PUT /api/stories-admin/:id/sections

            const res = await fetch(`/api/stories-admin/${id}/sections`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sections: story.sections }),
                credentials: 'include',
            });

            if (!res.ok) throw new Error('Failed to save sections');

            toast({ title: 'Story updated successfully' });
        } catch (error) {
            console.error(error);
            toast({
                title: 'Error',
                description: 'Failed to save changes',
                variant: 'destructive',
            });
        } finally {
            setSaving(false);
        }
    };

    const togglePreview = (url: string, templateId: string) => {
        if (playingTemplateId === templateId && audioEl) {
            audioEl.pause();
            setPlayingTemplateId(null);
            return;
        }
        if (audioEl) audioEl.pause();
        const audio = new Audio(url);
        audio.onended = () => setPlayingTemplateId(null);
        audio.play();
        setAudioEl(audio);
        setPlayingTemplateId(templateId);
    };

    if (loading) return <div className="p-8 text-center">Loading...</div>;
    if (!story) return <div className="p-8 text-center">Story not found</div>;

    return (
        <div className="min-h-screen bg-background">
            <Navigation />
            <div className="container mx-auto py-8 space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" onClick={() => setLocation('/admin/upload-story')}>
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <div>
                            <h1 className="text-2xl font-bold">{story.title}</h1>
                            <p className="text-muted-foreground">Edit Sections & Types</p>
                        </div>
                    </div>
                    <Button onClick={handleSave} disabled={saving}>
                        {saving ? <span className="animate-spin mr-2">⏳</span> : <Save className="mr-2 h-4 w-4" />}
                        Save Changes
                    </Button>
                </div>

                <div className="grid gap-6">
                    {story.sections.map((section, idx) => (
                        <Card key={section.id || idx} className="overflow-hidden">
                            <CardHeader className="bg-muted/30 py-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline">Section {section.sectionIndex + 1}</Badge>
                                        <Select
                                            value={section.sectionType || 'speech'}
                                            onValueChange={(val) => handleSectionChange(idx, 'sectionType', val)}
                                        >
                                            <SelectTrigger className="w-[140px] h-8">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="speech">
                                                    <div className="flex items-center gap-2">
                                                        <Mic className="h-3 w-3" /> Speech
                                                    </div>
                                                </SelectItem>
                                                <SelectItem value="singing">
                                                    <div className="flex items-center gap-2">
                                                        <Music className="h-3 w-3" /> Singing
                                                    </div>
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="p-4 space-y-4">
                                <Textarea
                                    value={section.text}
                                    onChange={(e) => handleSectionChange(idx, 'text', e.target.value)}
                                    className="min-h-[100px] font-serif text-lg"
                                />

                                {section.sectionType === 'singing' && (
                                    <div className="flex items-center gap-4 p-4 bg-secondary/20 rounded-lg border border-secondary">
                                        <div className="flex-1">
                                            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                                                Song Template (Guide Track)
                                            </label>
                                            <Select
                                                value={section.songTemplateId || ''}
                                                onValueChange={(val) => handleSectionChange(idx, 'songTemplateId', val)}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select a song template..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {templates.map(t => (
                                                        <SelectItem key={t.id} value={t.id}>
                                                            {t.title}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        {section.songTemplateId && (
                                            <div className="pt-6">
                                                {(() => {
                                                    const t = templates.find(temp => temp.id === section.songTemplateId);
                                                    if (!t) return null;
                                                    return (
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => togglePreview(t.guideAudioUrl, t.id)}
                                                        >
                                                            {playingTemplateId === t.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                                                        </Button>
                                                    );
                                                })()}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    );
}
