# Video Selection & Personalization Setup Guide

## Overview
FamFlixR has been updated to support a new workflow where users select from pre-existing template videos and personalize them with their voice and face, rather than uploading their own videos.

## New Architecture

### Database Schema
Two new tables have been added:

1. **template_videos** - Stores admin-uploaded template videos
   - id, title, description, thumbnailUrl, videoUrl
   - duration, category, tags, difficulty
   - isActive flag for admin control

2. **video_projects** - Tracks user personalization projects
   - Links to template_video and user
   - Stores voice_profile_id and face_image_url
   - Tracks processing status and progress
   - Stores final output_video_url

### New Routes

#### Template Videos API
- `GET /api/template-videos` - Get all active template videos
- `GET /api/template-videos/:id` - Get single template video
- `GET /api/template-videos/category/:category` - Get videos by category

#### Video Projects API
- `POST /api/video-projects` - Create new project (requires auth)
- `GET /api/video-projects` - Get user's projects (requires auth)
- `GET /api/video-projects/:id` - Get specific project (requires auth)
- `PATCH /api/video-projects/:id` - Update project (requires auth)
- `DELETE /api/video-projects/:id` - Delete project (requires auth)
- `POST /api/video-projects/:id/process` - Start processing (requires auth)

### New Pages

1. **VideoSelectionCatalog** (`/create`)
   - Browse template videos by category
   - Search and filter functionality
   - Select video to personalize

2. **ProjectSetup** (`/projects/:id/setup`)
   - Select voice profile
   - Upload face photo
   - Start processing

## Setup Instructions

### 1. Run Database Migration

```bash
# Apply the migration to add new tables
sqlite3 famflix.db < server/db/migrations/004_add_template_videos_and_projects.sql
```

### 2. Seed Template Videos

```bash
# Populate with sample template videos
npx tsx server/seedTemplateVideos.ts
```

This will add 10 template videos across different categories:
- Birthdays
- Holidays (Christmas, New Year, Thanksgiving)
- Anniversaries
- Celebrations (Graduation, Mother's Day)
- Family moments (Vacation, Reunion)

### 3. Update Environment Variables

No new environment variables are required, but ensure these are set:
- `DATABASE_URL` - SQLite database path
- `JWT_SECRET` - For authentication
- `ELEVENLABS_API_KEY` - (Optional) For voice cloning

### 4. Start the Application

```bash
# Terminal 1: Start server
npx tsx server/index-simple.ts

# Terminal 2: Start client
npx vite
```

Visit http://localhost:5000

## User Workflow

1. **Browse Templates** - User visits `/create` and browses video templates
2. **Select Video** - User clicks on a template video to select it
3. **Create Project** - System creates a video_project record
4. **Setup Personalization** - User is redirected to `/projects/:id/setup`
5. **Select Voice** - User chooses from their existing voice profiles
6. **Upload Face** - User uploads a clear face photo
7. **Start Processing** - System processes the template with user's voice and face
8. **View Result** - User can view their personalized video in `/videos`

## Categories

Template videos are organized into categories:
- `birthday` - Birthday celebrations
- `holiday` - Seasonal holidays
- `anniversary` - Wedding and relationship anniversaries
- `celebration` - General celebrations
- `family` - Family moments and gatherings

## Difficulty Levels

Each template has a difficulty level indicating face replacement complexity:
- `easy` - Simple, front-facing scenes
- `medium` - Some movement and angles
- `hard` - Complex scenes with multiple angles

## TODO: Video Processing Pipeline

The actual video processing pipeline needs to be implemented:

1. **Voice Processing**
   - Extract audio from template video
   - Apply voice cloning using ElevenLabs API
   - Replace audio track

2. **Face Processing**
   - Detect faces in template video
   - Apply face replacement with user's photo
   - Use DeepFaceLab or similar technology

3. **Video Rendering**
   - Merge processed audio and video
   - Render final output
   - Store in S3 or local storage
   - Update project status to "completed"

4. **Progress Tracking**
   - Update processing_progress field (0-100)
   - Provide real-time status updates via WebSocket (future)

## Storage Considerations

### Template Videos
- Store original template videos in `/uploads/templates/`
- Use CDN for thumbnails and previews
- Compress videos for web delivery

### User Face Photos
- Store in `/uploads/faces/:userId/`
- Implement proper file validation (type, size, dimensions)
- Consider privacy and GDPR compliance

### Processed Videos
- Store final videos in `/uploads/processed/:userId/`
- Implement cleanup policy for old projects
- Consider storage limits per user tier

## Future Enhancements

1. **Real-time Preview** - Show template video preview before selection
2. **Advanced Filters** - Filter by duration, popularity, ratings
3. **User Ratings** - Allow users to rate templates
4. **Custom Templates** - Allow premium users to request custom templates
5. **Batch Processing** - Process multiple projects in queue
6. **Video Editor** - Allow basic editing before processing
7. **Social Sharing** - Share personalized videos on social media

## Testing

### Manual Testing Checklist
- [ ] Browse template videos catalog
- [ ] Search and filter templates
- [ ] Select a template video
- [ ] Create a video project
- [ ] Select voice profile
- [ ] Upload face photo
- [ ] Start processing (mock for now)
- [ ] View project status
- [ ] Delete project

### Automated Tests (TODO)
- Unit tests for API routes
- Integration tests for workflow
- E2E tests with Playwright

## Troubleshooting

**Issue**: Template videos not showing
- Verify migration ran successfully
- Check seed script executed without errors
- Verify `is_active = 1` in database

**Issue**: Authentication errors on project routes
- Check JWT_SECRET is configured
- Verify user is logged in
- Check cookie or Authorization header

**Issue**: Face upload fails
- Check file size limit (max 5MB)
- Verify upload directory permissions
- Check MIME type validation

## Support

For questions or issues, check:
- `/server/routes/templateVideos.ts` - Template video API
- `/server/routes/videoProjects.ts` - Project API
- `/client/src/pages/VideoSelectionCatalog.tsx` - Video selection UI
- `/client/src/pages/ProjectSetup.tsx` - Project setup UI
