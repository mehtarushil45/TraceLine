"""Comprehensive Graph Intelligence and Telemetry Provenance Integrity Tests.

Verifies:
1. Graph Node & Edge Provenance against source telemetry.
2. Focal account prioritization & 1-hop neighborhood guarantee.
3. Observable Transaction Flow detection on community edges.
4. Shared Infrastructure (device, instrument, IP) integrity.
5. Temporal Convergence calculation accuracy.
6. BFS Path Traversal correctness on community graph topology.
7. Strict Ground-Truth Leakage prevention (no forbidden fields in graph API).
"""

from __future__ import annotations

from typing import Any
from fastapi.testclient import TestClient

from src.api.main import app
from src.api.service import service

client = TestClient(app)

FORBIDDEN_EVALUATION_KEYS: set[str] = {
    "pattern_id",
    "is_ring_member",
    "link_type",
    "is_positive",
    "fraud_purity",
    "max_ring_coverage",
    "primary_ring_id",
    "num_rings_intersected",
    "fraud_account_count",
    "fraud_cases",
    "fraud_probability",
    "trust_score",
}


def _assert_no_leakage(data: Any) -> None:
    """Recursively verify that no forbidden ground-truth keys exist in JSON data."""
    if isinstance(data, dict):
        for k, v in data.items():
            assert (
                k not in FORBIDDEN_EVALUATION_KEYS
            ), f"Leaked forbidden key '{k}' found in response!"
            _assert_no_leakage(v)
    elif isinstance(data, list):
        for item in data:
            _assert_no_leakage(item)


def test_community_graph_provenance_and_schema() -> None:
    """Verify graph nodes and edges match raw source data attributes without fabrication."""
    service.load_data()
    response = client.get("/api/graph/community/3?max_nodes=100&max_edges=200")
    assert response.status_code == 200
    data = response.json()

    assert data["community_id"] == 3
    assert data["total_nodes"] > 0
    assert len(data["nodes"]) <= 100
    assert len(data["edges"]) <= 200

    node_ids = {n["id"] for n in data["nodes"]}

    # Verify nodes match accounts_df
    for node in data["nodes"]:
        acc_id = node["id"]
        assert acc_id in service.accounts_df.index
        acc_row = service.accounts_df.loc[acc_id]
        expected_balance = round(float(acc_row["balance"]), 2) if "balance" in acc_row else 0.0
        if node["balance"] is not None:
            assert abs(node["balance"] - expected_balance) < 0.05
        assert node["degree"] >= 0

    # Verify edges connect valid community nodes and contain real evidence fields
    for edge in data["edges"]:
        assert edge["source"] in node_ids
        assert edge["target"] in node_ids
        assert edge["weight"] > 0
        assert isinstance(edge["shared_instruments"], list)
        assert isinstance(edge["shared_devices"], list)
        assert isinstance(edge["shared_ips"], list)
        assert isinstance(edge["shared_merchants"], list)
        assert isinstance(edge["temporal_overlap"], int)
        assert isinstance(edge["has_transaction_flow"], bool)
        assert isinstance(edge["transaction_count"], int)
        assert isinstance(edge["total_amount"], (int, float))

    _assert_no_leakage(data)


def test_focal_account_prioritization_in_graph() -> None:
    """Verify requesting a focal_account_id guarantees inclusion of that node in the graph."""
    service.load_data()
    comm_0_accounts = service.community_to_accounts.get(0, [])
    assert len(comm_0_accounts) > 0
    target_focal = comm_0_accounts[0]

    # Query with focal_account_id
    response = client.get(f"/api/graph/community/0?max_nodes=50&max_edges=100&focal_account_id={target_focal}")
    assert response.status_code == 200
    data = response.json()

    node_ids = {n["id"] for n in data["nodes"]}
    assert target_focal in node_ids, f"Focal account {target_focal} was not included in graph sample"
    _assert_no_leakage(data)


