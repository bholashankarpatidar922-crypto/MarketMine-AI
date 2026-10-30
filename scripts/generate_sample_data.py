"""
Generate realistic synthetic dataset for MarketMine AI.
Supports:
- Association rule mining (order_id, product_name)
- Customer clustering (customer_id, revenue, quantity, profit)
- Time series forecasting (order_date, revenue)
- Classification (customer_segment or return_status)
- Regression (predicting revenue or profit)
- Star schema modeling (Fact Sales, Dim Customer, Dim Product, Dim Date)
"""
import os
import random
import pandas as pd
from datetime import datetime, timedelta

random.seed(42)

products = [
    ("Wireless Mouse", "Electronics", 29.99),
    ("Mechanical Keyboard", "Electronics", 89.99),
    ("USB-C Hub", "Electronics", 34.99),
    ("Noise-Cancelling Headphones", "Electronics", 199.99),
    ("Ultra-Wide Monitor", "Electronics", 349.99),
    ("Ergonomic Office Chair", "Furniture", 249.99),
    ("Standing Desk Converter", "Furniture", 179.99),
    ("Leather Desk Pad", "Furniture", 39.99),
    ("LED Desk Lamp", "Furniture", 49.99),
    ("Stainless Steel Water Bottle", "Lifestyle", 24.99),
    ("Ceramic Coffee Mug", "Lifestyle", 14.99),
    ("Laptop Backpack", "Lifestyle", 69.99),
    ("Webcam HD 1080p", "Electronics", 59.99),
    ("Desk Cable Organizer", "Accessories", 12.99),
    ("Bluetooth Speaker", "Electronics", 45.99),
]

regions = ["North America", "Europe", "Asia-Pacific", "Latin America"]
payment_methods = ["Credit Card", "PayPal", "Bank Transfer", "Apple Pay"]
segments = ["Consumer", "Corporate", "Home Office"]

start_date = datetime(2024, 1, 1)

rows = []
order_counter = 1000

for i in range(1, 151):  # 150 customers
    cust_id = f"CUST-{i:04d}"
    cust_seg = random.choices(segments, weights=[0.5, 0.3, 0.2])[0]
    cust_region = random.choice(regions)
    
    # 2 to 6 orders per customer
    num_orders = random.randint(2, 6)
    for _ in range(num_orders):
        order_counter += 1
        order_id = f"ORD-{order_counter}"
        order_date = start_date + timedelta(days=random.randint(0, 360))
        pay_method = random.choice(payment_methods)
        
        # 1 to 4 items in each order (for market basket association rules!)
        num_items = random.choices([1, 2, 3, 4], weights=[0.4, 0.35, 0.15, 0.1])[0]
        chosen_prods = random.sample(products, k=min(num_items, len(products)))
        
        # Cross-selling patterns: Mouse frequently bought with Keyboard
        if any(p[0] == "Wireless Mouse" for p in chosen_prods) and random.random() < 0.6:
            kb = [p for p in products if p[0] == "Mechanical Keyboard"][0]
            if kb not in chosen_prods:
                chosen_prods.append(kb)
                
        for prod_name, cat, unit_price in chosen_prods:
            qty = random.choices([1, 2, 3, 4, 5], weights=[0.55, 0.25, 0.1, 0.05, 0.05])[0]
            discount = random.choices([0.0, 0.05, 0.1, 0.15, 0.2], weights=[0.4, 0.2, 0.2, 0.1, 0.1])[0]
            rev = round(qty * unit_price * (1 - discount), 2)
            cost = round(qty * unit_price * random.uniform(0.55, 0.70), 2)
            profit = round(rev - cost, 2)
            returned = "Yes" if random.random() < 0.06 else "No"
            
            rows.append({
                "order_id": order_id,
                "customer_id": cust_id,
                "order_date": order_date.strftime("%Y-%m-%d"),
                "product_name": prod_name,
                "category": cat,
                "quantity": qty,
                "unit_price": unit_price,
                "discount_pct": discount,
                "revenue": rev,
                "profit": profit,
                "payment_method": pay_method,
                "region": cust_region,
                "customer_segment": cust_seg,
                "returned": returned
            })

df = pd.DataFrame(rows)
df = df.sort_values("order_date").reset_index(drop=True)

out_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "sample")
os.makedirs(out_dir, exist_ok=True)
csv_path = os.path.join(out_dir, "ecommerce_sample.csv")
df.to_csv(csv_path, index=False)
print(f"Generated {len(df)} rows to {csv_path}")
