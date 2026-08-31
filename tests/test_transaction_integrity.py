# Copyright (c) 2026 Santander Group
# SPDX-License-Identifier: Apache-2.0

"""Transaction Integrity Tests — TraceLine Transaction Intelligence Layer.

Every test traces a value from the frontend-visible field back through the API
response to the enriched_transactions.csv source dataset. No ground-truth
evaluation data (pattern_id, is_ring_member) is ever tested for presence;
those tests verify it is ABSENT.

Test matrix:
- settled transaction
- declined transaction
- high-value transaction
- low-value transaction
- transaction with merchant data
- transaction without merchant data (P2P)
- transaction with community assignments
- transaction without community data
- transaction with counterparty history
- transaction with single observed transaction between pair
- registry pagination, filtering, sorting
- registry search by tx_id, src_account_id, dst_account_id
- counterparty relationship reconciliation
- no forbidden keys returned
- null fields preserved as null
"""

from __future__ import annotations

import math

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from src.api.main import app

client = TestClient(app)

# ---------------------------------------------------------------------------
# Fixtures: sample IDs from the real dataset
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def tx_df() -> pd.DataFrame:
    """Load the enriched_transactions dataset once for all tests."""
    return pd.read_csv(
        "data/processed/payment_network/enriched_transactions.csv",
        usecols=[
            "transaction_id", "timestamp", "amount", "src_account_id",
            "dst_account_id", "merchant_id", "device_id", "payment_instrument_id",
            "ip_address", "payment_method", "account_age_days", "transaction_status",
        ],
    )


@pytest.fixture(scope="module")
def settled_tx_id(tx_df: pd.DataFrame) -> str:
    """Return a settled transaction ID."""
    return str(tx_df[tx_df["transaction_status"] == "settled"].iloc[0]["transaction_id"])


@pytest.fixture(scope="module")
def declined_tx_id(tx_df: pd.DataFrame) -> str:
    """Return a declined transaction ID."""
    return str(tx_df[tx_df["transaction_status"] == "declined"].iloc[0]["transaction_id"])


@pytest.fixture(scope="module")
def high_value_tx_id(tx_df: pd.DataFrame) -> str:
    """Return the highest-value transaction ID."""
    return str(tx_df.loc[tx_df["amount"].idxmax(), "transaction_id"])


@pytest.fixture(scope="module")
def low_value_tx_id(tx_df: pd.DataFrame) -> str:
    """Return the lowest-value transaction ID."""
    return str(tx_df.loc[tx_df["amount"].idxmin(), "transaction_id"])


@pytest.fixture(scope="module")
def merchant_tx_id(tx_df: pd.DataFrame) -> str:
    """Return a transaction that has a merchant_id."""
    has_mch = tx_df[tx_df["merchant_id"].notna()]
    return str(has_mch.iloc[0]["transaction_id"])


@pytest.fixture(scope="module")
def no_merchant_tx_id(tx_df: pd.DataFrame) -> str:
    """Return a transaction without a merchant_id (rare — most have merchants)."""
    no_mch = tx_df[tx_df["merchant_id"].isna()]
    if no_mch.empty:
        pytest.skip("No transactions without merchant_id in dataset")
    return str(no_mch.iloc[0]["transaction_id"])


# ---------------------------------------------------------------------------
# Registry tests
# ---------------------------------------------------------------------------

def test_transaction_registry_returns_correct_structure():
    """Registry response must include expected top-level keys."""
    res = client.get("/api/transactions?page=1&page_size=10")
    assert res.status_code == 200
    data = res.json()
    for key in ["total", "page", "page_size", "total_pages", "items",
                "filtered_declined_count", "filtered_total_amount"]:
        assert key in data, f"Missing key: {key}"
    assert data["total"] > 0
    assert data["page"] == 1
    assert data["page_size"] == 10
    assert len(data["items"]) == 10


def test_transaction_registry_total_matches_dataset(tx_df: pd.DataFrame):
    """Total count in registry must match the dataset row count exactly."""
    res = client.get("/api/transactions?page=1&page_size=1")
    assert res.status_code == 200
    data = res.json()
    expected = len(tx_df)
    assert data["total"] == expected, (
        f"Registry reports {data['total']} transactions, dataset has {expected}"
    )


