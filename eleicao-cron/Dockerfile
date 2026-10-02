FROM python:3.12-alpine
ENV PYTHONUNBUFFERED=1 DATA_DIR=/data
RUN pip install --no-cache-dir requests
WORKDIR /app
COPY worker.py .
VOLUME /data
CMD ["python", "worker.py"]
