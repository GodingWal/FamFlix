"""
FamFlix ML API Server
Handles ML tasks: voice cloning, story generation, video processing
"""

from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List
import torch
import os
import uuid
import logging
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI
app = FastAPI(
    title="FamFlix ML API",
    description="GPU-accelerated ML services for voice cloning and content generation",
    version="1.0.0"
)

# Directories
BASE_DIR = Path("/opt/ml-api")
UPLOADS_DIR = BASE_DIR / "uploads"
MODELS_DIR = BASE_DIR / "models"
TEMP_DIR = BASE_DIR / "temp"
LOGS_DIR = BASE_DIR / "logs"

# Create directories
for dir_path in [UPLOADS_DIR, MODELS_DIR, TEMP_DIR, LOGS_DIR]:
    dir_path.mkdir(parents=True, exist_ok=True)

# GPU Check
logger.info(f"CUDA available: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    logger.info(f"GPU: {torch.cuda.get_device_name(0)}")
    logger.info(f"CUDA version: {torch.version.cuda}")

# Request/Response Models
class VoiceCloneRequest(BaseModel):
    text: str
    voice_profile_id: str
    speed: float = 1.0
    pitch: float = 1.0

class StoryGenerateRequest(BaseModel):
    prompt: str
    max_length: int = 500
    temperature: float = 0.7
    style: Optional[str] = "narrative"

class HealthResponse(BaseModel):
    status: str
    gpu_available: bool
    gpu_name: Optional[str] = None
    cuda_version: Optional[str] = None

@app.get("/", response_model=HealthResponse)
async def root():
    """Health check endpoint"""
    return HealthResponse(
        status="online",
        gpu_available=torch.cuda.is_available(),
        gpu_name=torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        cuda_version=torch.version.cuda if torch.cuda.is_available() else None
    )

@app.get("/health")
async def health():
    """Health check"""
    return {"status": "healthy", "gpu": torch.cuda.is_available()}

@app.post("/api/voice/upload-samples")
async def upload_voice_samples(
    files: List[UploadFile] = File(...),
    voice_name: str = "default"
):
    """
    Upload audio samples for voice cloning training
    """
    try:
        profile_id = str(uuid.uuid4())
        profile_dir = UPLOADS_DIR / profile_id
        profile_dir.mkdir(parents=True, exist_ok=True)
        
        saved_files = []
        for file in files:
            file_path = profile_dir / file.filename
            with open(file_path, "wb") as f:
                content = await file.read()
                f.write(content)
            saved_files.append(str(file_path))
        
        logger.info(f"Uploaded {len(saved_files)} files for voice profile {profile_id}")
        
        return {
            "profile_id": profile_id,
            "voice_name": voice_name,
            "files_uploaded": len(saved_files),
            "status": "ready_for_training"
        }
    except Exception as e:
        logger.error(f"Error uploading voice samples: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/voice/train")
async def train_voice_model(
    profile_id: str,
    background_tasks: BackgroundTasks
):
    """
    Train a voice cloning model from uploaded samples
    """
    try:
        profile_dir = UPLOADS_DIR / profile_id
        if not profile_dir.exists():
            raise HTTPException(status_code=404, detail="Voice profile not found")
        
        # TODO: Implement actual voice training
        # For now, return a mock response
        logger.info(f"Training voice model for profile {profile_id}")
        
        return {
            "profile_id": profile_id,
            "status": "training_started",
            "estimated_time": "5-10 minutes",
            "message": "Training in progress"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error training voice model: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/voice/synthesize")
async def synthesize_voice(request: VoiceCloneRequest):
    """
    Generate audio from text using a cloned voice
    """
    try:
        # TODO: Implement actual voice synthesis
        logger.info(f"Synthesizing voice for profile {request.voice_profile_id}")
        
        output_file = TEMP_DIR / f"{uuid.uuid4()}.wav"
        
        # Placeholder - would call actual TTS model
        return {
            "audio_url": f"/temp/{output_file.name}",
            "duration": 5.0,
            "status": "completed"
        }
    except Exception as e:
        logger.error(f"Error synthesizing voice: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/story/generate")
async def generate_story(request: StoryGenerateRequest):
    """
    Generate story content using AI
    """
    try:
        # TODO: Implement actual story generation with LLM
        logger.info(f"Generating story with prompt: {request.prompt[:50]}...")
        
        # Placeholder response
        generated_text = f"Generated story based on: {request.prompt}"
        
        return {
            "text": generated_text,
            "tokens_used": len(generated_text.split()),
            "style": request.style,
            "status": "completed"
        }
    except Exception as e:
        logger.error(f"Error generating story: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/f5/synthesize")
async def synthesize_f5(
    text: str = Form(...),
    voice_ref: UploadFile = File(...),
    remove_silence: bool = Form(True)
):
    """
    Generate speech using F5-TTS
    """
    try:
        # Save voice ref
        ref_path = TEMP_DIR / f"ref_{uuid.uuid4()}.wav"
        with open(ref_path, "wb") as f:
            f.write(await voice_ref.read())
            
        # TODO: Call F5-TTS generation
        # For now, mock response
        output_filename = f"f5_{uuid.uuid4()}.wav"
        output_path = TEMP_DIR / output_filename
        
        # Mock generation (copy ref to output for testing)
        import shutil
        shutil.copy(ref_path, output_path)
        
        return {
            "status": "success",
            "url": f"/temp/{output_filename}",
            "duration_sec": 5.0
        }
    except Exception as e:
        logger.error(f"Error in F5 synthesis: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/rvc/convert")
async def convert_rvc(
    guide_audio: UploadFile = File(...),
    voice_model: UploadFile = File(...),
    pitch_change: float = Form(0.0)
):
    """
    Convert audio using RVC
    """
    try:
        # Save inputs
        guide_path = TEMP_DIR / f"guide_{uuid.uuid4()}.wav"
        with open(guide_path, "wb") as f:
            f.write(await guide_audio.read())
            
        model_path = MODELS_DIR / f"model_{uuid.uuid4()}.pth"
        with open(model_path, "wb") as f:
            f.write(await voice_model.read())
            
        # TODO: Call RVC conversion
        output_filename = f"rvc_{uuid.uuid4()}.wav"
        output_path = TEMP_DIR / output_filename
        
        # Mock conversion
        import shutil
        shutil.copy(guide_path, output_path)
        
        return {
            "status": "success",
            "url": f"/temp/{output_filename}",
            "duration_sec": 5.0
        }
    except Exception as e:
        logger.error(f"Error in RVC conversion: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080, log_level="info")
