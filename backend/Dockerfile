# API-only image (Render ``Root Directory = backend``). For API + built SPA on one origin, build from repo root:
#   docker build -f Dockerfile .
FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# tesseract-ocr: FOREVER invoice scanning for the CC/sale engine.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["/bin/sh", "-c", "alembic upgrade heads && exec uvicorn main:app --host 0.0.0.0 --port 8000"]
