from fastapi import APIRouter, HTTPException
import yfinance as yf

router = APIRouter(prefix="/market", tags=["market"])


@router.get("/{ticker}")
def get_market_data(ticker: str):
    """Return current spot price, company name, and daily change for a ticker."""
    try:
        t = yf.Ticker(ticker.upper())
        info = t.fast_info
        spot = info.last_price
        prev = info.previous_close
        if not spot:
            raise HTTPException(status_code=404, detail=f"Ticker '{ticker}' not found.")
        change_pct = round((spot - prev) / prev * 100, 2) if prev else 0.0
        name = getattr(info, "exchange", ticker.upper())
        return {
            "ticker": ticker.upper(),
            "spot": round(float(spot), 2),
            "prev_close": round(float(prev), 2) if prev else None,
            "change_pct": change_pct,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/iv-surface/{ticker}")
def get_iv_surface(ticker: str):
    """
    Fetch the real implied volatility surface from market option chains.
    Returns strikes, expiries, and IV values for a heatmap.
    """
    try:
        t = yf.Ticker(ticker.upper())
        expiries = t.options[:6]  # Limit to 6 nearest expiries
        if not expiries:
            raise HTTPException(status_code=404, detail="No options data found.")

        rows = []
        for exp in expiries:
            chain = t.option_chain(exp)
            for _, row in chain.calls.iterrows():
                if row.get("impliedVolatility") and row["impliedVolatility"] > 0:
                    rows.append({
                        "expiry": exp,
                        "strike": float(row["strike"]),
                        "iv": round(float(row["impliedVolatility"]), 4),
                        "type": "call",
                    })
            for _, row in chain.puts.iterrows():
                if row.get("impliedVolatility") and row["impliedVolatility"] > 0:
                    rows.append({
                        "expiry": exp,
                        "strike": float(row["strike"]),
                        "iv": round(float(row["impliedVolatility"]), 4),
                        "type": "put",
                    })

        spot = float(t.fast_info.last_price)
        return {"ticker": ticker.upper(), "spot": spot, "data": rows}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