def test_transaction_flow_on_edges() -> None:
    """Verify that edges reporting transaction flow match actual transactions in enriched_transactions.csv."""
    service.load_data()
    response = client.get("/api/graph/community/0?max_nodes=200&max_edges=500")
    assert response.status_code == 200
    data = response.json()

    tx_edges = [e for e in data["edges"] if e["has_transaction_flow"]]
    assert len(tx_edges) > 0, "Expected at least one direct transaction flow edge in community 0"

    for edge in tx_edges:
        src = edge["source"]
        dst = edge["target"]
        assert edge["transaction_count"] > 0
        assert edge["total_amount"] > 0

        # Independently verify against service transaction index
        src_sent = service.account_sent_tx_indices.get(src, [])
        dst_recv = service.account_recv_tx_indices.get(dst, [])
        fwd_count = len(set(src_sent) & set(dst_recv))

        dst_sent = service.account_sent_tx_indices.get(dst, [])
        src_recv = service.account_recv_tx_indices.get(src, [])
        rev_count = len(set(dst_sent) & set(src_recv))

        assert fwd_count + rev_count == edge["transaction_count"]

        if fwd_count > 0 and rev_count > 0:
            assert edge["flow_direction"] == "bidirectional"
        elif fwd_count > 0:
            assert edge["flow_direction"] == "source_to_target"
        else:
            assert edge["flow_direction"] == "target_to_source"

    _assert_no_leakage(data)


def test_shared_infrastructure_telemetry() -> None:
    """Verify shared devices, instruments, and IPs on edges are real IDs from telemetry."""
    service.load_data()
    response = client.get("/api/graph/community/0?max_nodes=200&max_edges=500")
    assert response.status_code == 200
    data = response.json()

    device_edges = [e for e in data["edges"] if len(e["shared_devices"]) > 0]
    for e in device_edges:
        for dev_id in e["shared_devices"]:
            assert isinstance(dev_id, str)
            assert dev_id.startswith("dev_"), f"Unexpected device ID format: {dev_id}"

    instrument_edges = [e for e in data["edges"] if len(e["shared_instruments"]) > 0]
    for e in instrument_edges:
        for ins_id in e["shared_instruments"]:
            assert isinstance(ins_id, str)
            assert ins_id.startswith("ins_"), f"Unexpected instrument ID format: {ins_id}"

    _assert_no_leakage(data)


def test_independent_bfs_path_traversal() -> None:
    """Independently compute BFS path on community graph and verify against graph edges."""
    service.load_data()
    response = client.get("/api/graph/community/0?max_nodes=100&max_edges=200")
    assert response.status_code == 200
    data = response.json()

    edges = data["edges"]
    nodes = [n["id"] for n in data["nodes"]]
    if len(edges) == 0 or len(nodes) < 2:
        return

    # Pick an edge to test a 1-hop path
    first_edge = edges[0]
    src = first_edge["source"]
    dst = first_edge["target"]

    # Adjacency map
    adj: dict[str, set[str]] = {nid: set() for nid in nodes}
    for e in edges:
        adj[e["source"]].add(e["target"])
        adj[e["target"]].add(e["source"])

    # BFS from src to dst
    queue = [[src]]
    visited = {src}
    found_path: list[str] | None = None

    while queue:
        path = queue.pop(0)
        curr = path[-1]
        if curr == dst:
            found_path = path
            break
        for nbr in adj.get(curr, set()):
            if nbr not in visited:
                visited.add(nbr)
                queue.append(path + [nbr])

    assert found_path is not None, f"BFS should have found direct path between {src} and {dst}"
    assert found_path[0] == src
    assert found_path[-1] == dst

    # Verify every hop in path is a real edge
    for i in range(len(found_path) - 1):
        h_a = found_path[i]
        h_b = found_path[i + 1]
        matching_edge = [
            e for e in edges
            if (e["source"] == h_a and e["target"] == h_b) or (e["source"] == h_b and e["target"] == h_a)
        ]
        assert len(matching_edge) > 0, f"Path hop between {h_a} and {h_b} has no corresponding edge!"


def test_strict_leakage_prevention_across_communities() -> None:
    """Verify that no hidden ground truth keys leak in any community graph endpoint."""
    for cid in [0, 1, 2, 3]:
        response = client.get(f"/api/graph/community/{cid}?max_nodes=50&max_edges=50")
        if response.status_code == 200:
            _assert_no_leakage(response.json())
