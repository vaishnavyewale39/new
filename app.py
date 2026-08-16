"""PRAGATI AI local FastAPI inference service.

This service loads user-supplied LightGBM artefacts from PRAGATI_MODEL_DIR and
serves development-time predictions from the feature-engineered CSV. It is
intentionally local-only; the Vite proxy exposes it to the React app at
/api/model during development.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware


MODEL_DIR = Path(os.environ.get("PRAGATI_MODEL_DIR", "/home/ubuntu/upload"))
FEATURE_DATA_PATH = Path(
    os.environ.get("PRAGATI_FEATURE_DATA", str(MODEL_DIR / "commodity_price_features.csv"))
)
CATEGORICAL_COLUMNS = ["commodity", "centre", "category", "state", "hub_name"]
COMMODITY_ALIASES = {
    "gram dal": "Gram",
    "tur dal": "Tur (Arhar)",
}


class ModelRuntime:
    """Lazily loads model artefacts and prepares valid one-row feature frames."""

    def __init__(self) -> None:
        self.regressor: Any | None = None
        self.classifier: Any | None = None
        self.feature_columns: list[str] = []
        self.frame: pd.DataFrame | None = None
        self.category_levels: dict[str, list[str]] = {}
        self.error: str | None = None

    def ensure_loaded(self) -> None:
        if self.frame is not None or self.error:
            return

        try:
            paths = {
                "regressor": MODEL_DIR / "model_price_momentum_regressor.pkl",
                "classifier": MODEL_DIR / "model_price_spike_classifier.pkl",
                "features": MODEL_DIR / "model_feature_columns.pkl",
            }
            missing = [name for name, path in paths.items() if not path.exists()]
            if not FEATURE_DATA_PATH.exists():
                missing.append("feature dataset")
            if missing:
                raise FileNotFoundError(f"Missing local artefact(s): {', '.join(missing)}")

            self.regressor = joblib.load(paths["regressor"])
            self.classifier = joblib.load(paths["classifier"])
            self.feature_columns = [str(column) for column in joblib.load(paths["features"])]

            frame = pd.read_csv(FEATURE_DATA_PATH, parse_dates=["date"], low_memory=False)
            required = set(self.feature_columns + ["date", "modal_price_rs_per_quintal"])
            absent = sorted(required.difference(frame.columns))
            if absent:
                raise ValueError(f"Feature data is missing required columns: {', '.join(absent)}")

            frame["has_msp"] = frame["msp_rs_per_quintal"].notna().astype(int)
            frame["msp_rs_per_quintal"] = frame["msp_rs_per_quintal"].fillna(0)
            frame["has_buffer_stock_scheme"] = frame["buffer_stock_tonnes"].notna().astype(int)
            frame["buffer_stock_tonnes"] = frame["buffer_stock_tonnes"].fillna(0)
            frame = frame.dropna(subset=self.feature_columns).sort_values("date").reset_index(drop=True)
            if frame.empty:
                raise ValueError("No rows contain the complete model feature set.")

            self.category_levels = {
                column: sorted(frame[column].astype(str).dropna().unique().tolist())
                for column in CATEGORICAL_COLUMNS
            }
            self.frame = frame
        except Exception as exc:  # Surface a useful local-development response without crashing the process.
            self.error = f"Unable to initialise local models: {exc}"

    def _require_ready(self) -> pd.DataFrame:
        self.ensure_loaded()
        if self.error or self.frame is None or self.regressor is None or self.classifier is None:
            raise HTTPException(status_code=503, detail=self.error or "Local model runtime is unavailable.")
        return self.frame

    def available_commodities(self) -> list[str]:
        frame = self._require_ready()
        return sorted(frame["commodity"].dropna().astype(str).unique().tolist())

    def latest_prediction(self, commodity: str, centre: str | None = None) -> dict[str, Any]:
        frame = self._require_ready()
        canonical = COMMODITY_ALIASES.get(commodity.casefold(), commodity)
        matches = frame[frame["commodity"].astype(str).str.casefold() == canonical.casefold()]
        if centre:
            centre_matches = matches[matches["centre"].astype(str).str.casefold() == centre.casefold()]
            if not centre_matches.empty:
                matches = centre_matches
        if matches.empty:
            raise HTTPException(
                status_code=404,
                detail={
                    "message": f"No complete inference row is available for '{commodity}'.",
                    "available_commodities": self.available_commodities(),
                },
            )

        row = matches.sort_values("date").iloc[-1]
        features = pd.DataFrame([row[self.feature_columns].to_dict()], columns=self.feature_columns)
        for column in CATEGORICAL_COLUMNS:
            features[column] = pd.Categorical(
                features[column].astype(str), categories=self.category_levels[column]
            )

        predicted_return = float(self.regressor.predict(features)[0])
        spike_probability = float(self.classifier.predict_proba(features)[0][1])
        observed_price_per_kg = float(row["modal_price_rs_per_quintal"]) / 100
        predicted_price_per_kg = observed_price_per_kg * (1 + predicted_return / 100)

        return {
            "commodity": str(row["commodity"]),
            "category": str(row["category"]),
            "source_centre": str(row["centre"]),
            "state": str(row["state"]),
            "observation_date": row["date"].date().isoformat(),
            "observed_price_per_kg": round(observed_price_per_kg, 2),
            "predicted_return_7d_pct": round(predicted_return, 3),
            "predicted_price_per_kg": round(predicted_price_per_kg, 2),
            "spike_probability": round(spike_probability, 4),
            "feature_count": len(self.feature_columns),
            "model_source": "Local FastAPI / supplied LightGBM artefacts",
        }


runtime = ModelRuntime()
app = FastAPI(title="PRAGATI AI Local Model API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, Any]:
    runtime.ensure_loaded()
    return {
        "status": "ready" if runtime.error is None and runtime.frame is not None else "unavailable",
        "model_dir": str(MODEL_DIR),
        "feature_data": str(FEATURE_DATA_PATH),
        "error": runtime.error,
    }


@app.get("/api/commodities")
def commodities() -> dict[str, list[str]]:
    return {"commodities": runtime.available_commodities()}


@app.get("/api/predictions/latest")
def latest_prediction(
    commodity: str = Query(..., min_length=1, description="Commodity name used by the dashboard"),
    centre: str | None = Query(None, description="Optional reporting centre"),
) -> dict[str, Any]:
    return runtime.latest_prediction(commodity=commodity, centre=centre)
