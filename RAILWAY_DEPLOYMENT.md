# Railway Deployment Guide

## 🚀 **Pre-Deployment Checklist**

### 1. **Environment Variables Setup**
Before deploying, ensure you have these environment variables configured in Railway:

#### **Required Variables:**
```bash
# Snowflake Configuration (CRITICAL)
SNOWFLAKE_ACCOUNT=your-account-identifier
SNOWFLAKE_USERNAME=your-username  
SNOWFLAKE_PASSWORD=your-password
SNOWFLAKE_DATABASE=FOUNDRY
SNOWFLAKE_SCHEMA=API_SCHEMA
SNOWFLAKE_ROLE=DEV_API_ROLE
SNOWFLAKE_WAREHOUSE=COMPUTE_WH

# CORS Configuration (CRITICAL for Lovable)
ALLOWED_ORIGINS=https://your-lovable-app.railway.app,https://your-lovable-app.lovable.app,http://localhost:3000

# Server Configuration
NODE_ENV=production
PORT=3001
```

#### **Optional Variables:**
```bash
# Supabase (if using authentication)
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key

# Rate Limiting
API_RATE_LIMIT_MAX_REQUESTS=1000
API_RATE_LIMIT_WINDOW_MS=900000
```

### 2. **Railway Configuration**
- Railway automatically provides `RAILWAY_PUBLIC_DOMAIN` environment variable
- The app is configured to bind to `0.0.0.0` for Railway's networking
- Health check endpoint is set to `/health`

## 🚀 **Deployment Steps**

### 1. **Connect to Railway**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Link your project
railway link

# Deploy
railway up
```

### 2. **Set Environment Variables**
In Railway dashboard:
1. Go to your project → Variables tab
2. Add all required environment variables from above
3. **CRITICAL**: Set `ALLOWED_ORIGINS` to include your Lovable app's domain

### 3. **Verify Deployment**
```bash
# Check health
curl https://your-app.railway.app/health

# Test API endpoint
curl https://your-app.railway.app/api/v1/opportunities?page=1&page_size=5
```

## 🔧 **Lovable Integration**

### 1. **Update Lovable Frontend**
In your Lovable app, update the API base URL:
```typescript
// In your Lovable app's environment
const API_BASE_URL = 'https://your-api-app.railway.app';
```

### 2. **CORS Configuration**
Make sure your Lovable app's domain is in the `ALLOWED_ORIGINS` environment variable:
```bash
ALLOWED_ORIGINS=https://your-lovable-app.railway.app,https://your-lovable-app.lovable.app
```

### 3. **Test Connection**
```bash
# Test from Lovable app
fetch('https://your-api-app.railway.app/health')
  .then(response => response.json())
  .then(data => console.log('API Health:', data));
```

## 🐛 **Troubleshooting**

### **Common Issues:**

1. **CORS Errors**
   - Ensure `ALLOWED_ORIGINS` includes your Lovable app's domain
   - Check that the domain matches exactly (including https/http)

2. **Snowflake Connection Issues**
   - Verify all Snowflake environment variables are set
   - Check that your Snowflake account allows connections from Railway's IPs

3. **Port Issues**
   - Railway automatically sets the PORT environment variable
   - The app is configured to bind to `0.0.0.0` for Railway

4. **Health Check Failures**
   - Check Railway logs for Snowflake connection errors
   - Verify environment variables are correctly set

### **Debug Commands:**
```bash
# Check Railway logs
railway logs

# Check environment variables
railway variables

# Test health endpoint
curl https://your-app.railway.app/health/detailed
```

## 📊 **Monitoring**

### **Health Endpoints:**
- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed system information

### **Railway Dashboard:**
- Monitor CPU, memory, and network usage
- View deployment logs
- Check environment variables

## 🔒 **Security Notes**

1. **Environment Variables**: Never commit sensitive data to git
2. **CORS**: Only allow necessary origins in production
3. **Rate Limiting**: Configured for production workloads
4. **Logging**: All requests are logged for monitoring

## 🚀 **Production Optimization**

1. **Caching**: In-memory caching is enabled for better performance
2. **Compression**: Gzip compression is enabled
3. **Rate Limiting**: Tiered rate limiting based on subscription
4. **Connection Pooling**: Snowflake connections are pooled for efficiency

---

**Ready to deploy!** 🎉
