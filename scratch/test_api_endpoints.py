import httpx

client = httpx.Client(base_url="http://127.0.0.1:8000/api", timeout=10.0)

endpoints = [
    "/health",
    "/summary",
    "/communities",
    "/communities/3",
    "/communities/3/accounts?page=1&page_size=5",
    "/graph/community/3?max_nodes=10&max_edges=20",
    "/timeline/community/3?limit=10&offset=0",
    "/accounts/acc_00000",
    "/accounts/acc_00000/transactions?page=1&page_size=5",
    "/accounts/acc_00000/connections",
    "/transactions/tx_0000000",
]

for ep in endpoints:
    try:
        r = client.get(ep)
        print(f"{ep:55} -> {r.status_code} ({len(r.content)} bytes)")
    except httpx.HTTPError as e:
        print(f"{ep:55} -> ERROR: {e}")

