# Use lightweight Python base image
FROM python:3.10-slim

# Set working directory
WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose default Flask/FastAPI port (adjust if different)
# For Flask
EXPOSE 5002
CMD ["python", "app.py"]

