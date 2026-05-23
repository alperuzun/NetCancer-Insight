# Use Python base image with conda for graph-tool
FROM continuumio/miniconda3:latest

# Set working directory
WORKDIR /app

# Install system dependencies for graph-tool
RUN apt-get update && apt-get install -y \
    build-essential \
    libboost-all-dev \
    libcgal-dev \
    libgmp-dev \
    libsparsehash-dev \
    && rm -rf /var/lib/apt/lists/*

# Install graph-tool via conda
RUN conda install -c conda-forge graph-tool -y

# Install Python dependencies (including orca-graphlets)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY . .

# Expose port
EXPOSE 8000

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
