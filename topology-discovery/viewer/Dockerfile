# Step 1: Build React
FROM node:18 AS builder

WORKDIR /app
COPY frontend/package*.json ./
RUN npm install

COPY frontend .
RUN npm run build

# Step 2: Serve with NGINX
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
