FROM python:3.12-alpine
ENV PYTHONUNBUFFERED=1 PYTHONIOENCODING=utf-8 DATA_DIR=/data
RUN pip install --no-cache-dir requests
WORKDIR /app
COPY worker.py healthcheck.py ./
VOLUME /data
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["python", "healthcheck.py"]
CMD ["python", "worker.py"]
