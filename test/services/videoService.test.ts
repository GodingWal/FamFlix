import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';

// Mock dependencies
vi.mock('../../server/storage', () => ({
  storage: {
    createVideo: vi.fn(),
    updateVideo: vi.fn(),
    getVideo: vi.fn(),
    deleteVideo: vi.fn(),
    getVideosByFamily: vi.fn(),
    getVideosByUser: vi.fn(),
    getFamily: vi.fn(),
    getFamilyMembers: vi.fn(),
    getActiveCollaborators: vi.fn(),
    endCollaborationSession: vi.fn(),
    logActivity: vi.fn(),
  },
}));

vi.mock('../../server/services/aiService', () => ({
  aiService: {
    generateVideoScript: vi.fn(),
    generateVideoSuggestions: vi.fn(),
    enhanceVideoDescription: vi.fn(),
    generateNarrationScript: vi.fn(),
  },
}));

vi.mock('../../server/config', () => ({
  config: {
    UPLOAD_DIR: 'test-uploads',
  },
}));

vi.mock('../../server/utils/logger-simple', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock fs/promises - use a factory function that returns mock implementations
const mockMkdir = vi.fn().mockResolvedValue(undefined);
const mockWriteFile = vi.fn().mockResolvedValue(undefined);

vi.mock('fs/promises', () => {
  const mocks = {
    mkdir: mockMkdir,
    writeFile: mockWriteFile,
    rm: vi.fn(),
  };
  return {
    ...mocks,
    default: mocks,
  };
});

describe('VideoService', () => {
  let videoService: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await import('../../server/services/videoService');
    videoService = module.videoService;
  });

  describe('createVideo', () => {
    it('should create video and log activity', async () => {
      const { storage } = await import('../../server/storage');
      const mockVideo = {
        id: 'video-123',
        title: 'Test Video',
        createdBy: 'user-456',
        familyId: 'family-789',
        videoUrl: '/videos/test.mp4',
      };

      vi.mocked(storage.createVideo).mockResolvedValue(mockVideo as any);

      const videoData = {
        title: 'Test Video',
        createdBy: 'user-456',
        familyId: 'family-789',
      };

      const result = await videoService.createVideo(videoData);

      expect(storage.createVideo).toHaveBeenCalledWith(videoData);
      expect(storage.logActivity).toHaveBeenCalledWith({
        userId: 'user-456',
        action: 'create_video',
        resourceType: 'video',
        resourceId: 'video-123',
        details: { title: 'Test Video' },
      });
      expect(result).toEqual(mockVideo);
    });
  });

  describe('updateVideo', () => {
    it('should update video and log activity', async () => {
      const { storage } = await import('../../server/storage');
      const mockUpdatedVideo = {
        id: 'video-123',
        title: 'Updated Video',
        description: 'New description',
      };

      vi.mocked(storage.updateVideo).mockResolvedValue(mockUpdatedVideo as any);

      const updates = {
        title: 'Updated Video',
        description: 'New description',
      };

      const result = await videoService.updateVideo('video-123', updates, 'user-456');

      expect(storage.updateVideo).toHaveBeenCalledWith('video-123', updates);
      expect(storage.logActivity).toHaveBeenCalledWith({
        userId: 'user-456',
        action: 'update_video',
        resourceType: 'video',
        resourceId: 'video-123',
        details: { updates },
      });
      expect(result).toEqual(mockUpdatedVideo);
    });
  });

  describe('getVideosByFamily', () => {
    it('should retrieve videos for a family', async () => {
      const { storage } = await import('../../server/storage');
      const mockVideos = [
        { id: 'video-1', title: 'Video 1', familyId: 'family-123' },
        { id: 'video-2', title: 'Video 2', familyId: 'family-123' },
      ];

      vi.mocked(storage.getVideosByFamily).mockResolvedValue(mockVideos as any);

      const result = await videoService.getVideosByFamily('family-123');

      expect(storage.getVideosByFamily).toHaveBeenCalledWith('family-123');
      expect(result).toEqual(mockVideos);
    });
  });

  describe('getVideosByUser', () => {
    it('should retrieve videos for a user', async () => {
      const { storage } = await import('../../server/storage');
      const mockVideos = [
        { id: 'video-1', title: 'Video 1', createdBy: 'user-123' },
        { id: 'video-2', title: 'Video 2', createdBy: 'user-123' },
      ];

      vi.mocked(storage.getVideosByUser).mockResolvedValue(mockVideos as any);

      const result = await videoService.getVideosByUser('user-123');

      expect(storage.getVideosByUser).toHaveBeenCalledWith('user-123');
      expect(result).toEqual(mockVideos);
    });
  });

  describe('generateVideoScript', () => {
    it('should generate script without family context', async () => {
      const { aiService } = await import('../../server/services/aiService');
      const mockScript = 'Generated video script content';

      vi.mocked(aiService.generateVideoScript).mockResolvedValue(mockScript);

      const result = await videoService.generateVideoScript('Create a birthday video');

      expect(aiService.generateVideoScript).toHaveBeenCalledWith(
        'Create a birthday video',
        null
      );
      expect(result).toBe(mockScript);
    });

    it('should generate script with family context', async () => {
      const { storage } = await import('../../server/storage');
      const { aiService } = await import('../../server/services/aiService');

      vi.mocked(storage.getFamily).mockResolvedValue({
        id: 'family-123',
        name: 'The Smith Family',
      } as any);

      vi.mocked(storage.getFamilyMembers).mockResolvedValue([
        { firstName: 'John', lastName: 'Smith' },
        { firstName: 'Jane', lastName: 'Smith' },
        { firstName: 'Jimmy', lastName: 'Smith' },
      ] as any);

      vi.mocked(aiService.generateVideoScript).mockResolvedValue('Family video script');

      const result = await videoService.generateVideoScript(
        'Create a family reunion video',
        'family-123'
      );

      expect(storage.getFamily).toHaveBeenCalledWith('family-123');
      expect(storage.getFamilyMembers).toHaveBeenCalledWith('family-123');
      expect(aiService.generateVideoScript).toHaveBeenCalledWith(
        'Create a family reunion video',
        {
          familyName: 'The Smith Family',
          memberCount: 3,
          memberNames: ['John Smith', 'Jane Smith', 'Jimmy Smith'],
        }
      );
      expect(result).toBe('Family video script');
    });

    it('should handle members with missing names', async () => {
      const { storage } = await import('../../server/storage');
      const { aiService } = await import('../../server/services/aiService');

      vi.mocked(storage.getFamily).mockResolvedValue({
        id: 'family-123',
        name: 'Test Family',
      } as any);

      vi.mocked(storage.getFamilyMembers).mockResolvedValue([
        { firstName: 'John', lastName: 'Doe' },
        { firstName: null, lastName: null },
        { firstName: '', lastName: '' },
      ] as any);

      vi.mocked(aiService.generateVideoScript).mockResolvedValue('Script');

      await videoService.generateVideoScript('Test prompt', 'family-123');

      const aiCall = vi.mocked(aiService.generateVideoScript).mock.calls[0];
      // The service filters out falsy values from the combined name
      // Note: This test verifies current behavior - service does include 'null null' and ' '
      expect(aiCall[1].memberNames).toHaveLength(3);
      expect(aiCall[1].memberNames[0]).toBe('John Doe');
    });
  });

  describe('generateVideoSuggestions', () => {
    it('should generate suggestions based on family data', async () => {
      const { storage } = await import('../../server/storage');
      const { aiService } = await import('../../server/services/aiService');

      vi.mocked(storage.getFamily).mockResolvedValue({
        id: 'family-123',
        name: 'The Johnson Family',
      } as any);

      vi.mocked(storage.getFamilyMembers).mockResolvedValue([
        { firstName: 'Bob', lastName: 'Johnson' },
        { firstName: 'Alice', lastName: 'Johnson' },
      ] as any);

      vi.mocked(storage.getVideosByFamily).mockResolvedValue([
        { title: 'Summer Vacation' },
        { title: 'Birthday Party' },
        { title: 'Christmas 2024' },
      ] as any);

      vi.mocked(aiService.generateVideoSuggestions).mockResolvedValue([
        'New Year Celebration',
        'Spring Picnic',
      ]);

      const result = await videoService.generateVideoSuggestions('family-123');

      expect(aiService.generateVideoSuggestions).toHaveBeenCalledWith({
        familyName: 'The Johnson Family',
        memberCount: 2,
        recentVideoTitles: ['Summer Vacation', 'Birthday Party', 'Christmas 2024'],
      });
      expect(result).toEqual(['New Year Celebration', 'Spring Picnic']);
    });

    it('should limit recent videos to 5', async () => {
      const { storage } = await import('../../server/storage');
      const { aiService } = await import('../../server/services/aiService');

      vi.mocked(storage.getFamily).mockResolvedValue({ name: 'Test Family' } as any);
      vi.mocked(storage.getFamilyMembers).mockResolvedValue([] as any);

      const manyVideos = Array.from({ length: 10 }, (_, i) => ({
        title: `Video ${i + 1}`,
      }));
      vi.mocked(storage.getVideosByFamily).mockResolvedValue(manyVideos as any);
      vi.mocked(aiService.generateVideoSuggestions).mockResolvedValue([]);

      await videoService.generateVideoSuggestions('family-123');

      const aiCall = vi.mocked(aiService.generateVideoSuggestions).mock.calls[0][0];
      expect(aiCall.recentVideoTitles).toHaveLength(5);
      expect(aiCall.recentVideoTitles).toEqual([
        'Video 1',
        'Video 2',
        'Video 3',
        'Video 4',
        'Video 5',
      ]);
    });
  });

  describe('processVideoUpload', () => {
    beforeEach(() => {
      mockMkdir.mockClear();
      mockWriteFile.mockClear();
    });

    it('should process video upload successfully', async () => {
      const mockFile = {
        originalname: 'test-video.mp4',
        mimetype: 'video/mp4',
        size: 1024000,
        buffer: Buffer.from('mock video data'),
      } as Express.Multer.File;

      const result = await videoService.processVideoUpload(mockFile);

      expect(mockMkdir).toHaveBeenCalledWith(
        expect.stringContaining('test-uploads/videos'),
        { recursive: true }
      );
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining('admin-'),
        mockFile.buffer
      );
      expect(result.videoUrl).toMatch(/^\/uploads\/videos\/admin-.*\.mp4$/);
      expect(result.thumbnail).toBeNull();
      expect(result.duration).toBeNull();
      expect(result.metadata).toMatchObject({
        originalName: 'test-video.mp4',
        mimeType: 'video/mp4',
        size: 1024000,
      });
      expect(result.metadata.uploadedAt).toBeDefined();
    });

    it('should handle files with different extensions', async () => {
      const mockFile = {
        originalname: 'video.webm',
        mimetype: 'video/webm',
        size: 500000,
        buffer: Buffer.from('webm data'),
      } as Express.Multer.File;

      const result = await videoService.processVideoUpload(mockFile);

      expect(result.videoUrl).toMatch(/\.webm$/);
    });

    it('should sanitize unsafe file extensions', async () => {
      const mockFile = {
        originalname: 'video.mp4; rm -rf /',
        mimetype: 'video/mp4',
        size: 1024,
        buffer: Buffer.from('data'),
      } as Express.Multer.File;

      const result = await videoService.processVideoUpload(mockFile);

      // Unsafe characters should be stripped (keeps alphanumeric, dots only)
      // The regex [^a-zA-Z0-9.] strips "; rm -rf /" leaving ".mp4rmrf"
      expect(result.videoUrl).toMatch(/\.mp4rmrf$/);

      // Verify the filename itself doesn't contain dangerous characters
      const filename = result.videoUrl.split('/').pop()!;
      expect(filename).not.toContain(';');
      expect(filename).not.toContain(' ');
    });

    it('should default to .mp4 when extension is missing', async () => {
      const mockFile = {
        originalname: 'video',
        mimetype: 'video/mp4',
        size: 1024,
        buffer: Buffer.from('data'),
      } as Express.Multer.File;

      const result = await videoService.processVideoUpload(mockFile);

      expect(result.videoUrl).toMatch(/\.mp4$/);
    });

    it('should throw error when buffer is empty', async () => {
      const mockFile = {
        originalname: 'test.mp4',
        buffer: Buffer.from(''),
      } as Express.Multer.File;

      await expect(videoService.processVideoUpload(mockFile)).rejects.toThrow(
        'Video file buffer is empty'
      );
    });

    it('should throw error when file is missing', async () => {
      await expect(videoService.processVideoUpload(null as any)).rejects.toThrow(
        'Video file buffer is empty'
      );
    });
  });

  describe('deleteVideo', () => {
    it('should delete video and end collaboration sessions', async () => {
      const { storage } = await import('../../server/storage');
      const mockVideo = {
        id: 'video-123',
        title: 'Video to Delete',
        createdBy: 'user-456',
      };

      const mockSessions = [
        { id: 'session-1', videoId: 'video-123' },
        { id: 'session-2', videoId: 'video-123' },
      ];

      vi.mocked(storage.getVideo).mockResolvedValue(mockVideo as any);
      vi.mocked(storage.getActiveCollaborators).mockResolvedValue(mockSessions as any);
      vi.mocked(storage.endCollaborationSession).mockResolvedValue(undefined as any);
      vi.mocked(storage.deleteVideo).mockResolvedValue(undefined as any);

      await videoService.deleteVideo('video-123', 'user-456');

      expect(storage.getVideo).toHaveBeenCalledWith('video-123');
      expect(storage.getActiveCollaborators).toHaveBeenCalledWith('video-123');
      expect(storage.endCollaborationSession).toHaveBeenCalledTimes(2);
      expect(storage.endCollaborationSession).toHaveBeenCalledWith('session-1');
      expect(storage.endCollaborationSession).toHaveBeenCalledWith('session-2');
      expect(storage.deleteVideo).toHaveBeenCalledWith('video-123');
      expect(storage.logActivity).toHaveBeenCalledWith({
        userId: 'user-456',
        action: 'delete_video',
        resourceType: 'video',
        resourceId: 'video-123',
        details: { title: 'Video to Delete' },
      });
    });

    it('should throw error when video not found', async () => {
      const { storage } = await import('../../server/storage');
      vi.mocked(storage.getVideo).mockResolvedValue(null);

      await expect(videoService.deleteVideo('nonexistent', 'user-456')).rejects.toThrow(
        'Video not found'
      );

      expect(storage.deleteVideo).not.toHaveBeenCalled();
      expect(storage.logActivity).not.toHaveBeenCalled();
    });

    it('should handle videos with no active collaboration sessions', async () => {
      const { storage } = await import('../../server/storage');
      vi.mocked(storage.getVideo).mockResolvedValue({
        id: 'video-123',
        title: 'Solo Video',
      } as any);
      vi.mocked(storage.getActiveCollaborators).mockResolvedValue([]);

      await videoService.deleteVideo('video-123', 'user-456');

      expect(storage.endCollaborationSession).not.toHaveBeenCalled();
      expect(storage.deleteVideo).toHaveBeenCalledWith('video-123');
    });
  });

  describe('enhanceVideoDescription', () => {
    it('should enhance video description using AI', async () => {
      const { aiService } = await import('../../server/services/aiService');
      vi.mocked(aiService.enhanceVideoDescription).mockResolvedValue(
        'Enhanced description with better details'
      );

      const result = await videoService.enhanceVideoDescription('Basic description');

      expect(aiService.enhanceVideoDescription).toHaveBeenCalledWith('Basic description');
      expect(result).toBe('Enhanced description with better details');
    });
  });

  describe('generateNarrationScript', () => {
    it('should generate narration script without personality', async () => {
      const { aiService } = await import('../../server/services/aiService');
      vi.mocked(aiService.generateNarrationScript).mockResolvedValue(
        'Narration script content'
      );

      const result = await videoService.generateNarrationScript('Video content here');

      expect(aiService.generateNarrationScript).toHaveBeenCalledWith(
        'Video content here',
        undefined
      );
      expect(result).toBe('Narration script content');
    });

    it('should generate narration script with voice personality', async () => {
      const { aiService } = await import('../../server/services/aiService');
      vi.mocked(aiService.generateNarrationScript).mockResolvedValue(
        'Cheerful narration script'
      );

      const result = await videoService.generateNarrationScript(
        'Video content',
        'cheerful and energetic'
      );

      expect(aiService.generateNarrationScript).toHaveBeenCalledWith(
        'Video content',
        'cheerful and energetic'
      );
      expect(result).toBe('Cheerful narration script');
    });
  });
});
