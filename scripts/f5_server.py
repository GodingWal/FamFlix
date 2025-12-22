import os
import sys
import argparse
import logging
import time
import uvicorn
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
from pathlib import Path
import torch
import soundfile as sf

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("F5-Server")

app = FastAPI(title="F5-TTS Inference Server")

# Global model variable
model = None
device = "cuda" if torch.cuda.is_available() else "cpu"

class SynthesizeRequest(BaseModel):
    text: str
    voice_ref_path: str
    output_path: str
    remove_silence: bool = True

class SynthesizeResponse(BaseModel):
    audio_url: str
    duration_sec: float
    status: str

def load_model():
    global model
    logger.info(f"Loading F5-TTS model on {device}...")
    try:
        from f5_tts.api import F5TTS
        model = F5TTS(device=device)
        logger.info("Model loaded successfully.")
    except ImportError:
        logger.error("Failed to import f5_tts. Please install it with: pip install f5-tts")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Error loading model: {e}")
        sys.exit(1)

@app.on_event("startup")
async def startup_event():
    load_model()

@app.post("/synthesize", response_model=SynthesizeResponse)
async def synthesize(request: SynthesizeRequest):
    if not model:
        raise HTTPException(status_code=500, detail="Model not loaded")

    if not os.path.exists(request.voice_ref_path):
        raise HTTPException(status_code=400, detail=f"Voice reference file not found: {request.voice_ref_path}")

    try:
        logger.info(f"Synthesizing text: {request.text[:50]}...")
        start_time = time.time()
        
        # Run inference
        # Note: The API might vary slightly depending on the specific F5-TTS version installed.
        # This assumes a standard API structure.
        wav, sample_rate, spect = model.infer(
            ref_file=request.voice_ref_path,
            ref_text="", # Zero-shot usually doesn't need ref text if using F5
            gen_text=request.text,
            remove_silence=request.remove_silence
        )

        # Save output
        os.makedirs(os.path.dirname(request.output_path), exist_ok=True)
        sf.write(request.output_path, wav, sample_rate)
        
        duration = len(wav) / sample_rate
        logger.info(f"Synthesis complete in {time.time() - start_time:.2f}s. Duration: {duration:.2f}s")

        return SynthesizeResponse(
            audio_url=request.output_path, # Client will map this to a URL
            duration_sec=duration,
            status="success"
        )

    except Exception as e:
        logger.error(f"Synthesis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health():
    return {"status": "ok", "device": device, "model_loaded": model is not None}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8001)
    parser.add_argument("--host", type=str, default="0.0.0.0")
    parser.add_argument("--device", type=str, default=device)
    args = parser.parse_args()

    device = args.device
    uvicorn.run(app, host=args.host, port=args.port)
