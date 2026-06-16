import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

logging.getLogger("app").setLevel(logging.INFO)

from app.core.database import SessionLocal
from app.routers import auth, bills, export
from app.services.reminder_job import send_daily_reminders


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler = BackgroundScheduler()
    scheduler.add_job(
        send_daily_reminders,
        "cron",
        minute=0,
        args=[SessionLocal],
    )
    scheduler.start()
    # Run once on startup so the current hour's reminders aren't missed after a restart
    send_daily_reminders(SessionLocal)
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(title="Pay Tracker API", version="0.1.0", lifespan=lifespan)

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
