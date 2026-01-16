#!/bin/bash

# GMB Scraper Pro v2.0 - Script de ejecucion

echo ""
echo "============================================"
echo "  GMB Scraper Pro v2.0"
echo "============================================"
echo ""

cd "$(dirname "$0")/backend"

# Verificar dependencias
if [ ! -d "node_modules" ]; then
    echo "Instalando dependencias..."
    npm install
fi

# Copiar frontend avanzado como default
if [ -f "../frontend/index-advanced.html" ]; then
    cp ../frontend/index-advanced.html ../frontend/index.html.bak 2>/dev/null
    cp ../frontend/index-advanced.html ../frontend/index.html
fi
if [ -f "../frontend/app-advanced.js" ]; then
    cp ../frontend/app-advanced.js ../frontend/app.js.bak 2>/dev/null
    cp ../frontend/app-advanced.js ../frontend/app.js
fi

echo "Iniciando servidor avanzado..."
echo ""

# Ejecutar servidor avanzado
node serverAdvanced.js
