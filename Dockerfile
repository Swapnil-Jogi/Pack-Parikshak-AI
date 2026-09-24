# ==============================================================================
# Pack-Parikshak AI (पैक-परीक्षक एआई) - Production Dockerfile
# Multi-runtime image: Node.js 20 + Python 3.11 + RapidOCR / PaddleOCR ONNX Engine
# ==============================================================================

FROM node:20-bookworm-slim

# Set core production environment variables with strict thread bounds (Render 512MB RAM)
ENV NODE_ENV=production \
    PORT=8080 \
    PYTHON_OCR_PORT=5000 \
    PYTHON_OCR_HOST=127.0.0.1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    OMP_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    VECLIB_MAXIMUM_THREADS=1 \
    NUMEXPR_NUM_THREADS=1 \
    ONNXRUNTIME_INTR_OP_NUM_THREADS=1

# Install Python 3, virtual environment, and system libraries required by OpenCV & ONNX Runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Setup Python isolated virtual environment
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy and install Python OCR requirements first for Docker layer caching
COPY python_ocr/requirements.txt ./python_ocr/
RUN pip install --no-cache-dir -r python_ocr/requirements.txt

# Copy package manifests and install Node.js production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy all application source code
COPY . .

# Ensure storage directories exist
RUN mkdir -p public/uploads

# Expose Web Portal Ports (8080 for standard / compose, 10000 for Render)
EXPOSE 8080 10000

# Docker health check probe against the production /api/health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=35s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8080}/api/health || exit 1

# Start Unified Node.js Server & Python Microservice
CMD ["node", "--max-old-space-size=160", "app.js"]

