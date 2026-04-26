#!/bin/zsh

set -e

cd "$(dirname "$0")"

echo "AI Report Generator"
echo "Project directory: $(pwd)"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed."
  echo "Please install Node.js 22 LTS or newer from https://nodejs.org/"
  echo ""
  read "reply?Press Enter to close..."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is not installed."
  echo "Please reinstall Node.js from https://nodejs.org/"
  echo ""
  read "reply?Press Enter to close..."
  exit 1
fi

echo "Node: $(node -v)"
echo "npm:  $(npm -v)"
echo ""

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  if [ -f "package-lock.json" ]; then
    npm ci
  else
    npm install
  fi
else
  echo "Dependencies already installed."
fi

echo ""
echo "Starting development server..."
echo "A browser window should open automatically."
echo "Press Ctrl+C in this terminal to stop the server."
echo ""

npm run dev -- --open

echo ""
read "reply?Server stopped. Press Enter to close..."
