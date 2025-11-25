#!/bin/bash

# Setup script for testing Authentik SSO with Gitea Mirror
# This script helps configure Authentik for testing SSO integration

set -e

echo "======================================"
echo "Authentik SSO Test Environment Setup"
echo "======================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if docker and docker-compose are installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}Docker Compose is not installed. Please install Docker Compose first.${NC}"
    exit 1
fi

# Function to generate random secret
generate_secret() {
    openssl rand -base64 32 | tr -d '\n' | tr -d '=' | tr -d '/' | tr -d '+'
}

# Function to wait for service
wait_for_service() {
    local service=$1
    local port=$2
    local max_attempts=30
    local attempt=1
    
    echo -n "Waiting for $service to be ready"
    while ! nc -z localhost $port 2>/dev/null; do
        if [ $attempt -eq $max_attempts ]; then
            echo -e "\n${RED}Timeout waiting for $service${NC}"
            return 1
        fi
        echo -n "."
        sleep 2
        ((attempt++))
    done
    echo -e " ${GREEN}Ready!${NC}"
    return 0
}

# Parse command line arguments
ACTION=${1:-start}

case $ACTION in
    start)
        echo "Starting Authentik test environment..."
        echo ""
        
        # Check if .env.authentik exists, if not create it
        if [ ! -f .env.authentik ]; then
            echo "Creating .env.authentik with secure defaults..."
            cat > .env.authentik << EOF
# Authentik Configuration
AUTHENTIK_SECRET_KEY=$(generate_secret)
AUTHENTIK_DB_PASSWORD=$(generate_secret)
AUTHENTIK_BOOTSTRAP_PASSWORD=admin-password
AUTHENTIK_BOOTSTRAP_EMAIL=admin@example.com

# Gitea Mirror Configuration  
BETTER_AUTH_SECRET=$(generate_secret)
BETTER_AUTH_URL=http://localhost:4321
BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:4321,http://localhost:9000

# URLs for testing
AUTHENTIK_URL=http://localhost:9000
GITEA_MIRROR_URL=http://localhost:4321
EOF
            echo -e "${GREEN}Created .env.authentik with secure secrets${NC}"
            echo ""
        fi
        
        # Load environment variables
        source .env.authentik
        
        # Start Authentik services
        echo "Starting Authentik services..."
        docker-compose -f docker-compose.authentik.yml --env-file .env.authentik up -d
        
        # Wait for Authentik to be ready
        echo ""
        wait_for_service "Authentik" 9000
        
        # Wait a bit more for initialization
        echo "Waiting for Authentik to initialize..."
        sleep 10
        
        echo ""
        echo -e "${GREEN}✓ Authentik is running!${NC}"
        echo ""
        echo "======================================"
        echo "Authentik Access Information:"
        echo "======================================"
        echo "URL: http://localhost:9000"
        echo "Admin Username: akadmin"
        echo "Admin Password: admin-password"
        echo ""
        echo "======================================"
        echo "Next Steps:"
        echo "======================================"
        echo "1. Access Authentik at http://localhost:9000"
        echo "2. Login with akadmin / admin-password"
        echo "3. Create an Authentik OIDC Provider for Gitea Mirror:"
        echo "   - Name: gitea-mirror"
        echo "   - Redirect URI:"
        echo "     http://localhost:4321/api/auth/sso/callback/authentik"
        echo "   - Scopes: openid, profile, email"
        echo ""
        echo "4. Create Application:"
        echo "   - Name: Gitea Mirror"
        echo "   - Slug: gitea-mirror"
        echo "   - Provider: gitea-mirror (created above)"
        echo ""
        echo "5. Start Gitea Mirror with:"
        echo "   bun run dev"
        echo ""
        echo "6. Configure SSO in Gitea Mirror:"
        echo "   - Go to Settings → Authentication & SSO"
        echo "   - Add provider with:"
        echo "     - Provider ID: authentik"
        echo "     - Issuer URL: http://localhost:9000/application/o/gitea-mirror/"
        echo "     - Click Discover to pull Authentik endpoints"
        echo "     - Client ID: (from Authentik provider)"
        echo "     - Client Secret: (from Authentik provider)"
        echo ""
        echo "If you previously registered this provider on a version earlier than v3.8.10, delete it and re-add it after upgrading to avoid missing endpoint data."
        echo ""
        ;;
        
    stop)
        echo "Stopping Authentik test environment..."
        docker-compose -f docker-compose.authentik.yml down
        echo -e "${GREEN}✓ Authentik stopped${NC}"
        ;;
        
    clean)
        echo "Cleaning up Authentik test environment..."
        docker-compose -f docker-compose.authentik.yml down -v
        echo -e "${GREEN}✓ Authentik data cleaned${NC}"
        
        read -p "Remove .env.authentik file? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rm -f .env.authentik
            echo -e "${GREEN}✓ Configuration file removed${NC}"
        fi
        ;;
        
    logs)
        docker-compose -f docker-compose.authentik.yml logs -f
        ;;
        
    status)
        echo "Authentik Service Status:"
        echo "========================="
        docker-compose -f docker-compose.authentik.yml ps
        ;;
        
    *)
        echo "Usage: $0 {start|stop|clean|logs|status}"
        echo ""
        echo "Commands:"
        echo "  start  - Start Authentik test environment"
        echo "  stop   - Stop Authentik services"
        echo "  clean  - Stop and remove all data"
        echo "  logs   - Show Authentik logs"
        echo "  status - Show service status"
        exit 1
        ;;
esac
