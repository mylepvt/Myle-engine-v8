# Monorepo image: API + built Vite SPA (same origin → cookie auth works without cross-site issues).
# Build from repository root:
#   docker build -t myle-vl2 .
# Render: Root Directory = (repo root), Dockerfile Path = Dockerfile

FROM node:20-alpine AS vite
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
ENV VITE_API_URL=
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FRONTEND_DIST=/app/frontend_dist

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .
COPY --from=vite /src/dist ./frontend_dist

EXPOSE 8000

CMD ["/bin/sh", "-c", "alembic upgrade head && exec uvicorn main:app --host 0.0.0.0 --port 8000"]
