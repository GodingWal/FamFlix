"""
FamFlix ML API Server
Handles ML tasks: voice cloning (placeholder), story generation (Ollama)
"""

from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List
import torch
import os
import uuid
import logging
import subprocess
import json
from pathlib import Path
import httpx

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

# Ollama configuration
OLLAMA_BASE_URL = "http://localhost:11434"
DEFAULT_MODEL = "llama3.2:1b"

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
    ollama_status: Optional[str] = None

@app.get("/", response_model=HealthResponse)
async def root():
    """Health check endpoint"""
    ollama_status = "offline"
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=2.0)
            if response.status_code == 200:
                ollama_status = "online"
    except Exception:
        pass
    
    return HealthResponse(
        status="online",
        gpu_available=torch.cuda.is_available(),
        gpu_name=torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        cuda_version=torch.version.cuda if torch.cuda.is_available() else None,
        ollama_status=ollama_status
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

@app.post("/api/voice/synthesize")
async def synthesize_voice(request: VoiceCloneRequest):
    """
    Generate audio from text using the GPU-backed TTS stack (F5/RVC)
    Placeholder implementation until the inference server is wired in.
    """
    try:
        logger.info(f"Voice synthesis requested for: {request.text[:50]}...")
        
        return {
            "audio_url": None,
            "duration": 0,
            "status": "not_implemented",
            "message": "Voice synthesis endpoint is a placeholder. F5/RVC integration pending."
        }
    except Exception as e:
        logger.error(f"Error synthesizing voice: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/story/generate")
async def generate_story(request: StoryGenerateRequest):
    """
    Generate story content using Ollama LLM
    """
    try:
        logger.info(f"Generating story with prompt: {request.prompt[:50]}...")
        
        # Prepare the system message based on style
        system_prompt = "You are a creative storyteller helping families create engaging narratives."
        if request.style == "narrative":
            system_prompt += " Write in a warm, narrative style suitable for family stories."
        elif request.style == "documentary":
            system_prompt += " Write in a documentary style with informative, clear narration."
        elif request.style == "children":
            system_prompt += " Write in a simple, engaging style suitable for children."
        
        # Call Ollama API
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{OLLAMA_BASE_URL}/api/generate",
                json={
                    "model": DEFAULT_MODEL,
                    "prompt": f"{system_prompt}\\n\\nUser request: {request.prompt}\\n\\nGenerate a compelling story:",
                    "stream": False,
                    "options": {
                        "temperature": request.temperature,
                        "num_predict": request.max_length,
                    }
                }
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=502, detail=f"Ollama API error: {response.text}")
            
            result = response.json()
            generated_text = result.get("response", "")
            
            logger.info(f"Generated {len(generated_text)} characters")
            
            return {
                "text": generated_text,
                "tokens_used": len(generated_text.split()),
                "style": request.style,
                "model": DEFAULT_MODEL,
                "status": "completed"
            }
            
    except httpx.TimeoutException:
        logger.error("Ollama request timed out")
        raise HTTPException(status_code=504, detail="Story generation timed out")
    except Exception as e:
        logger.error(f"Error generating story: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/temp/{filename}")
async def get_temp_file(filename: str):
    """Serve temporary files"""
    file_path = TEMP_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080, log_level="info")
