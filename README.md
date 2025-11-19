# PetaVision

**A Fullstack NAS Image Indexing & AI Search System**

PetaVision is a high-performance, scalable fullstack application designed for Network Attached Storage (NAS) environments. This system can efficiently index massive image collections (tested with 100TB+ datasets) and provides semantic search capabilities using AI embeddings.

Built with Go, Python, and Next.js, PetaVision delivers enterprise-grade performance for petabyte-scale image management.

## Features

🔍 **Semantic Search**: Find images using natural language descriptions  
📁 **Massive Scale**: Tested on 100TB+ NAS storage with millions of images  
🚀 **High Performance**: Multi-threaded Go backend for fast file system scanning  
🎨 **AI-Powered**: CLIP embeddings for understanding image content  
🌐 **Modern Web UI**: Next.js interface with image browsing and AI generation  
📊 **Vector Search**: Milvus integration for lightning-fast similarity queries  
🔄 **Incremental Sync**: Smart synchronization with change detection  

## Architecture

The system consists of three main components:

- **Go Backend (SyncEngine)**: Handles file system scanning, thumbnail generation, and orchestration
- **Python AI Pipeline**: Generates CLIP embeddings and handles ML processing
- **Next.js Frontend**: Provides web interface for search and image management

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   NAS/FS    │───▶│ Go Backend  │───▶│ AI Pipeline │
│  100TB+     │    │ File Scan   │    │ CLIP/ML     │
└─────────────┘    └─────────────┘    └─────────────┘
                           │                   │
                           ▼                   ▼
                   ┌─────────────┐    ┌─────────────┐
                   │  SQLite     │    │   Milvus    │
                   │ Metadata    │    │  Vectors    │
                   └─────────────┘    └─────────────┘
                           │                   │
                           └───────┬───────────┘
                                   ▼
                           ┌─────────────┐
                           │ Next.js UI  │
                           │ Search/View │
                           └─────────────┘
```

## Quick Start

### Prerequisites

- Go 1.21+
- Python 3.11+ with Conda
- Node.js 16+
- Milvus vector database
- Access to NAS or large image directory

### 1. Setup Environment

```bash
# Clone repository
git clone <repository-url>
cd local-sync-go

# Setup Python environment and Go dependencies
make all
```

### 2. Configure Milvus

Create `config.ini`:
```ini
[milvus]
uri=http://localhost:19530
user=root
password=Milvus
collection=image_collection
```

### 3. Index Your Images

```bash
# Full initial sync (replace with your NAS path)
go run main.go -rootFilePath="/mnt/nas/images" -force

# Scheduled incremental sync (runs only if >6 hours since last sync)
go run main.go -rootFilePath="/mnt/nas/images" -sync
```

### 4. Start Web Interface

```bash
# Terminal 1: Start Next.js frontend
cd web/
npm run dev

# Terminal 2: Start Python API server
conda activate sync_engine
python scripts/api.py
```

Visit `http://localhost:3000` to access the web interface.

## Usage

### Command Line Options

```bash
go run main.go [flags]
```

**Flags:**
- `-rootFilePath`: Path to your image directory (required)
- `-force`: Force full re-scan of all files
- `-sync`: Incremental sync mode (skips if recently synced or already running)

### Web Interface Features

- **Browse Images**: Grid view of all indexed images with thumbnails
- **Semantic Search**: Search images using natural language descriptions
- **AI Generation**: Generate new images using various AI models
- **Admin Panel**: View sync status, manage collections
- **Upscaling**: AI-powered image upscaling tools

### Search Examples

Once indexed, you can search for images using descriptions like:
- "sunset over mountains"
- "cat sleeping on a couch" 
- "people at a wedding"
- "red car in parking lot"
- "food on a plate"

## Performance & Scale

### Tested Configuration
- **Storage**: 100TB+ NAS with 10+ million images
- **Indexing Speed**: ~500-1000 images/minute (depends on hardware)
- **Search Speed**: <100ms for semantic queries
- **Memory Usage**: ~2GB RAM for Go process, ~4GB for Python ML models

### Optimization Tips
- Use SSD storage for thumbnail cache (`.local/thumbnails3/`)
- Configure adequate swap space for large ML models
- Use dedicated Milvus instance for production workloads
- Monitor disk I/O during initial indexing

## Development

### Project Structure
```
├── main.go              # Entry point and CLI
├── engine/              # Core Go processing logic
├── models/              # Database models (files, dirs, syncs)
├── utils/               # Shared utilities
├── scripts/             # Python AI/ML scripts
├── web/                 # Next.js frontend
├── Makefile             # Build and environment setup
├── environment.yml      # Conda dependencies
└── config.ini          # Milvus configuration
```

### Building

```bash
# Build Go binary
go build -o sync-engine main.go

# Build web frontend
cd web/
npm run build
```

### Testing

```bash
# Run Go tests
go test ./...

# Run web tests
cd web/
npm test

# Python linting
conda activate sync_engine
flake8 scripts/
```

## Configuration

### Environment Variables
- `SYNC_LOG_LEVEL`: Set logging level (debug, info, warn, error)
- `MILVUS_URI`: Override Milvus connection URL
- `CACHE_DIR`: Override embedding cache directory

### Storage Requirements
- **Thumbnails**: ~100MB per 10,000 images
- **Embeddings**: ~5KB per image
- **Metadata**: ~1KB per image
- **Logs**: Configurable, rotated daily

## Deployment

### Docker Deployment
```bash
# Build containers
docker-compose build

# Start services
docker-compose up -d
```

### Production Considerations
- Use external Milvus cluster for high availability
- Configure proper backup strategies for metadata
- Set up monitoring for sync processes
- Use reverse proxy for web interface
- Configure file system permissions for NAS access

## Troubleshooting

### Common Issues

**Slow indexing performance:**
- Check disk I/O utilization
- Verify network speed to NAS
- Increase concurrent processing workers

**Out of memory errors:**
- Reduce batch size for embedding generation
- Add swap space for ML model loading
- Use smaller CLIP model variants

**Search not working:**
- Verify Milvus connection in `config.ini`
- Check if embeddings were generated successfully
- Restart API server to reload models

### Logs
- Go logs: `.local/logs/[timestamp].log`
- Python logs: Check console output
- Web logs: Browser developer console

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality  
5. Submit a pull request

## License

[Your License Here]

## Support

For issues and questions:
- Create an issue in the repository
- Check existing documentation
- Review log files for error details