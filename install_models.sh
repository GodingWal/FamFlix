#!/bin/bash
set -e

# Install system dependencies
apt-get update
apt-get install -y ffmpeg libsndfile1

# Activate venv
source /opt/ml-api/venv/bin/activate

# Install F5-TTS
echo "Installing F5-TTS..."
pip install git+https://github.com/SWivid/F5-TTS.git

# Install RVC (using rvc-python wrapper for simplicity, or clone if needed)
echo "Installing RVC..."
pip install rvc-python

# Download models if needed (F5-TTS usually downloads on first run, but we can preload)
# RVC models need to be downloaded. rvc-python might handle some, but we might need the hubert model.

echo "Installation complete."