def test_transaction_registry_pagination():
    """Pages must not overlap and last page may be partial."""
    page1 = client.get("/api/transactions?page=1&page_size=20").json()
    page2 = client.get("/api/transactions?page=2&page_size=20").json()
    ids1 = {item["transaction_id"] for item in page1["items"]}
    ids2 = {item["transaction_id"] for item in page2["items"]}
    assert ids1.isdisjoint(ids2), "Pages 1 and 2 share transaction IDs"
    assert page1["total"] == page2["total"], "Total must be consistent across pages"


def test_transaction_registry_filter_by_status_declined(tx_df: pd.DataFrame):
    """Declined filter must return exactly the declined transactions."""
    res = client.get("/api/transactions?status=declined&page=1&page_size=100")
    assert res.status_code == 200
    data = res.json()
    expected_declined = int((tx_df["transaction_status"] == "declined").sum())
    assert data["total"] == expected_declined, (
        f"Declined filter: expected {expected_declined}, got {data['total']}"
    )
    for item in data["items"]:
        assert item["transaction_status"] == "declined"


def test_transaction_registry_filter_by_status_settled(tx_df: pd.DataFrame):
    """Settled filter must return exactly the settled transactions."""
    res = client.get("/api/transactions?status=settled&page=1&page_size=1")
    assert res.status_code == 200
    data = res.json()
    expected = int((tx_df["transaction_status"] == "settled").sum())
    assert data["total"] == expected


def test_transaction_registry_filter_by_payment_method(tx_df: pd.DataFrame):
    """Payment method filter must match dataset counts exactly."""
    for method in ["card", "upi", "wallet", "netbanking"]:
        res = client.get(f"/api/transactions?payment_method={method}&page=1&page_size=1")
        assert res.status_code == 200
        data = res.json()
        expected = int((tx_df["payment_method"] == method).sum())
        assert data["total"] == expected, (
            f"Method={method}: expected {expected}, got {data['total']}"
        )


def test_transaction_registry_filter_by_amount_range(tx_df: pd.DataFrame):
    """Amount range filter must match dataset filtering exactly."""
    min_amt, max_amt = 100.0, 500.0
    res = client.get(f"/api/transactions?min_amount={min_amt}&max_amount={max_amt}&page=1&page_size=1")
    assert res.status_code == 200
    data = res.json()
    expected = int(((tx_df["amount"] >= min_amt) & (tx_df["amount"] <= max_amt)).sum())
    assert data["total"] == expected, (
        f"Amount range [{min_amt}, {max_amt}]: expected {expected}, got {data['total']}"
    )
    # All items in page must be in range
    res2 = client.get(f"/api/transactions?min_amount={min_amt}&max_amount={max_amt}&page=1&page_size=50")
    for item in res2.json()["items"]:
        assert min_amt <= item["amount"] <= max_amt, (
            f"Amount {item['amount']} outside [{min_amt}, {max_amt}]"
        )


def test_transaction_registry_search_by_tx_id():
    """Search by tx_id prefix must return the matching transaction."""
    res = client.get("/api/transactions?search=tx_0&page=1&page_size=10")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] > 0
    for item in data["items"]:
        assert item["transaction_id"].lower().startswith("tx_0")


def test_transaction_registry_search_by_account_id(tx_df: pd.DataFrame):
    """Search by src_account_id prefix must only return matching transactions."""
    sample_src = str(tx_df.iloc[0]["src_account_id"])
    prefix = sample_src[:7]  # e.g. "acc_252"
    res = client.get(f"/api/transactions?search={prefix}&page=1&page_size=50")
    assert res.status_code == 200
    data = res.json()
    for item in data["items"]:
        match = (
            item["src_account_id"].lower().startswith(prefix.lower())
            or item["dst_account_id"].lower().startswith(prefix.lower())
            or item["transaction_id"].lower().startswith(prefix.lower())
        )
        assert match, f"Item {item['transaction_id']} does not match search prefix '{prefix}'"


def test_transaction_registry_sort_by_amount_desc():
    """Sort by amount descending must produce strictly non-increasing amounts."""
    res = client.get("/api/transactions?sort_by=amount&sort_order=desc&page=1&page_size=20")
    assert res.status_code == 200
    amounts = [item["amount"] for item in res.json()["items"]]
    assert amounts == sorted(amounts, reverse=True), "Amounts not sorted descending"


