FROM node:18-slim

WORKDIR /app

COPY package*.json ./

# Install build deps for native modules if needed, then install production deps
RUN apt-get update && apt-get install -y build-essential python3 make g++ --no-install-recommends \
	&& npm install --production \
	&& apt-get remove -y build-essential python3 make g++ \
	&& apt-get autoremove -y --purge \
	&& rm -rf /var/lib/apt/lists/*

COPY . .

EXPOSE 3000

CMD ["npm", "start"]