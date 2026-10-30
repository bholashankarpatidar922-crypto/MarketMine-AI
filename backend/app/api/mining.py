"""
Data Mining API — Association Rules, Clustering, Classification,
Regression, Anomaly Detection, and EDA.
"""
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, create_engine
import pandas as pd
import numpy as np

from app.database.session import get_db, AsyncSessionLocal
from app.models import User, Project, Dataset, Experiment, ModelRun, BackgroundJob
from app.schemas.schemas import ExperimentCreate, ExperimentOut, ModelRunOut
from app.auth.dependencies import get_current_user
from app.core.config import settings
from app.core.logging_config import logger
from datetime import datetime, timezone

router = APIRouter(prefix="/mining", tags=["Data Mining"])


def _sync_engine():
    url = settings.DATABASE_URL.replace("sqlite+aiosqlite", "sqlite").replace("+aiosqlite", "")
    return create_engine(url, connect_args={"check_same_thread": False})


async def _verify_project_dataset(dataset_id: str, project_id: str, user: User, db: AsyncSession) -> Dataset:
    ds = await db.execute(select(Dataset).where(Dataset.id == dataset_id, Dataset.project_id == project_id))
    ds = ds.scalars().first()
    if not ds:
        raise HTTPException(404, "Dataset not found in project")
    proj = await db.execute(select(Project).where(Project.id == project_id))
    proj = proj.scalars().first()
    if not proj or proj.owner_id != user.id:
        raise HTTPException(403, "Access denied")
    return ds