def test_transaction_registry_sort_by_amount_asc():
    """Sort by amount ascending must produce strictly non-decreasing amounts."""
    res = client.get("/api/transactions?sort_by=amount&sort_order=asc&page=1&page_size=20")
    assert res.status_code == 200
    amounts = [item["amount"] for item in res.json()["items"]]
    assert amounts == sorted(amounts), "Amounts not sorted ascending"


def test_transaction_registry_aggregate_stats(tx_df: pd.DataFrame):
    """filtered_declined_count must match actual count in unfiltered registry."""
    res = client.get("/api/transactions?page=1&page_size=1")
    assert res.status_code == 200
    data = res.json()
    expected_declined = int((tx_df["transaction_status"] == "declined").sum())
    expected_amount = round(float(tx_df["amount"].sum()), 2)
    assert data["filtered_declined_count"] == expected_declined
    # Amount total within reasonable tolerance (floating point)
    assert abs(data["filtered_total_amount"] - expected_amount) < 1.0, (
        f"Total amount mismatch: expected {expected_amount}, got {data['filtered_total_amount']}"
    )


def test_transaction_registry_item_fields():
    """Every item in registry must have all expected fields with correct types."""
    res = client.get("/api/transactions?page=1&page_size=5")
    assert res.status_code == 200
    for item in res.json()["items"]:
        assert isinstance(item["transaction_id"], str)
        assert isinstance(item["timestamp"], str)
        assert isinstance(item["amount"], (int, float))
        assert item["amount"] > 0
        assert isinstance(item["src_account_id"], str)
        assert isinstance(item["dst_account_id"], str)
        assert item["transaction_status"] in ("settled", "declined", "pending")
        # payment_method is nullable — must be null or one of the valid values
        if item["payment_method"] is not None:
            assert item["payment_method"] in ("card", "upi", "wallet", "netbanking"), (
                f"Unexpected payment_method: {item['payment_method']}"
            )


def test_transaction_registry_no_forbidden_keys():
    """Registry must never return ground-truth evaluation fields."""
    res = client.get("/api/transactions?page=1&page_size=10")
    assert res.status_code == 200
    for item in res.json()["items"]:
        assert "pattern_id" not in item
        assert "is_ring_member" not in item
        assert "fraud_label" not in item
        assert "is_fraud" not in item


# ---------------------------------------------------------------------------
# Transaction detail tests
# ---------------------------------------------------------------------------

def test_transaction_detail_amount_matches_source(tx_df: pd.DataFrame, settled_tx_id: str):
    """Amount in detail response must exactly match the source dataset."""
    res = client.get(f"/api/transactions/{settled_tx_id}")
    assert res.status_code == 200
    data = res.json()
    source_row = tx_df[tx_df["transaction_id"] == settled_tx_id].iloc[0]
    expected_amount = round(float(source_row["amount"]), 2)
    assert data["amount"] == expected_amount, (
        f"Amount mismatch: API={data['amount']}, source={expected_amount}"
    )


def test_transaction_detail_timestamp_matches_source(tx_df: pd.DataFrame, settled_tx_id: str):
    """Timestamp in detail response must match the source dataset."""
    res = client.get(f"/api/transactions/{settled_tx_id}")
    assert res.status_code == 200
    data = res.json()
    source_row = tx_df[tx_df["transaction_id"] == settled_tx_id].iloc[0]
    assert data["timestamp"] == str(source_row["timestamp"]), (
        f"Timestamp mismatch: API={data['timestamp']}, source={source_row['timestamp']}"
    )


def test_transaction_detail_status_matches_source(tx_df: pd.DataFrame, declined_tx_id: str):
    """Status in detail response must match the source dataset value."""
    res = client.get(f"/api/transactions/{declined_tx_id}")
    assert res.status_code == 200
    data = res.json()
    source_row = tx_df[tx_df["transaction_id"] == declined_tx_id].iloc[0]
    assert data["transaction_status"] == str(source_row["transaction_status"])


def test_transaction_detail_src_dst_match_source(tx_df: pd.DataFrame, settled_tx_id: str):
    """Source and destination account IDs must match dataset."""
    res = client.get(f"/api/transactions/{settled_tx_id}")
    assert res.status_code == 200
    data = res.json()
    source_row = tx_df[tx_df["transaction_id"] == settled_tx_id].iloc[0]
    assert data["src_account_id"] == str(source_row["src_account_id"])
    assert data["dst_account_id"] == str(source_row["dst_account_id"])


