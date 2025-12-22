import React, { useEffect, useMemo, useState } from 'react';
import {
  Upload,
  Film,
  Sparkles,
  Image as ImageIcon,
  Clock3,
  Tags,
  Filter,
  Search,
  Library,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';

type TemplateVideoMetadata = {
  pipelineStatus?: string;
  pipeline?: {
    status?: string;
    error?: string;
  };
  sourceVideoId?: string;
};

type TemplateVideo = {
  id: number;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  videoUrl: string;
  duration?: number;
  category?: string;
  tags?: string[];
  difficulty?: string;
  isActive?: boolean;
  createdAt?: string;
  metadata?: TemplateVideoMetadata;
};

const difficultyOptions = [
  { value: 'easy', label: 'Easy – intro friendly' },
  { value: 'medium', label: 'Medium – balanced guidance' },
  { value: 'hard', label: 'Advanced – detailed workflow' },
];

const defaultCategories = ['family', 'holiday', 'birthday', 'celebration', 'travel'];

export default function AdminTemplateUpload() {
  const { toast } = useToast();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [videos, setVideos] = useState<TemplateVideo[]>([]);
  const [videosLoading, setVideosLoading] = useState(true);

  const [file, setFile] = useState<File | null>(null);
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('family');
  const [tags, setTags] = useState('');
  const [difficulty, setDifficulty] = useState('easy');
  const [duration, setDuration] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterDifficulty, setFilterDifficulty] = useState('all');

  const canSubmit = Boolean(file && title.trim().length > 0 && !uploading);

  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (!res.ok) {
          setIsAdmin(false);
          return;
        }
        const me = await res.json();
        setIsAdmin(me.role === 'admin');
      } catch {
        setIsAdmin(false);
      }
    };
    checkAdmin();
  }, []);

  const loadVideos = async () => {
    if (!isAdmin) return;
    setVideosLoading(true);
    try {
      const res = await fetch('/api/template-videos', { credentials: 'include' });

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error('Expected JSON but got:', text.substring(0, 100));
        throw new Error('Server returned non-JSON response');
      }

      if (!res.ok) throw new Error('Failed to fetch templates');
      const data: TemplateVideo[] = await res.json();
      const sorted = data.slice().sort((a, b) => {
        const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bDate - aDate;
      });
      setVideos(sorted);
    } catch (fetchError) {
      console.error(fetchError);
      toast({
        title: 'Unable to load library',
        description: 'Template videos are temporarily unavailable.',
        variant: 'destructive',
      });
    } finally {
      setVideosLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      loadVideos();
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!file) {
      setVideoPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setVideoPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!thumbnail) {
      setThumbnailPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(thumbnail);
    setThumbnailPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [thumbnail]);

  const existingCategories = useMemo(() => {
    const categorySet = new Set<string>();
    videos.forEach((video) => {
      if (video.category) categorySet.add(video.category);
    });
    defaultCategories.forEach((preset) => categorySet.add(preset));
    return Array.from(categorySet).sort();
  }, [videos]);

  const parsedTagPreview = useMemo(() => {
    if (!tags.trim()) return [];
    try {
      const json = JSON.parse(tags);
      if (Array.isArray(json)) {
        return json.map((tag) => String(tag));
      }
    } catch {
      // ignore JSON parse errors, fallback to comma-separated
    }
    return tags.split(',').map((tag) => tag.trim()).filter(Boolean);
  }, [tags]);

  const filteredVideos = useMemo(() => {
    return videos.filter((video) => {
      if (filterCategory !== 'all' && video.category !== filterCategory) return false;
      if (filterDifficulty !== 'all' && video.difficulty !== filterDifficulty) return false;
      if (!searchTerm.trim()) return true;
      const haystack = `${video.title} ${video.description ?? ''} ${(video.tags ?? []).join(' ')}`.toLowerCase();
      return haystack.includes(searchTerm.toLowerCase());
    });
  }, [videos, filterCategory, filterDifficulty, searchTerm]);

  const templatesCount = videos.length;
  const activeTemplates = videos.filter((video) => video.isActive !== false).length;
  const lastUploadedAt = videos[0]?.createdAt ? new Date(videos[0].createdAt).toLocaleDateString() : '—';
  const readyTemplates = videos.filter((video) => video.metadata?.pipelineStatus === 'completed').length;
  const processingTemplates = videos.filter((video) => !video.metadata?.pipelineStatus || video.metadata?.pipelineStatus !== 'completed').length;

  const getPipelineBadge = (metadata?: TemplateVideoMetadata) => {
    const status = metadata?.pipelineStatus ?? 'queued';
    switch (status) {
      case 'completed':
        return <Badge variant="secondary" className="bg-green-600/10 text-green-600 border-green-600/20">Ready</Badge>;
      case 'error':
        return <Badge variant="destructive">Needs attention</Badge>;
      case 'processing':
        return <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 border-amber-500/20">Processing</Badge>;
      default:
        return <Badge variant="outline">Queued</Badge>;
    }
  };

  const handleCategoryChip = (value: string) => {
    setCategory(value);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file || uploading) return;

    setError(null);
    setSuccess(null);
    setUploading(true);

    // Check file size (2GB limit)
    if (file.size > 2 * 1024 * 1024 * 1024) {
      setError('File is too large. Please upload a video smaller than 2GB.');
      setUploading(false);
      return;
    }

    try {
      const form = new FormData();
      form.append('video', file);
      if (thumbnail) {
        form.append('thumbnail', thumbnail);
      }
      form.append('title', title);

      if (description) form.append('description', description);
      if (category) form.append('category', category);
      if (difficulty) form.append('difficulty', difficulty);
      if (duration) form.append('duration', duration);

      if (tags) {
        try {
          const json = JSON.parse(tags);
          form.append('tags', JSON.stringify(json));
        } catch {
          const normalized = tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean);
          form.append('tags', JSON.stringify(normalized));
        }
      }

      const res = await fetch('/api/template-videos', {
        method: 'POST',
        body: form,
        credentials: 'include',
      });

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error('Upload failed with non-JSON response:', text.substring(0, 200));
        throw new Error('Upload failed: Server returned an invalid response (likely file too large or server error).');
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Upload failed');
      }

      setSuccess('Template uploaded successfully.');
      toast({
        title: 'Template published',
        description: `"${title}" is now available in the template library.`,
      });

      setTitle('');
      setDescription('');
      setTags('');
      setDuration('');
      setFile(null);
      setThumbnail(null);
      setVideoPreviewUrl(null);
      setThumbnailPreviewUrl(null);

      await loadVideos();
    } catch (submitError: any) {
      const message = submitError?.message || 'Failed to upload template.';
      setError(message);
      toast({
        title: 'Upload failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  if (isAdmin === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="rounded-xl border bg-card px-6 py-4 text-sm text-muted-foreground shadow-sm">
          Checking administrative access…
        </div>
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Access denied</CardTitle>
            <CardDescription>You need administrator privileges to manage template videos.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30">
      <div className="container mx-auto space-y-10 py-10">
        <section className="relative overflow-hidden rounded-3xl border bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-8 shadow-sm">
          <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-primary/20 blur-3xl lg:block" />
          <div className="relative z-10 grid gap-6 lg:grid-cols-[2fr_1fr]">
            <div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="h-4 w-4 text-primary" />
                Curated Video Library
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground lg:text-4xl">
                Upload new cinematic templates
              </h1>
              <p className="mt-2 text-sm text-muted-foreground lg:pr-10">
                Give families a head start with polished story structures, ready-made transitions, and guided narration prompts.
                Upload your mastered video and optional thumbnail to instantly update the catalog.
              </p>
            </div>
            <div className="grid gap-3 rounded-2xl border bg-card/80 p-4 text-sm shadow-sm backdrop-blur">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="gap-1">
                  <Film className="h-3.5 w-3.5" />
                  {templatesCount} total
                </Badge>
                <Badge variant="outline" className="gap-1">
                  <Sparkles className="h-3.5 w-3.5" />
                  {activeTemplates} live
                </Badge>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="gap-1 bg-green-500/10 text-green-600 border-green-500/20">
                  Ready transcripts: {readyTemplates}
                </Badge>
                <Badge variant="outline" className="gap-1 text-amber-600 border-amber-500/40">
                  Processing: {processingTemplates}
                </Badge>
              </div>
              <p className="font-medium text-foreground">Latest update</p>
              <p className="text-xs text-muted-foreground">Last upload recorded on {lastUploadedAt}</p>
            </div>
          </div>
        </section>

        <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Template metadata & files</CardTitle>
              <CardDescription>
                Upload the mastered video, add descriptive context, and choose how it should appear in the public catalog.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-6" onSubmit={handleSubmit}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Master video file</label>
                    <Input
                      type="file"
                      accept="video/*"
                      onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Upload an MP4 or MOV in 1080p (up to 500 MB). Families will stream this asset directly.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Poster thumbnail (optional)</label>
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={(event) => setThumbnail(event.target.files?.[0] ?? null)}
                    />
                    <p className="text-xs text-muted-foreground">Recommended 16:9 image for catalog cards.</p>
                  </div>
                </div>

                <div className="grid gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Template title</label>
                    <Input
                      placeholder="Winter holiday highlight reel"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Editor notes</label>
                    <Textarea
                      placeholder="Describe the story arc, recommended footage, or narration prompts for this template."
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      className="min-h-[120px]"
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Category</label>
                    <Input
                      placeholder="family"
                      value={category}
                      onChange={(event) => setCategory(event.target.value)}
                    />
                    <div className="flex flex-wrap gap-2 pt-1">
                      {existingCategories.slice(0, 6).map((option) => (
                        <Button
                          key={option}
                          type="button"
                          variant={option === category ? 'default' : 'secondary'}
                          size="sm"
                          className="h-8 px-3 text-xs"
                          onClick={() => handleCategoryChip(option)}
                        >
                          {option}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Difficulty</label>
                    <Select value={difficulty} onValueChange={setDifficulty}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select difficulty" />
                      </SelectTrigger>
                      <SelectContent>
                        {difficultyOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Duration (seconds)</label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      placeholder="120"
                      value={duration}
                      onChange={(event) => setDuration(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      Tags (JSON array or comma separated)
                    </label>
                    <Input
                      placeholder='["kids","holiday"] or kids, holiday'
                      value={tags}
                      onChange={(event) => setTags(event.target.value)}
                    />
                  </div>
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertTitle>Upload failed</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                {success && (
                  <Alert>
                    <AlertTitle>Success</AlertTitle>
                    <AlertDescription>{success}</AlertDescription>
                  </Alert>
                )}

                <div className="flex items-center justify-end gap-3">
                  <Button type="button" variant="outline" onClick={loadVideos} disabled={uploading}>
                    Refresh library
                  </Button>
                  <Button type="submit" disabled={!canSubmit}>
                    {uploading ? (
                      <>
                        <Upload className="mr-2 h-4 w-4 animate-spin" />
                        Uploading…
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Publish template
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="h-full">
            <CardHeader>
              <CardTitle>Preview</CardTitle>
              <CardDescription>Review assets before publishing to the catalog.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-hidden rounded-xl border bg-muted/20">
                {videoPreviewUrl ? (
                  <video src={videoPreviewUrl} controls className="w-full" />
                ) : (
                  <div className="flex aspect-video items-center justify-center bg-muted text-sm text-muted-foreground">
                    <Film className="mr-2 h-5 w-5" />
                    Video preview will appear here
                  </div>
                )}
              </div>

              <div className="overflow-hidden rounded-xl border bg-muted/10 p-3">
                {thumbnailPreviewUrl ? (
                  <img src={thumbnailPreviewUrl} alt="Thumbnail preview" className="w-full rounded-md object-cover" />
                ) : (
                  <div className="flex aspect-video items-center justify-center bg-muted text-xs text-muted-foreground">
                    <ImageIcon className="mr-2 h-4 w-4" />
                    Optional thumbnail preview
                  </div>
                )}
              </div>

              <div className="space-y-3 rounded-xl border bg-card/80 p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">{title || 'Template title'}</p>
                  <Badge variant="secondary" className="flex items-center gap-1">
                    <Clock3 className="h-3.5 w-3.5" />
                    {duration ? `${duration}s` : 'Length TBD'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{description || 'Add context to help families pick the right template.'}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Badge variant="outline" className="gap-1">
                    <Library className="h-3.5 w-3.5" />
                    {category}
                  </Badge>
                  <Badge variant="outline">{difficulty}</Badge>
                  {parsedTagPreview.slice(0, 4).map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      <Tags className="h-3 w-3" />
                      {tag}
                    </Badge>
                  ))}
                  {parsedTagPreview.length > 4 && (
                    <Badge variant="secondary">+{parsedTagPreview.length - 4} more</Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <CardTitle>Video library</CardTitle>
                <CardDescription>Filter and review the catalog families explore.</CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-60">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search templates…"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                  />
                </div>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {existingCategories.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterDifficulty} onValueChange={setFilterDifficulty}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Difficulty" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All levels</SelectItem>
                    {difficultyOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="ghost" className="gap-2" type="button" onClick={() => {
                  setSearchTerm('');
                  setFilterCategory('all');
                  setFilterDifficulty('all');
                }}>
                  <Filter className="h-4 w-4" />
                  Reset
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {videosLoading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[...Array(6)].map((_, index) => (
                  <Skeleton key={index} className="h-48 rounded-xl" />
                ))}
              </div>
            ) : filteredVideos.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-muted/20 p-10 text-center text-sm text-muted-foreground">
                <p className="font-medium text-foreground">No templates match your filters</p>
                <p>Adjust the search or add a new template to populate this library.</p>
              </div>
            ) : (
              <ScrollArea className="max-h-[480px]">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {filteredVideos.map((video) => (
                    <div key={video.id} className="flex flex-col rounded-2xl border bg-card/80 p-4 shadow-sm transition hover:border-primary/30 hover:shadow">
                      {video.thumbnailUrl ? (
                        <div className="mb-3 overflow-hidden rounded-xl border bg-muted/20">
                          <img src={video.thumbnailUrl} alt={video.title} className="h-32 w-full object-cover" />
                        </div>
                      ) : (
                        <div className="mb-3 flex h-32 items-center justify-center rounded-xl border border-dashed bg-muted/30 text-xs text-muted-foreground">
                          <ImageIcon className="mr-2 h-4 w-4" />
                          No thumbnail provided
                        </div>
                      )}
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground line-clamp-2">{video.title}</p>
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant={video.isActive === false ? 'outline' : 'secondary'}>
                            {video.isActive === false ? 'Inactive' : 'Live'}
                          </Badge>
                          {getPipelineBadge(video.metadata)}
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{video.description || 'No description provided.'}</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                        {video.category && (
                          <Badge variant="outline" className="gap-1">
                            <Library className="h-3 w-3" />
                            {video.category}
                          </Badge>
                        )}
                        {video.difficulty && <Badge variant="outline">{video.difficulty}</Badge>}
                        {video.duration && (
                          <Badge variant="secondary" className="gap-1">
                            <Clock3 className="h-3 w-3" />
                            {video.duration}s
                          </Badge>
                        )}
                      </div>
                      {Array.isArray(video.tags) && video.tags.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1">
                          {video.tags.slice(0, 4).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-[10px]">
                              #{tag}
                            </Badge>
                          ))}
                          {video.tags.length > 4 && (
                            <Badge variant="outline" className="text-[10px]">
                              +{video.tags.length - 4}
                            </Badge>
                          )}
                        </div>
                      )}
                      <a
                        href={video.videoUrl}
                        className="mt-3 inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View source
                      </a>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
