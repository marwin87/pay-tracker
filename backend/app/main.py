from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, bills, export

app = FastAPI(title="Pay Tracker API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3010"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(bills.router)
app.include_router(export.router)


@app.get("/health")
def health():
    return {"status": "ok"}
