"""
Data Profiling Service — computes descriptive statistics and detects analytical capabilities.
"""
from typing import Dict, Any, List
import pandas as pd
import numpy as np


def compute_profile(df: pd.DataFrame) -> Dict[str, Any]:
    """Return a full profiling report for a DataFrame."""
    summary = {
        "row_count": int(len(df)),
        "column_count": int(len(df.columns)),
        "total_missing": int(df.isnull().sum().sum()),
        "total_duplicate_rows": int(df.duplicated().sum()),
        "memory_usage_bytes": int(df.memory_usage(deep=True).sum()),
    }

    columns = {}
    warnings = []

    for col in df.columns:
        series = df[col]
        dtype = str(series.dtype)
        null_count = int(series.isnull().sum())
        null_pct = round(null_count / len(series) * 100, 2) if len(series) > 0 else 0
        unique_count = int(series.nunique(dropna=True))

        col_info: Dict[str, Any] = {
            "dtype": dtype,
            "null_count": null_count,
            "null_pct": null_pct,
            "unique_count": unique_count,
            "column_type": "unknown",
        }

        # Determine column type and compute stats
        if pd.api.types.is_numeric_dtype(series):
            col_info["column_type"] = "numeric"
            desc = series.describe()
            col_info.update({
                "mean": _safe_float(desc.get("mean")),
                "median": _safe_float(series.median()),
                "std": _safe_float(desc.get("std")),
                "min": _safe_float(desc.get("min")),
                "max": _safe_float(desc.get("max")),
                "q25": _safe_float(desc.get("25%")),
                "q75": _safe_float(desc.get("75%")),
            })
            # Outlier detection (IQR)
            q1 = series.quantile(0.25)
            q3 = series.quantile(0.75)
            iqr = q3 - q1
            if iqr > 0:
                outlier_count = int(((series < q1 - 1.5 * iqr) | (series > q3 + 1.5 * iqr)).sum())
                col_info["outlier_count"] = outlier_count
                if outlier_count > 0:
                    warnings.append(f"Column '{col}' has {outlier_count} potential outliers (IQR method).")

            # Distribution histogram (10 bins)
            try:
                counts, edges = np.histogram(series.dropna(), bins=10)
                col_info["histogram"] = {
                    "counts": counts.tolist(),
                    "edges": [round(e, 4) for e in edges.tolist()],
                }
            except Exception:
                pass

        elif _is_datetime_col(series, col):
            col_info["column_type"] = "datetime"
            parsed = pd.to_datetime(series, errors="coerce")
            col_info["min_date"] = str(parsed.min()) if not pd.isna(parsed.min()) else None
            col_info["max_date"] = str(parsed.max()) if not pd.isna(parsed.max()) else None

        else:
            col_info["column_type"] = "categorical"
            top_values = series.value_counts(dropna=True).head(10)
            col_info["top_values"] = {str(k): int(v) for k, v in top_values.items()}
            if unique_count > 0.9 * len(series) and len(series) > 20:
                col_info["is_identifier_candidate"] = True

        # Missing value warnings
        if null_pct > 50:
            warnings.append(f"Column '{col}' has {null_pct}% missing values — consider dropping or imputing.")
        elif null_pct > 0:
            warnings.append(f"Column '{col}' has {null_pct}% missing values.")

        columns[col] = col_info

    return {"summary": summary, "columns": columns, "warnings": warnings}


def compute_capabilities(df: pd.DataFrame) -> Dict[str, Any]:
    """Detect which analytical features are available for this dataset."""
    cols = list(df.columns)
    numeric_cols = [c for c in cols if pd.api.types.is_numeric_dtype(df[c])]
    categorical_cols = [c for c in cols if not pd.api.types.is_numeric_dtype(df[c]) and not _is_datetime_col(df[c], c)]
    datetime_cols = [c for c in cols if _is_datetime_col(df[c], c)]

    # Identifier heuristics
    id_cols = [c for c in cols if df[c].nunique() >= len(df) * 0.9 and len(df) > 10]

    capabilities = {
        "eda": len(numeric_cols) > 0 or len(categorical_cols) > 0,
        "clustering": len(numeric_cols) >= 2,
        "correlation": len(numeric_cols) >= 2,
        "forecasting": len(datetime_cols) > 0 and len(numeric_cols) > 0,
        "regression": len(numeric_cols) >= 2,
        "classification": len(categorical_cols) > 0 or len(numeric_cols) > 0,
        "anomaly_detection": len(numeric_cols) >= 1,
        "association_rules": False,  # requires transaction structure detection
        "numeric_columns": numeric_cols,
        "categorical_columns": categorical_cols,
        "datetime_columns": datetime_cols,
        "identifier_columns": id_cols,
        "geographic_columns": [c for c in cols if any(g in c.lower() for g in ["country", "region", "city", "state", "lat", "lon", "geo", "location"])],
    }

    txn_candidates = [c for c in cols if any(t in c.lower() for t in ["order", "transaction", "invoice", "basket", "receipt"])]
    item_candidates = [c for c in cols if any(t in c.lower() for t in ["product", "item", "sku", "article", "goods"])]
    if txn_candidates and item_candidates:
        capabilities["association_rules"] = True
        capabilities["transaction_columns"] = txn_candidates
        capabilities["item_columns"] = item_candidates

    capabilities["can_clustering"] = capabilities["clustering"]
    capabilities["can_forecast"] = capabilities["forecasting"]
    capabilities["can_association_rules"] = capabilities["association_rules"]
    capabilities["can_classification"] = capabilities["classification"]
    capabilities["can_regression"] = capabilities["regression"]
    capabilities["can_star_schema"] = len(numeric_cols) > 0 and len(categorical_cols) > 0
    capabilities["candidate_measures"] = numeric_cols
    capabilities["candidate_dimensions"] = categorical_cols
    capabilities["candidate_dates"] = datetime_cols

    return capabilities


def _safe_float(val) -> Any:
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return None
    return round(float(val), 4)


def _is_datetime_col(series: pd.Series, col_name: str) -> bool:
    """Heuristic: detect datetime columns by name or by trying to parse."""
    date_keywords = ["date", "time", "dt", "timestamp", "created", "updated", "period", "year", "month"]
    if any(kw in col_name.lower() for kw in date_keywords):
        return True
    if pd.api.types.is_datetime64_any_dtype(series):
        return True
    return False
