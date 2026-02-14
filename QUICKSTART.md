# Quick Start Guide

## ✅ System is Ready!

The Django development server is running at: **http://localhost:8000**

## 🔑 Test Credentials

**Admin User:**
- Email: `admin@demo.com`
- Password: `admin123`

**Developer User:**
- Email: `developer@demo.com`
- Password: `dev123`

## 🚀 Quick Test

### 1. Login
```bash
curl -X POST http://localhost:8000/api/v1/auth/login/ \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@demo.com", "password": "admin123"}'
```

Save the `access` token from the response.

### 2. List Documents
```bash
curl http://localhost:8000/api/v1/documents/ \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 3. Upload Document (requires file)
```bash
curl -X POST http://localhost:8000/api/v1/documents/upload/ \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -F "file=@/path/to/document.pdf" \
  -F "title=Test Document" \
  -F "visibility_type=public"
```

### 4. Query RAG (requires OpenAI API key in .env)
```bash
curl -X POST http://localhost:8000/api/v1/rag/query/ \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"question": "What is this document about?"}'
```

## ⚙️ Required Services

### For Full Functionality:

**1. Redis (for caching & Celery):**
```bash
redis-server
```

**2. Qdrant (for vector search):**
```bash
docker run -p 6333:6333 qdrant/qdrant
```

**3. Celery Worker (for document processing):**
```bash
# In a new terminal
cd /Users/mohitmaurya/dev/internship
source venv/bin/activate
celery -A config worker -l info
```

**4. OpenAI API Key:**
Add to `.env`:
```
OPENAI_API_KEY=your-actual-api-key-here
```

## 📊 Admin Panel

Access Django admin at: **http://localhost:8000/admin/**

Create a superuser:
```bash
python manage.py createsuperuser
```

## 🔍 What's Working

✅ Django server running
✅ Database with all tables
✅ 24 permissions created
✅ Test tenant with users
✅ All API endpoints
✅ JWT authentication
✅ Multi-tenant isolation
✅ Dynamic RBAC

## 📝 Next Steps

1. Add OpenAI API key to `.env`
2. Start Redis and Qdrant
3. Start Celery worker
4. Upload a test document
5. Wait for processing (check Celery logs)
6. Query the RAG system

## 📚 Documentation

- Full walkthrough: `walkthrough.md`
- API documentation: `README.md`
- Implementation plan: `implementation_plan.md`
