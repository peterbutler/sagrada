#!/bin/bash
# Sagrada Monorepo Deployment Script
# Run this on the target Pi after cloning the repo

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

echo "Installing Sagrada services from $REPO_DIR"

# Create virtual environment if it doesn't exist
if [ ! -d "$REPO_DIR/venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv "$REPO_DIR/venv"
fi

# Activate venv and install Python package
echo "Installing Python package..."
source "$REPO_DIR/venv/bin/activate"
pip install -e "$REPO_DIR/services"

# Install Node.js dependencies for API
if [ -d "$REPO_DIR/api" ]; then
    echo "Installing API dependencies..."
    cd "$REPO_DIR/api"
    npm install
fi

# Copy systemd service files
echo "Installing systemd services..."
sudo cp "$SCRIPT_DIR/systemd/"*.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable services (but don't start yet)
echo "Enabling services..."
sudo systemctl enable climate-collector
sudo systemctl enable climate-controller
sudo systemctl enable climate-display
sudo systemctl enable mqtt-logger
sudo systemctl enable ble-mqtt-bridge
sudo systemctl enable sagrada-api

echo ""
echo "Installation complete!"
echo ""
echo "Next steps:"
echo "1. Copy config/.env.example to config/.env and set your database credentials"
echo "2. Start services with: sudo systemctl start <service-name>"
echo "3. Check status with: sudo systemctl status <service-name>"