def test_transaction_detail_declined_status(declined_tx_id: str):
    """Declined transaction must be correctly identified."""
    res = client.get(f"/api/transactions/{declined_tx_id}")
    assert res.status_code == 200
    data = res.json()
    assert data["transaction_status"] == "declined"


def test_transaction_detail_high_value(tx_df: pd.DataFrame, high_value_tx_id: str):
    """High-value transaction amount must match source max."""
    res = client.get(f"/api/transactions/{high_value_tx_id}")
    assert res.status_code == 200
    data = res.json()
    source_max = round(float(tx_df["amount"].max()), 2)
    assert abs(data["amount"] - source_max) < 0.01, (
        f"High-value mismatch: API={data['amount']}, source max={source_max}"
    )


def test_transaction_detail_low_value(tx_df: pd.DataFrame, low_value_tx_id: str):
    """Low-value transaction amount must match source min."""
    res = client.get(f"/api/transactions/{low_value_tx_id}")
    assert res.status_code == 200
    data = res.json()
    source_min = round(float(tx_df["amount"].min()), 2)
    assert abs(data["amount"] - source_min) < 0.01


def test_transaction_detail_null_fields_are_null_not_fabricated(tx_df: pd.DataFrame):
    """When a dataset field is null, the API must return null — not a fabricated string."""
    # Find a transaction where payment_method is null (if any)
    null_method = tx_df[tx_df["payment_method"].isna()]
    if not null_method.empty:
        tid = str(null_method.iloc[0]["transaction_id"])
        res = client.get(f"/api/transactions/{tid}")
        assert res.status_code == 200
        data = res.json()
        assert data["payment_method"] is None, (
            f"payment_method should be null but got: {data['payment_method']!r}"
        )

    # Find a transaction where device_id is null
    null_dev = tx_df[tx_df["device_id"].isna()]
    if not null_dev.empty:
        tid = str(null_dev.iloc[0]["transaction_id"])
        res = client.get(f"/api/transactions/{tid}")
        assert res.status_code == 200
        assert res.json()["device_id"] is None


def test_transaction_detail_no_forbidden_keys(settled_tx_id: str):
    """Transaction detail must never return ground-truth fields."""
    res = client.get(f"/api/transactions/{settled_tx_id}")
    assert res.status_code == 200
    data = res.json()
    forbidden = {"pattern_id", "is_ring_member", "fraud_label", "is_fraud",
                 "fraud_probability", "confidence_score", "trust_score"}
    for key in forbidden:
        assert key not in data, f"Forbidden key present: {key}"


def test_transaction_detail_404_for_nonexistent():
    """Request for a non-existent transaction must return HTTP 404."""
    res = client.get("/api/transactions/tx_does_not_exist_99999999")
    assert res.status_code == 404


def test_transaction_detail_merchant_data_present(tx_df: pd.DataFrame, merchant_tx_id: str):
    """Transaction with merchant_id must return merchant_id in response."""
    source_row = tx_df[tx_df["transaction_id"] == merchant_tx_id].iloc[0]
    assert pd.notna(source_row["merchant_id"])
    res = client.get(f"/api/transactions/{merchant_tx_id}")
    assert res.status_code == 200
    data = res.json()
    assert data["merchant_id"] == str(source_row["merchant_id"])


# ---------------------------------------------------------------------------
# Counterparty relationship tests
# ---------------------------------------------------------------------------

def test_counterparty_returns_correct_structure(settled_tx_id: str):
    """Counterparty response must have all expected keys."""
    res = client.get(f"/api/transactions/{settled_tx_id}/counterparty")
    assert res.status_code == 200
    data = res.json()
    for key in [
        "transaction_id", "src_account_id", "dst_account_id",
        "total_transactions_between", "transactions_src_to_dst",
        "transactions_dst_to_src", "total_flow_src_to_dst",
        "total_flow_dst_to_src", "declined_between",
        "src_community_id", "dst_community_id", "same_community",
        "recent_transactions", "first_observed_between", "last_observed_between",
    ]:
        assert key in data, f"Missing counterparty key: {key}"


