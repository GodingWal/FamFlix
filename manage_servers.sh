#!/bin/bash
# manage_servers.sh - Easy management of FamFlixR servers

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

LOG_DIR="logs"
mkdir -p $LOG_DIR

function log() {
  echo -e "${GREEN}[FamFlix]${NC} $1"
}

function warn() {
  echo -e "${YELLOW}[FamFlix]${NC} $1"
}

function error() {
  echo -e "${RED}[FamFlix]${NC} $1"
}

function stop_node() {
  log "Stopping Node server..."
  pkill -f "tsx server/index-simple.ts" || warn "Node server not running"
}

function stop_python() {
  log "Stopping ML API..."
  pkill -f "python3 ml_api.py" || warn "ML API not running"
}

function start_node() {
  log "Starting Node server..."
  # Check if already running
  if pgrep -f "tsx server/index-simple.ts" > /dev/null; then
    warn "Node server already running"
    return
  fi
  
  nohup npm run dev > "$LOG_DIR/node.log" 2>&1 &
  log "Node server started. Logs: $LOG_DIR/node.log"
}

function start_python() {
  log "Starting ML API..."
  # Check if already running
  if pgrep -f "python3 ml_api.py" > /dev/null; then
    warn "ML API already running"
    return
  fi

  # Activate venv if exists
  if [ -d ".venv" ]; then
    source .venv/bin/activate
  elif [ -d "windsurf-project/venv" ]; then
    source windsurf-project/venv/bin/activate
  fi

  nohup python3 ml_api.py > "$LOG_DIR/ml_api.log" 2>&1 &
  log "ML API started. Logs: $LOG_DIR/ml_api.log"
}

function reload_nginx() {
  log "Reloading Nginx..."
  if sudo nginx -t > /dev/null 2>&1; then
    sudo nginx -s reload
    log "Nginx reloaded successfully"
  else
    error "Nginx configuration invalid or sudo required. Skipping reload."
    error "Please run 'sudo nginx -s reload' manually if needed."
  fi
}

function update_code() {
  log "Updating code..."
  git pull || warn "Git pull failed (maybe not a git repo?)"
  
  log "Installing Node dependencies..."
  npm install
  
  log "Installing Python dependencies..."
  if [ -f "requirements.txt" ]; then
    # Ensure venv is active
    if [ -d ".venv" ]; then
      source .venv/bin/activate
    elif [ -d "windsurf-project/venv" ]; then
      source windsurf-project/venv/bin/activate
    else
      python3 -m venv .venv
      source .venv/bin/activate
    fi
    pip install -r requirements.txt
  fi
}

case "$1" in
  start)
    start_python
    start_node
    ;;
  stop)
    stop_node
    stop_python
    ;;
  restart)
    stop_node
    stop_python
    sleep 2
    start_python
    start_node
    ;;
  update)
    update_code
    stop_node
    stop_python
    sleep 2
    start_python
    start_node
    reload_nginx
    ;;
  logs)
    tail -f $LOG_DIR/*.log
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|update|logs}"
    echo "  start   - Start all servers"
    echo "  stop    - Stop all servers"
    echo "  restart - Restart all servers"
    echo "  update  - Pull code, install deps, and restart everything"
    echo "  logs    - Tail logs"
    exit 1
    ;;
esac
