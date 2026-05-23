# Docker Setup for NetCancer Application

This application uses Docker for consistent development and deployment environments.

## Prerequisites

- Docker installed on your machine
- Docker Compose installed
- [Ollama](https://ollama.ai/) knowledge (models run inside Docker now; ensure Docker Desktop is allocated **at least 8 GB RAM** for acceptable performance)
- Local vector store built by running `python3 llm_data/ingest/embed_and_index.py` (stores FAISS index + metadata under `llm_data/vector_store`)

## Quick Start (Development)

1. **Clone the repository and navigate to the project root**

2. **Use the helper script to prep the local LLM + vector store and start Docker:**
   ```bash
   ./scripts/start_local.sh
   ```
   (Set `REBUILD_INDEX=1` if you want to force a re-embed of the chunk files.)

3. **Pull the LLM model once inside the Ollama container (in a new terminal):**
   ```bash
   docker compose exec ollama ollama pull phi3:mini
   ```
   Repeat for any other models you want available.

4. **Access the application:**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Documentation: http://localhost:8000/docs

## Development Workflow

### **Hot Reload (Code Changes)**
- Backend changes are automatically reflected due to volume mounting
- Frontend changes require rebuilding: `docker-compose build frontend`

### **Viewing Logs**
```bash
# All services
docker-compose logs

# Specific service
docker-compose logs backend
docker-compose logs frontend
```

### **Stopping Services**
```bash
docker-compose down
```

### **Rebuilding After Dependency Changes**
```bash
# Rebuild all services
docker-compose up --build

# Rebuild specific service
docker-compose build backend
docker-compose build frontend
```

## Production Deployment

### **Option 1: Cloud Platform with Docker Support**

1. **Build and push images:**
   ```bash
   # Build images
   docker build -t your-registry/netcancer-backend:latest ./backend
   docker build -t your-registry/netcancer-frontend:latest ./frontend
   
   # Push to registry (if using one)
   docker push your-registry/netcancer-backend:latest
   docker push your-registry/netcancer-frontend:latest
   ```

2. **Deploy to your cloud platform** using the Docker images

### **Option 2: Self-Hosted Server**

1. **Copy files to server**
2. **Run with docker-compose:**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

## Environment Variables

### **Backend Environment Variables**
- `OLLAMA_HOST`: URL of the local Llama runtime (default `http://ollama:11434`)
- `OLLAMA_MODEL`: Model name/tag to load (default `llama3:8b-instruct`)
- `VECTOR_STORE_DIR`: Path that holds `index.faiss` + `metadata.jsonl` (default `llm_data/vector_store`)
- `EMBEDDING_MODEL_NAME`: SentenceTransformer model for embeddings (default `all-MiniLM-L6-v2`)

### **Setting Environment Variables**

**For Development:**
- Edit `docker-compose.yml` and add environment variables under the `backend` service

**For Production:**
- Set environment variables in your cloud platform's dashboard
- Or create a `.env` file (don't commit this to git)

## Services Overview

### **Local LLM & Vector Store Setup**
1. Build the retrieval index whenever chunk files change:
   ```bash
   python3 llm_data/ingest/embed_and_index.py
   ```
   This writes `llm_data/vector_store/index.faiss` and `metadata.jsonl`; mount that directory into the backend container so it persists between runs.
2. Start the stack (`./scripts/start_local.sh` or `docker compose up --build`).
3. Pull any Ollama models you need inside the container: `docker compose exec ollama ollama pull <model>`.


### **Backend (FastAPI)**
- **Port:** 8000
- **Features:** graph-tool, clustering algorithms, local FAISS retrieval, LLM via the bundled Ollama service
- **New:** exposes MCP-compatible tools (`/mcp/tools`) so each Dockerized instance can advertise available gene analysis capabilities to agents or integrations.
- **Base Image:** graph-tool/graph-tool:latest

### **Frontend (React)**
- **Port:** 3000 (mapped to 80 in container)
- **Features:** React app served by nginx
- **Base Image:** node:18-alpine (build) + nginx:alpine (production)

## Troubleshooting

### **Common Issues**

1. **Port already in use:**
   ```bash
   # Check what's using the port
   lsof -i :8000
   lsof -i :3000
   
   # Stop conflicting services
   ```

2. **graph-tool not found:**
   - Ensure you're using the graph-tool base image
   - Check backend logs: `docker-compose logs backend`
3. **Local LLM not reachable:**
   - Check that the Ollama container is running: `docker compose ps ollama`
   - Pull the required model: `docker compose exec ollama ollama pull <model>`
   - Inspect logs: `docker compose logs -f ollama`
4. **Vector index missing:**
   - Run `python3 llm_data/ingest/embed_and_index.py` after updating chunk files
   - Ensure `VECTOR_STORE_DIR` is mounted/persistent so the backend can load `index.faiss` and `metadata.jsonl`

### **Cleaning Up**
```bash
# Remove all containers and volumes
docker-compose down -v

# Remove all images
docker-compose down --rmi all

# Clean up Docker system
docker system prune -a
```

## Performance Tips

1. **Use volume mounts for development** (already configured)
2. **Use multi-stage builds** (already configured for frontend)
3. **Set resource limits** in production:
   ```yaml
   services:
     backend:
       deploy:
         resources:
           limits:
             memory: 2G
             cpus: '1.0'
   ```

## Security Notes

1. **Never commit sensitive environment variables** to git
2. **Use secrets management** in production
3. **Regularly update base images** for security patches
4. **Use non-root users** in production containers 
