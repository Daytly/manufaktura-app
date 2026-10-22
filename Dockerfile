FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 DATA_DIR=/data
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY server.py remarked.py ./
COPY index.html app.js booking-api.js config.js data.js robots.txt ./
COPY fonts ./fonts
COPY img ./img
RUN mkdir -p /data && chmod 700 /data
EXPOSE 8080
CMD ["gunicorn", "--workers", "1", "--threads", "4", "--timeout", "120", "--bind", "0.0.0.0:8080", "server:app"]