def test_counterparty_src_dst_match_focal_transaction(tx_df: pd.DataFrame, settled_tx_id: str):
    """Counterparty src/dst must match the focal transaction's src/dst."""
    tx_row = tx_df[tx_df["transaction_id"] == settled_tx_id].iloc[0]
    res = client.get(f"/api/transactions/{settled_tx_id}/counterparty")
    assert res.status_code == 200
    data = res.json()
    assert data["src_account_id"] == str(tx_row["src_account_id"])
    assert data["dst_account_id"] == str(tx_row["dst_account_id"])
    assert data["transaction_id"] == settled_tx_id


def test_counterparty_total_is_sum_of_directions(settled_tx_id: str):
    """total_transactions_between must equal fwd + rev counts."""
    res = client.get(f"/api/transactions/{settled_tx_id}/counterparty")
    assert res.status_code == 200
    data = res.json()
    assert data["total_transactions_between"] == (
        data["transactions_src_to_dst"] + data["transactions_dst_to_src"]
    ), "total_transactions_between != src_to_dst + dst_to_src"


def test_counterparty_flow_reconciliation(tx_df: pd.DataFrame, settled_tx_id: str):
    """Total flow src->dst must equal the sum of amounts for those transactions."""
    tx_row = tx_df[tx_df["transaction_id"] == settled_tx_id].iloc[0]
    src = str(tx_row["src_account_id"])
    dst = str(tx_row["dst_account_id"])

    fwd_df = tx_df[(tx_df["src_account_id"].astype(str) == src) & (tx_df["dst_account_id"].astype(str) == dst)]
    expected_fwd = round(float(fwd_df["amount"].sum()), 2)

    res = client.get(f"/api/transactions/{settled_tx_id}/counterparty")
    assert res.status_code == 200
    data = res.json()
    assert abs(data["total_flow_src_to_dst"] - expected_fwd) < 0.01, (
        f"Flow mismatch: API={data['total_flow_src_to_dst']}, expected={expected_fwd}"
    )
    assert data["transactions_src_to_dst"] == len(fwd_df), (
        f"Fwd count: API={data['transactions_src_to_dst']}, expected={len(fwd_df)}"
    )


def test_counterparty_declined_count_reconciliation(tx_df: pd.DataFrame, settled_tx_id: str):
    """Declined count between pair must be exactly derivable from dataset."""
    tx_row = tx_df[tx_df["transaction_id"] == settled_tx_id].iloc[0]
    src = str(tx_row["src_account_id"])
    dst = str(tx_row["dst_account_id"])

    pair_df = tx_df[
        ((tx_df["src_account_id"].astype(str) == src) & (tx_df["dst_account_id"].astype(str) == dst))
        | ((tx_df["src_account_id"].astype(str) == dst) & (tx_df["dst_account_id"].astype(str) == src))
    ]
    expected_declined = int((pair_df["transaction_status"] == "declined").sum())

    res = client.get(f"/api/transactions/{settled_tx_id}/counterparty")
    assert res.status_code == 200
    assert res.json()["declined_between"] == expected_declined


def test_counterparty_recent_transactions_are_valid(tx_df: pd.DataFrame, settled_tx_id: str):
    """Recent transactions in counterparty must all be real transaction IDs."""
    res = client.get(f"/api/transactions/{settled_tx_id}/counterparty")
    assert res.status_code == 200
    data = res.json()
    real_ids = set(tx_df["transaction_id"].astype(str))
    for recent in data["recent_transactions"]:
        assert recent["transaction_id"] in real_ids, (
            f"Recent tx {recent['transaction_id']} not in real dataset"
        )
        assert isinstance(recent["amount"], (int, float)) and recent["amount"] > 0
        assert recent["transaction_status"] in ("settled", "declined", "pending")


def test_counterparty_recent_transactions_max_5(settled_tx_id: str):
    """Recent transactions list must not exceed 5 items."""
    res = client.get(f"/api/transactions/{settled_tx_id}/counterparty")
    assert res.status_code == 200
    assert len(res.json()["recent_transactions"]) <= 5


def test_counterparty_404_for_nonexistent():
    """Counterparty of non-existent transaction must return 404."""
    res = client.get("/api/transactions/tx_does_not_exist_99999/counterparty")
    assert res.status_code == 404


