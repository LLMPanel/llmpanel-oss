# LLMPanel image-generation server.
# CUDA + PyTorch base so diffusers runs on GPU out of the box.
FROM pytorch/pytorch:2.5.1-cuda12.4-cudnn9-runtime

ENV PYTHONUNBUFFERED=1 \
    HF_HOME=/root/.cache/huggingface \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# System deps occasionally needed by diffusers/Pillow.
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py .

EXPOSE 8000

# MODEL_ID is injected by LLMPanel at container start.
CMD ["python", "server.py"]
