FROM python:3.13-slim
RUN pip install --no-cache-dir requests
WORKDIR /app
COPY seed.py seed_data.json ./
RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser
CMD ["python", "seed.py"]
