import os
import sys
import argparse
import logging
import time
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import torch
import soundfile as sf

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("RVC-Server")

app = FastAPI(title="RVC Inference Server")

device = "cuda" if torch.cuda.is_available() else "cpu"

class ConvertRequest(BaseModel):
    guide_audio_path: str
    voice_model_path: str # Path to the .pth file
    output_path: str
    f0_method: str = "rmvpe"
    pitch_change: int = 0 # Semitones

class ConvertResponse(BaseModel):
    audio_url: str
    duration_sec: float
    status: str

@app.post("/convert", response_model=ConvertResponse)
async def convert(request: ConvertRequest):
    if not os.path.exists(request.guide_audio_path):
        raise HTTPException(status_code=400, detail=f"Guide audio file not found: {request.guide_audio_path}")
    
    if not os.path.exists(request.voice_model_path):
        raise HTTPException(status_code=400, detail=f"Voice model file not found: {request.voice_model_path}")

    try:
        logger.info(f"Converting audio: {request.guide_audio_path} with model {request.voice_model_path}...")
        start_time = time.time()
        
        # Import RVC here to avoid startup errors if not installed
        try:
            from rvc_python.infer import RVCInference
        except ImportError:
            logger.error("Failed to import rvc_python. Please install it with: pip install rvc-python")
            raise HTTPException(status_code=500, detail="rvc-python library not installed")

        # Initialize RVC Inference
        rvc = RVCInference(device=device)
        
        # Load model
        rvc.load_model(request.voice_model_path)
        
        # Run inference
        rvc.infer_file(
            input_path=request.guide_audio_path,
            output_path=request.output_path,
            f0_method=request.f0_method,
            f0_up_key=request.pitch_change,
            index_path="", # Optional: Add index support later
            index_rate=0.75,
            filter_radius=3,
            resample_sr=0,
            rms_mix_rate=0.25,
            protect=0.33
        )

        # Get duration
        info = sf.info(request.output_path)
        duration = info.duration
        
        logger.info(f"Conversion complete in {time.time() - start_time:.2f}s. Duration: {duration:.2f}s")

        return ConvertResponse(
            audio_url=request.output_path,
            duration_sec=duration,
            status="success"
        )

    except Exception as e:
        logger.error(f"Conversion failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health():
    return {"status": "ok", "device": device}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8002)
    parser.add_argument("--host", type=str, default="0.0.0.0")
    parser.add_argument("--device", type=str, default=device)
    args = parser.parse_args()

    device = args.device
    uvicorn.run(app, host=args.host, port=args.port)
