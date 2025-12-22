#!/bin/bash
set -e

echo "=== GPU Server ML Environment Setup ==="
echo "Starting setup at $(date)"

# Update system
echo "Updating system packages..."
apt-get update
apt-get upgrade -y

# Install essential packages
echo "Installing essential packages..."
apt-get install -y \
    curl \
    wget \
    git \
    build-essential \
    ffmpeg \
    python3-pip \
    python3-venv \
    python3-dev \
    nginx \
    supervisor

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
    python-dotenv

# Install Transformers and related
pip install transformers accelerate

# Create directory structure
mkdir -p /opt/ml-api/{models,uploads,temp,logs}

echo "=== Setup Complete ==="
echo "Python version: $(python --version)"
echo "PyTorch version: $(python -c 'import torch; print(torch.__version__)')"
echo "CUDA available: $(python -c 'import torch; print(torch.cuda.is_available())')"
echo "GPU: $(python -c 'import torch; print(torch.cuda.get_device_name(0))' 2>/dev/null || echo 'N/A')"

# Deactivate venv
deactivate

echo "Setup completed at $(date)"
