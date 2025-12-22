#!/bin/bash
set -e

echo "=== GPU Server ML Environment Setup (Fast Track) ==="
echo "Starting setup at $(date)"

# Create application directory
echo "Creating application directory..."
mkdir -p /opt/ml-api
cd /opt/ml-api

# Create Python virtual environment
echo "Creating Python virtual environment..."
python3 -m venv venv
source venv/bin/activate

# Upgrade pip
pip install --upgrade pip

# Install PyTorch with CUDA support
echo "Installing PyTorch with CUDA 12.x support..."
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# Install ML and API dependencies
echo "Installing ML and API dependencies..."
pip install \
    fastapi \
    uvicorn[standard] \
    python-multipart \
    aiofiles \
    pydantic \
    numpy \
    scipy \
    librosa \
    soundfile \
    tqdm \
    requests \
    httpx \
    python-dotenv \
    transformers \
    accelerate

# Create directory structure
mkdir -p /opt/ml-api/{models,uploads,temp,logs}

echo "=== Setup Complete ==="
echo "Python version: $(python --version)"
echo "PyTorch version: $(python -c 'import torch; print(torch.__version__)')"
echo "CUDA available: $(python -c 'import torch; print(torch.cuda.is_available())')"
echo "GPU: $(python -c 'import torch; print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else "N/A")')"

# Deactivate venv
deactivate

echo "Setup completed at $(date)"