def test_counterparty_same_community_flag_correct():
    """same_community must be True iff both accounts have the same community_id."""
    res = client.get("/api/transactions/tx_0/counterparty")
    assert res.status_code == 200
    data = res.json()
    if data["src_community_id"] is not None and data["dst_community_id"] is not None:
        expected = data["src_community_id"] == data["dst_community_id"]
        assert data["same_community"] == expected, (
            f"same_community flag incorrect: src_cid={data['src_community_id']}, "
            f"dst_cid={data['dst_community_id']}, flag={data['same_community']}"
        )


def test_counterparty_no_forbidden_keys(settled_tx_id: str):
    """Counterparty response must not return ground-truth or fabricated fields."""
    res = client.get(f"/api/transactions/{settled_tx_id}/counterparty")
    assert res.status_code == 200
    data = res.json()
    forbidden = {
        "pattern_id", "is_ring_member", "fraud_probability", "is_fraud",
        "confidence_score", "trust_score", "fraud_label",
    }
    for key in forbidden:
        assert key not in data, f"Forbidden key in counterparty response: {key}"


def test_counterparty_bidirectional_pair_reconciliation(tx_df: pd.DataFrame):
    """Find a pair with bidirectional transfers and verify directional flow sums."""
    # Find account pairs that have both fwd and rev activity
    pair_counts = tx_df.groupby(["src_account_id", "dst_account_id"]).size().reset_index(name="count")
    pair_set = set(zip(pair_counts["src_account_id"], pair_counts["dst_account_id"]))

    bidi_tx = None
    for src, dst in pair_set:
        if (dst, src) in pair_set:
            # Found bidirectional pair
            match = tx_df[(tx_df["src_account_id"] == src) & (tx_df["dst_account_id"] == dst)]
            if not match.empty:
                bidi_tx = str(match.iloc[0]["transaction_id"])
                break

    if not bidi_tx:
        pytest.skip("No bidirectional transaction pairs found in dataset")

    res = client.get(f"/api/transactions/{bidi_tx}/counterparty")
    assert res.status_code == 200
    data = res.json()
    assert data["transactions_src_to_dst"] > 0
    assert data["transactions_dst_to_src"] > 0
    assert data["total_flow_src_to_dst"] > 0
    assert data["total_flow_dst_to_src"] > 0
    assert data["total_transactions_between"] == data["transactions_src_to_dst"] + data["transactions_dst_to_src"]


def test_counterparty_single_transaction_pair(tx_df: pd.DataFrame):
    """Pair with only 1 transaction must have total=1 and equal first/last timestamps."""
    pair_counts = tx_df.groupby(["src_account_id", "dst_account_id"]).size()
    single_fwd = pair_counts[pair_counts == 1].index

    single_tx_id = None
    for src, dst in single_fwd[:100]:
        if (dst, src) not in pair_counts:
            match = tx_df[(tx_df["src_account_id"] == src) & (tx_df["dst_account_id"] == dst)]
            if not match.empty:
                single_tx_id = str(match.iloc[0]["transaction_id"])
                break

    if not single_tx_id:
        pytest.skip("No single-transaction pairs in dataset")

    res = client.get(f"/api/transactions/{single_tx_id}/counterparty")
    assert res.status_code == 200
    data = res.json()
    assert data["total_transactions_between"] == 1
    assert data["first_observed_between"] == data["last_observed_between"]
    assert len(data["recent_transactions"]) == 1
    assert data["recent_transactions"][0]["transaction_id"] == single_tx_id


def test_account_transactions_pagination_and_direction(settled_tx_id: str, tx_df: pd.DataFrame):
    """Account transaction endpoint must support sent/received/all direction filtering."""
    sample_acc = str(tx_df.iloc[0]["src_account_id"])
    res_all = client.get(f"/api/accounts/{sample_acc}/transactions?direction=all&page=1&page_size=50")
    assert res_all.status_code == 200
    data_all = res_all.json()
    assert data_all["account_id"] == sample_acc
    assert data_all["total"] >= 1

    res_sent = client.get(f"/api/accounts/{sample_acc}/transactions?direction=sent&page=1&page_size=50")
    assert res_sent.status_code == 200
    for item in res_sent.json()["items"]:
        assert item["src_account_id"] == sample_acc

    res_recv = client.get(f"/api/accounts/{sample_acc}/transactions?direction=received&page=1&page_size=50")
    assert res_recv.status_code == 200
    for item in res_recv.json()["items"]:
        assert item["dst_account_id"] == sample_acc