@router.post("/experiments", response_model=ExperimentOut, status_code=201)
async def create_experiment(
    payload: ExperimentCreate,
    project_id: str,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ds = await _verify_project_dataset(payload.dataset_id, project_id, user, db)
    exp = Experiment(
        project_id=project_id,
        dataset_id=payload.dataset_id,
        name=payload.name,
        task_type=payload.task_type,
        algorithm=payload.algorithm,
        parameters_json=payload.parameters_json,
        features_json=payload.features_json,
        target_column=payload.target_column,
        status="pending",
    )
    db.add(exp)
    await db.flush()
    background_tasks.add_task(_run_experiment, exp.id, ds.table_name)
    return exp


@router.get("/experiments/{project_id}", response_model=List[ExperimentOut])
async def list_experiments(
    project_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    proj = await db.execute(select(Project).where(Project.id == project_id))
    proj = proj.scalars().first()
    if not proj or proj.owner_id != user.id:
        raise HTTPException(403, "Access denied")
    result = await db.execute(select(Experiment).where(Experiment.project_id == project_id).order_by(Experiment.created_at.desc()))
    return result.scalars().all()


@router.get("/experiments/{project_id}/{experiment_id}/runs", response_model=List[ModelRunOut])
async def list_runs(
    project_id: str,
    experiment_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    proj = await db.execute(select(Project).where(Project.id == project_id))
    proj = proj.scalars().first()
    if not proj or proj.owner_id != user.id:
        raise HTTPException(403, "Access denied")
    result = await db.execute(select(ModelRun).where(ModelRun.experiment_id == experiment_id).order_by(ModelRun.created_at.desc()))
    return result.scalars().all()


@router.post("/eda/{project_id}/{dataset_id}")
async def run_eda(
    project_id: str,
    dataset_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return full EDA including distributions, correlations, and chart data."""
    ds = await _verify_project_dataset(dataset_id, project_id, user, db)
    engine = _sync_engine()
    try:
        df = pd.read_sql_table(ds.table_name, engine)
    except Exception as e:
        raise HTTPException(500, f"Could not read dataset: {str(e)}")
    finally:
        engine.dispose()

    from app.services.profiling_service import compute_profile, compute_capabilities
    profile = compute_profile(df)
    capabilities = compute_capabilities(df)

    # Correlation matrix for numeric columns
    numeric_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
    corr_matrix = {}
    if len(numeric_cols) >= 2:
        corr = df[numeric_cols].corr()
        corr_matrix = {
            "columns": numeric_cols,
            "data": [[None if pd.isna(v) else round(v, 3) for v in row] for row in corr.values.tolist()],
        }

    return {
        "profile": profile,
        "capabilities": capabilities,
        "correlation_matrix": corr_matrix,
        "numeric_columns": numeric_cols,
    }


async def _run_experiment(experiment_id: str, table_name: str):
    """Background task: execute the data mining experiment."""
    async with AsyncSessionLocal() as db:
        try:
            exp = await db.get(Experiment, experiment_id)
            exp.status = "running"
            await db.commit()

            engine = _sync_engine()
            df = pd.read_sql_table(table_name, engine)
            engine.dispose()

            start = datetime.now(timezone.utc)
            task = exp.task_type

            if task == "clustering":
                metrics, results = _run_clustering(df, exp.features_json, exp.parameters_json)
            elif task == "association_rules":
                metrics, results = _run_association_rules(df, exp.parameters_json)
            elif task == "classification":
                metrics, results = _run_classification(df, exp.features_json, exp.target_column, exp.algorithm, exp.parameters_json)
            elif task == "regression":
                metrics, results = _run_regression(df, exp.features_json, exp.target_column, exp.algorithm, exp.parameters_json)
            elif task == "anomaly_detection":
                metrics, results = _run_anomaly(df, exp.features_json, exp.parameters_json)
            elif task == "forecasting":
                metrics, results = _run_forecasting(df, exp.parameters_json)
            else:
                raise ValueError(f"Unknown task type: {task}")

            duration = int((datetime.now(timezone.utc) - start).total_seconds() * 1000)

            run = ModelRun(
                experiment_id=experiment_id,
                algorithm=exp.algorithm,
                parameters_json=exp.parameters_json,
                metrics_json=metrics,
                results_json=results,
                duration_ms=duration,
                status="completed",
            )
            db.add(run)
            exp.status = "completed"
            await db.commit()

        except Exception as e:
            logger.error(f"Experiment {experiment_id} failed: {e}", exc_info=True)
            try:
                exp = await db.get(Experiment, experiment_id)
                exp.status = "failed"
                run = ModelRun(
                    experiment_id=experiment_id,
                    algorithm=exp.algorithm if exp else "",
                    parameters_json={},
                    metrics_json={},
                    results_json={},
                    status="failed",
                    error_message=str(e),
                )
                db.add(run)
                await db.commit()
            except Exception:
                pass


def _run_clustering(df: pd.DataFrame, features: list, params: dict):
    from sklearn.cluster import KMeans, DBSCAN
    from sklearn.preprocessing import StandardScaler
    from sklearn.metrics import silhouette_score

    num_cols = [c for c in features if c in df.columns and pd.api.types.is_numeric_dtype(df[c])]
    if len(num_cols) < 2:
        num_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])][:5]
    if len(num_cols) < 2:
        raise ValueError("Need at least 2 numeric columns for clustering")

    X = df[num_cols].dropna()
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    algorithm = params.get("algorithm", "kmeans")
    k = int(params.get("k", 3))

    if algorithm == "dbscan":
        model = DBSCAN(eps=params.get("eps", 0.5), min_samples=params.get("min_samples", 5))
    else:
        model = KMeans(n_clusters=k, random_state=42, n_init=10)

    labels = model.fit_predict(X_scaled)
    unique_labels = set(labels) - {-1}

    metrics = {"n_clusters": len(unique_labels)}
    if len(unique_labels) >= 2:
        sil = silhouette_score(X_scaled, labels) if len(unique_labels) > 1 else 0
        metrics["silhouette_score"] = round(float(sil), 4)

    # Elbow method for KMeans
    elbow = []
    if algorithm == "kmeans":
        for ki in range(2, min(11, len(X))):
            km = KMeans(n_clusters=ki, random_state=42, n_init=10)
            km.fit(X_scaled)
            elbow.append({"k": ki, "inertia": round(float(km.inertia_), 2)})

    # Cluster profiles
    X["cluster"] = labels
    profiles = X.groupby("cluster")[num_cols].mean().round(3).to_dict(orient="index")
    profiles = {int(k): v for k, v in profiles.items()}

    # 2D scatter plot data (first 2 features)
    scatter = {
        "x": X[num_cols[0]].tolist()[:500],
        "y": X[num_cols[1]].tolist()[:500],
        "cluster": labels[:500].tolist(),
        "x_label": num_cols[0],
        "y_label": num_cols[1],
    }

    return metrics, {"elbow": elbow, "cluster_profiles": profiles, "scatter": scatter, "features_used": num_cols}


def _run_association_rules(df: pd.DataFrame, params: dict):
    from mlxtend.frequent_patterns import apriori, association_rules as ar_func
    from mlxtend.preprocessing import TransactionEncoder

    min_support = float(params.get("min_support", 0.01))
    min_confidence = float(params.get("min_confidence", 0.3))
    min_lift = float(params.get("min_lift", 1.0))

    # Detect transaction/item columns
    txn_col = params.get("transaction_col")
    item_col = params.get("item_col")

    if not txn_col or not item_col:
        # Auto-detect
        for c in df.columns:
            if any(t in c.lower() for t in ["order", "transaction", "invoice"]) and not txn_col:
                txn_col = c
            if any(t in c.lower() for t in ["product", "item", "sku"]) and not item_col:
                item_col = c

    if not txn_col or not item_col:
        raise ValueError("Cannot detect transaction and item columns. Specify transaction_col and item_col.")

    basket = df.groupby([txn_col, item_col]).size().unstack(fill_value=0)
    basket = (basket > 0).astype(int)

    frequent_items = apriori(basket, min_support=min_support, use_colnames=True, max_len=4)
    if frequent_items.empty:
        return {"rule_count": 0}, {"rules": [], "frequent_items": []}

    rules = ar_func(frequent_items, metric="confidence", min_threshold=min_confidence)
    rules = rules[rules["lift"] >= min_lift].sort_values("lift", ascending=False)

    rules_out = []
    for _, row in rules.head(50).iterrows():
        rules_out.append({
            "antecedents": list(row["antecedents"]),
            "consequents": list(row["consequents"]),
            "support": round(float(row["support"]), 4),
            "confidence": round(float(row["confidence"]), 4),
            "lift": round(float(row["lift"]), 4),
        })

    fi_out = []
    for _, row in frequent_items.head(20).iterrows():
        fi_out.append({"itemset": list(row["itemsets"]), "support": round(float(row["support"]), 4)})

    metrics = {"rule_count": len(rules), "frequent_itemset_count": len(frequent_items)}
    return metrics, {"rules": rules_out, "frequent_items": fi_out}


def _run_classification(df: pd.DataFrame, features: list, target: str, algorithm: str, params: dict):
    from sklearn.model_selection import train_test_split
    from sklearn.tree import DecisionTreeClassifier
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.linear_model import LogisticRegression
    from sklearn.naive_bayes import GaussianNB
    from sklearn.neighbors import KNeighborsClassifier
    from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
    from sklearn.preprocessing import LabelEncoder

    if target not in df.columns:
        raise ValueError(f"Target column '{target}' not found")

    num_feats = [f for f in features if f in df.columns and pd.api.types.is_numeric_dtype(df[f])]
    if not num_feats:
        num_feats = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c]) and c != target][:10]

    data = df[num_feats + [target]].dropna()
    X = data[num_feats]
    y = data[target]

    if y.dtype == object:
        le = LabelEncoder()
        y = le.fit_transform(y)

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y if len(set(y)) < 20 else None)

    models = {
        "decision_tree": DecisionTreeClassifier(random_state=42),
        "random_forest": RandomForestClassifier(n_estimators=params.get("n_estimators", 100), random_state=42),
        "logistic_regression": LogisticRegression(max_iter=500, random_state=42),
        "naive_bayes": GaussianNB(),
        "knn": KNeighborsClassifier(n_neighbors=params.get("n_neighbors", 5)),
    }
    model = models.get(algorithm, RandomForestClassifier(random_state=42))
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)

    acc = accuracy_score(y_test, y_pred)
    report = classification_report(y_test, y_pred, output_dict=True, zero_division=0)
    cm = confusion_matrix(y_test, y_pred).tolist()

    metrics = {"accuracy": round(float(acc), 4), "test_size": len(X_test), "train_size": len(X_train)}
    results = {"classification_report": report, "confusion_matrix": cm, "features_used": num_feats}
    return metrics, results


def _run_regression(df: pd.DataFrame, features: list, target: str, algorithm: str, params: dict):
    from sklearn.model_selection import train_test_split
    from sklearn.linear_model import LinearRegression
    from sklearn.ensemble import RandomForestRegressor
    from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

    if target not in df.columns:
        raise ValueError(f"Target column '{target}' not found")

    num_feats = [f for f in features if f in df.columns and pd.api.types.is_numeric_dtype(df[f]) and f != target]
    if not num_feats:
        num_feats = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c]) and c != target][:10]

    data = df[num_feats + [target]].dropna()
    X = data[num_feats]
    y = data[target]

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    model = LinearRegression() if algorithm == "linear_regression" else RandomForestRegressor(n_estimators=100, random_state=42)
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)

    mae = mean_absolute_error(y_test, y_pred)
    mse = mean_squared_error(y_test, y_pred)
    r2 = r2_score(y_test, y_pred)

    metrics = {
        "r2": round(float(r2), 4),
        "mae": round(float(mae), 4),
        "rmse": round(float(mse ** 0.5), 4),
        "train_size": len(X_train),
        "test_size": len(X_test),
    }

    # Prediction vs actual for chart
    pred_vs_actual = {"actual": y_test.tolist()[:200], "predicted": y_pred.tolist()[:200]}
    return metrics, {"pred_vs_actual": pred_vs_actual, "features_used": num_feats}


def _run_anomaly(df: pd.DataFrame, features: list, params: dict):
    from sklearn.ensemble import IsolationForest

    num_cols = [f for f in features if f in df.columns and pd.api.types.is_numeric_dtype(df[f])]
    if not num_cols:
        num_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])][:5]

    X = df[num_cols].dropna()
    contamination = float(params.get("contamination", 0.05))
    method = params.get("method", "isolation_forest")

    anomaly_flags = []
    if method == "isolation_forest":
        model = IsolationForest(contamination=contamination, random_state=42)
        preds = model.fit_predict(X)
        anomaly_flags = (preds == -1).tolist()
    elif method == "zscore":
        from scipy import stats
        z_scores = np.abs(stats.zscore(X))
        anomaly_flags = (z_scores > 3).any(axis=1).tolist()
    elif method == "iqr":
        q1, q3 = X.quantile(0.25), X.quantile(0.75)
        iqr = q3 - q1
        anomaly_flags = ((X < q1 - 1.5 * iqr) | (X > q3 + 1.5 * iqr)).any(axis=1).tolist()

    anomaly_count = sum(anomaly_flags)
    anomaly_indices = [i for i, f in enumerate(anomaly_flags) if f]
    anomaly_rows = X.iloc[anomaly_indices[:100]].to_dict(orient="records")

    metrics = {"anomaly_count": anomaly_count, "anomaly_rate": round(anomaly_count / len(X), 4)}
    return metrics, {"anomaly_rows": anomaly_rows, "anomaly_indices": anomaly_indices[:100], "features_used": num_cols}


def _run_forecasting(df: pd.DataFrame, params: dict):
    from statsmodels.tsa.holtwinters import ExponentialSmoothing
    from sklearn.metrics import mean_absolute_error, mean_squared_error

    date_col = params.get("date_col")
    value_col = params.get("value_col") or params.get("target_col")
    horizon = int(params.get("horizon", 12))

    if not date_col or not value_col:
        raise ValueError("Specify date_col and value_col for forecasting")

    ts = df[[date_col, value_col]].dropna()
    ts[date_col] = pd.to_datetime(ts[date_col])
    daily_ts = ts.groupby(date_col)[value_col].sum().sort_index()
    daily_ts = daily_ts.asfreq("D", fill_value=0)

    series_vals = daily_ts.values
    if len(series_vals) < 5:
        raise ValueError("Need at least 5 distinct dates for forecasting")

    split = max(1, int(len(series_vals) * 0.8))
    train_vals, test_vals = series_vals[:split], series_vals[split:]

    try:
        model = ExponentialSmoothing(train_vals, trend="add", seasonal=None)
        fitted = model.fit()
        test_pred = fitted.forecast(len(test_vals))
        future_pred = fitted.forecast(len(test_vals) + horizon)[len(test_vals):]
    except Exception:
        model = ExponentialSmoothing(train_vals)
        fitted = model.fit()
        test_pred = fitted.forecast(len(test_vals))
        future_pred = fitted.forecast(len(test_vals) + horizon)[len(test_vals):]

    mae = mean_absolute_error(test_vals, test_pred) if len(test_vals) > 0 else 0.0
    rmse = (mean_squared_error(test_vals, test_pred) ** 0.5) if len(test_vals) > 0 else 0.0

    last_date = daily_ts.index[-1]
    future_dates = [d.strftime("%Y-%m-%d") for d in pd.date_range(last_date + pd.Timedelta(days=1), periods=horizon)]

    metrics = {"mae": round(float(mae), 4), "rmse": round(float(rmse), 4), "horizon": horizon}
    results = {
        "historical": {"dates": [d.strftime("%Y-%m-%d") for d in daily_ts.index], "values": daily_ts.tolist()},
        "forecast": {"dates": future_dates, "values": [round(float(v), 2) for v in future_pred]},
        "test_actual": {"values": [round(float(v), 2) for v in test_vals]},
        "test_predicted": {"values": [round(float(v), 2) for v in test_pred]},
    }
    return metrics, results


# -------------------------------------------------------------------------
# Direct Interactive Mining Endpoints
# -------------------------------------------------------------------------

async def _get_dataset_and_df(dataset_id: str, user: User, db: AsyncSession):
    ds = await db.get(Dataset, dataset_id)
    if not ds:
        raise HTTPException(404, "Dataset not found")
    proj = await db.get(Project, ds.project_id)
    if not proj or proj.owner_id != user.id:
        raise HTTPException(403, "Access denied")
    engine = _sync_engine()
    df = pd.read_sql_table(ds.table_name, engine)
    engine.dispose()
    return ds, df


@router.post("/association-rules")
async def run_association_rules_endpoint(
    payload: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    dataset_id = payload.get("dataset_id")
    if not dataset_id:
        raise HTTPException(400, "dataset_id is required")
    ds, df = await _get_dataset_and_df(dataset_id, user, db)
    metrics, results = _run_association_rules(df, payload)

    # Persist experiment
    exp = Experiment(
        project_id=ds.project_id,
        dataset_id=dataset_id,
        name=f"Apriori - {datetime.now().strftime('%b %d %H:%M')}",
        task_type="association_rules",
        algorithm="apriori",
        parameters_json=payload,
        features_json=[payload.get("transaction_col", ""), payload.get("item_col", "")],
        status="completed",
    )
    db.add(exp)
    await db.commit()

    return {
        "rules": results.get("rules", []),
        "frequent_items": results.get("frequent_items", []),
        "metrics": metrics,
        "total_transactions": len(df[payload.get("transaction_col", df.columns[0])].unique()) if payload.get("transaction_col") in df.columns else len(df),
    }


@router.post("/clustering")
async def run_clustering_endpoint(
    payload: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    dataset_id = payload.get("dataset_id")
    if not dataset_id:
        raise HTTPException(400, "dataset_id is required")
    ds, df = await _get_dataset_and_df(dataset_id, user, db)
    features = payload.get("features", [])
    metrics, results = _run_clustering(df, features, {"k": payload.get("n_clusters", 3), "algorithm": payload.get("algorithm", "kmeans")})

    exp = Experiment(
        project_id=ds.project_id,
        dataset_id=dataset_id,
        name=f"KMeans (k={payload.get('n_clusters', 3)}) - {datetime.now().strftime('%b %d %H:%M')}",
        task_type="clustering",
        algorithm="kmeans",
        parameters_json=payload,
        features_json=features,
        status="completed",
    )
    db.add(exp)
    await db.commit()

    # Format cluster centers and profiles
    profiles = results.get("cluster_profiles", {})
    centers = [list(v.values()) for v in profiles.values()]

    return {
        "cluster_centers": centers,
        "metrics": metrics,
        "feature_names": results.get("features_used", features),
        "cluster_counts": {int(k): 0 for k in profiles.keys()},
        "profiles": profiles,
        "scatter": results.get("scatter", {}),
    }


@router.post("/classification")
async def run_classification_endpoint(
    payload: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    dataset_id = payload.get("dataset_id")
    target_col = payload.get("target_col")
    feature_cols = payload.get("feature_cols", [])
    algo = payload.get("algorithm", "random_forest")
    if not dataset_id or not target_col:
        raise HTTPException(400, "dataset_id and target_col are required")

    ds, df = await _get_dataset_and_df(dataset_id, user, db)
    metrics, results = _run_classification(df, feature_cols, target_col, algo, payload)

    exp = Experiment(
        project_id=ds.project_id,
        dataset_id=dataset_id,
        name=f"{algo} on {target_col} - {datetime.now().strftime('%b %d %H:%M')}",
        task_type="classification",
        algorithm=algo,
        target_column=target_col,
        parameters_json=payload,
        features_json=feature_cols,
        status="completed",
    )
    db.add(exp)
    await db.commit()

    return {
        "metrics": metrics,
        "feature_importances": results.get("feature_importances", {}),
        "classes": results.get("classes", []),
    }


@router.post("/regression")
async def run_regression_endpoint(
    payload: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    dataset_id = payload.get("dataset_id")
    target_col = payload.get("target_col")
    feature_cols = payload.get("feature_cols", [])
    algo = payload.get("algorithm", "random_forest")
    if not dataset_id or not target_col:
        raise HTTPException(400, "dataset_id and target_col are required")

    ds, df = await _get_dataset_and_df(dataset_id, user, db)
    metrics, results = _run_regression(df, feature_cols, target_col, algo, payload)

    exp = Experiment(
        project_id=ds.project_id,
        dataset_id=dataset_id,
        name=f"Regressor on {target_col} - {datetime.now().strftime('%b %d %H:%M')}",
        task_type="regression",
        algorithm=algo,
        target_column=target_col,
        parameters_json=payload,
        features_json=feature_cols,
        status="completed",
    )
    db.add(exp)
    await db.commit()

    return {
        "metrics": metrics,
        "pred_vs_actual": results.get("pred_vs_actual", {}),
    }


@router.post("/anomaly")
async def run_anomaly_endpoint(
    payload: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    dataset_id = payload.get("dataset_id")
    feature_cols = payload.get("feature_cols", [])
    method = payload.get("method", "isolation_forest")
    if not dataset_id:
        raise HTTPException(400, "dataset_id is required")

    ds, df = await _get_dataset_and_df(dataset_id, user, db)
    metrics, results = _run_anomaly(df, feature_cols, {"method": method})

    return {
        "outliers_count": metrics.get("anomaly_count", 0),
        "sample_outliers": results.get("anomaly_rows", []),
        "method": method,
        "metrics": metrics,
    }


@router.post("/forecast")
async def run_forecast_endpoint(
    payload: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    dataset_id = payload.get("dataset_id")
    date_col = payload.get("date_col")
    target_col = payload.get("target_col")
    horizon = int(payload.get("horizon", 14))

    if not dataset_id or not date_col or not target_col:
        raise HTTPException(400, "dataset_id, date_col, and target_col are required")

    ds, df = await _get_dataset_and_df(dataset_id, user, db)
    metrics, results = _run_forecasting(df, {"date_col": date_col, "value_col": target_col, "horizon": horizon})

    forecast_dates = results.get("forecast", {}).get("dates", [])
    forecast_vals = results.get("forecast", {}).get("values", [])

    return {
        "horizon": horizon,
        "forecast_values": [{"date": d, "value": v} for d, v in zip(forecast_dates, forecast_vals)],
        "metrics": metrics,
        "historical": results.get("historical", {}),
    }

