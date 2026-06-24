FROM python:3.13-slim
RUN pip install --no-cache-dir requests
WORKDIR /app
COPY seed.py seed_data.json ./
CMD ["python", "seed.py"]
