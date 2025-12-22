# Local Development Setup

## Prerequisites

1. **Node.js** (v18 or higher)
2. **PostgreSQL** (v12 or higher)

## Database Setup

### Option 1: Local PostgreSQL

1. Start PostgreSQL service:
   ```bash
   sudo systemctl start postgresql
   ```

2. Create a database user and database:
   ```bash
   sudo -u postgres psql
   CREATE USER famflix WITH PASSWORD 'password';
   CREATE DATABASE famflix OWNER famflix;
   GRANT ALL PRIVILEGES ON DATABASE famflix TO famflix;
   \q
   ```

3. Create a `.env` file in the project root:
   ```bash
   cp .env.example .env
   ```

4. Update the DATABASE_URL in `.env`:
   ```
   DATABASE_URL="postgresql://famflix:password@localhost:5432/famflix"
   ```

### Option 2: Neon Cloud Database (Recommended)

1. Go to [Neon](https://neon.tech) and create a free account
2. Create a new project
3. Copy the connection string
4. Create `.env` file and set:
   ```
   DATABASE_URL="your-neon-connection-string"
   ```

## Running the Application

1. Install dependencies:
   ```bash
   npm install
   ```

2. Push database schema:
   ```bash
   npm run db:push
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open your browser to: http://localhost:5000

## Environment Variables

Copy `.env.example` to `.env` and configure:

- `DATABASE_URL`: Your PostgreSQL connection string
- `JWT_SECRET`: A secure random string for JWT tokens
- `OPENAI_API_KEY`: (Optional) For AI features
- `ELEVENLABS_API_KEY`: (Optional) For voice cloning features

## Troubleshooting

- **Database connection errors**: Ensure PostgreSQL is running and the DATABASE_URL is correct
- **Permission errors**: Make sure the database user has proper permissions
- **Port conflicts**: Change the PORT in `.env` if 5000 is already in use

## Admin Video Processing Pipeline

Admin video uploads now trigger a local Python pipeline (in `windsurf-project/`) that extracts audio, diarizes speakers, and generates a Whisper transcription. Make sure the following prerequisites are met before uploading videos from the admin UI:

1. **Python 3.10+ and ffmpeg** installed on your machine.
2. Create a virtual environment inside `windsurf-project/` and install the requirements:
   ```bash
   cd windsurf-project
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```
3. Point the backend to that interpreter by setting one of the following in `.env` (they are read in this order):
   - `ADMIN_PIPELINE_PYTHON_BIN=/absolute/path/to/venv/bin/python`
   - or reuse the global `PYTHON_BIN` that already defaults to `python3`
4. Optional tuning:
   - `ADMIN_PIPELINE_WHISPER_MODEL` (default `medium`)
   - `ADMIN_PIPELINE_LANGUAGE` (defaults to Whisper auto-detect)

Pipeline artifacts (clean WAV, diarization JSON, transcripts) are stored under `uploads/admin-pipeline/` and referenced from `videos.metadata.pipeline`. The JSON blob includes the most recent job status plus links to the generated files served from `/uploads`. If the pipeline cannot start, the upload request fails so you can fix the environment and retry.
