# Use Node.js base image
FROM node:18

# Install Python 3.11
RUN apt-get update && apt-get install -y python3.11 python3.11-pip python3.11-venv

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Install Python dependencies
RUN python3.11 -m pip install --break-system-packages snowflake-connector-python[snowpark]==3.7.0
RUN python3.11 -m pip install --break-system-packages cryptography==42.0.5

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Expose port
EXPOSE 3001

# Start the application
CMD ["npm", "start"]
