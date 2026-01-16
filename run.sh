#!/bin/bash

# Google My Business Scraper - Script de Ejecucion
# ================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"

echo ""
echo "========================================"
echo "  Google My Business Scraper"
echo "========================================"
echo ""

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js no esta instalado"
    echo "Por favor instala Node.js desde https://nodejs.org"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "ERROR: Se requiere Node.js 18 o superior"
    echo "Version actual: $(node -v)"
    exit 1
fi

echo "Node.js: $(node -v)"
echo ""

# Verificar dependencias
if [ ! -d "$BACKEND_DIR/node_modules" ]; then
    echo "Instalando dependencias..."
    cd "$BACKEND_DIR"
    npm install
    
    echo ""
    echo "Instalando navegador Chromium..."
    npx puppeteer browsers install chrome
    
    echo ""
fi

# Crear directorio output si no existe
mkdir -p "$SCRIPT_DIR/output"

# Iniciar servidor
echo "Iniciando servidor..."
echo ""
cd "$BACKEND_DIR"
node server.js
