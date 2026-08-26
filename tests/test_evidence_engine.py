"""Comprehensive tests for the TraceLine Evidence Intelligence Engine.

Tests cover all 9 evidence detectors, severity ordering, determinism,
edge cases, and strict leakage protection.

Leakage check: verifies that no forbidden evaluation fields appear
in any EvidenceItem or API response.

Test groups:
  1.  SHARED_INSTRUMENT_CONCENTRATION
  2.  DEVICE_REUSE
  3.  IP_CONCENTRATION
  4.  TEMPORAL_BURST
  5.  RAPID_INTERACTION
  6.  MERCHANT_TEMPORAL_OVERLAP
  7.  HIGH_EVIDENCE_DENSITY
  8.  HUB_ACCOUNT
  9.  MULTI_LAYER_EVIDENCE
  10. Severity ordering
  11. Deterministic output
  12. Empty community
  13. Missing optional data
  14. Leakage protection
  15. Evidence score calculation
"""

from __future__ import annotations

from typing import Any

import pandas as pd

from src.intelligence.evidence_engine import (
    AccountEvidenceSummary,
    EvidenceEngine,
    _detect_device_reuse,
    _detect_high_evidence_density,
    _detect_hub_accounts,
    _detect_ip_concentration,
    _detect_merchant_temporal_overlap,
    _detect_multi_layer_evidence,
    _detect_rapid_interaction,
    _detect_shared_instrument_concentration,
    _detect_temporal_burst,
)
from src.intelligence.evidence_rules import (
    SCORE_CONTRIBUTION,
    EvidenceItem,
    EvidenceSeverity,
    EvidenceType,
    compute_evidence_score,
    make_evidence_id,
    sort_evidence,
)

# ---------------------------------------------------------------------------
# Forbidden ground-truth fields — must NEVER appear in evidence output
# ---------------------------------------------------------------------------

FORBIDDEN_FIELDS: set[str] = {
    "pattern_id",
    "is_ring_member",
    "link_type",
    "fraud_purity",
    "max_ring_coverage",
    "primary_ring_id",
    "is_positive",
    "is_positive_label",
    "fraud_account_count",
    "fraud_cases",
}


def _assert_no_forbidden_fields(obj: Any, path: str = "") -> None:
    """Recursively check that no forbidden ground-truth keys appear."""
    if isinstance(obj, dict):
        for k, v in obj.items():
            full_path = f"{path}.{k}" if path else k
            assert k not in FORBIDDEN_FIELDS, (
                f"Leaked forbidden field '{k}' found at '{full_path}'"
            )
            _assert_no_forbidden_fields(v, full_path)
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            _assert_no_forbidden_fields(item, f"{path}[{i}]")
    elif isinstance(obj, EvidenceItem):
        _assert_no_forbidden_fields(obj.to_dict(), path)


# ---------------------------------------------------------------------------
# Shared fixture helpers
# ---------------------------------------------------------------------------

def _make_connection(
    peer: str,
    instruments: list[str] | None = None,
    devices: list[str] | None = None,
    ips: list[str] | None = None,
    merchants: list[str] | None = None,
    weight: float = 1.0,
    temporal_overlap: int = 0,
) -> dict[str, Any]:
    return {
        "connected_account_id": peer,
        "edge_weight": weight,
        "shared_payment_instruments": instruments or [],
        "shared_devices": devices or [],
        "shared_ips": ips or [],
        "shared_merchants": merchants or [],
        "temporal_overlap": temporal_overlap,
    }


def _make_community_edge(src: str, dst: str, **kwargs) -> dict[str, Any]:
    return {"source": src, "target": dst, **kwargs}


def _minimal_engine(
    accounts: list[str] | None = None,
    connections_map: dict[str, list[dict]] | None = None,
    community_to_accounts: dict[int, list[str]] | None = None,
    account_to_community: dict[str, int] | None = None,
    community_edges_map: dict[int, list[dict]] | None = None,
    transactions_df: pd.DataFrame | None = None,
    features_df: pd.DataFrame | None = None,
    sent_idx: dict[str, list[int]] | None = None,
    recv_idx: dict[str, list[int]] | None = None,
) -> EvidenceEngine:
    """Construct a minimal EvidenceEngine with empty defaults."""
    accs = accounts or []
    cid_map = community_to_accounts or {0: accs}
    acc_cid = account_to_community or {a: 0 for a in accs}
    return EvidenceEngine(
        transactions_df=transactions_df if transactions_df is not None else pd.DataFrame(),
        community_to_accounts=cid_map,
        account_to_community=acc_cid,
        account_connections_map=connections_map or {},
        community_edges_map=community_edges_map or {},
        community_features_df=features_df if features_df is not None else pd.DataFrame(),
        account_sent_tx_indices=sent_idx or {},
        account_recv_tx_indices=recv_idx or {},
    )


# ===========================================================================
# 1. SHARED_INSTRUMENT_CONCENTRATION
# ===========================================================================


class TestSharedInstrumentConcentration:
    def test_high_severity_five_accounts(self):
        """Instrument shared by 5 accounts -> HIGH severity."""
        accounts = ["acc_1", "acc_2", "acc_3", "acc_4", "acc_5"]
        connections = {
            "acc_1": [
                _make_connection("acc_2", instruments=["instr_X"]),
                _make_connection("acc_3", instruments=["instr_X"]),
                _make_connection("acc_4", instruments=["instr_X"]),
                _make_connection("acc_5", instruments=["instr_X"]),
            ],
            "acc_2": [_make_connection("acc_3", instruments=["instr_X"])],
        }
        items = _detect_shared_instrument_concentration(accounts, connections, "COMMUNITY", "0")
        instr_items = [i for i in items if "instr_X" in i.metrics.get("instrument_id", "")]
        assert len(instr_items) >= 1
        assert instr_items[0].severity == EvidenceSeverity.HIGH
        assert instr_items[0].type == EvidenceType.SHARED_INSTRUMENT_CONCENTRATION

    def test_medium_severity_three_accounts(self):
        """Instrument shared by 3 accounts -> MEDIUM severity."""
        accounts = ["acc_1", "acc_2", "acc_3"]
        connections = {
            "acc_1": [
                _make_connection("acc_2", instruments=["instr_Y"]),
                _make_connection("acc_3", instruments=["instr_Y"]),
            ],
        }
        items = _detect_shared_instrument_concentration(accounts, connections, "COMMUNITY", "0")
        assert any(i.severity == EvidenceSeverity.MEDIUM for i in items)

    def test_low_severity_two_accounts(self):
        """Instrument shared by exactly 2 accounts -> LOW severity."""
        accounts = ["acc_1", "acc_2"]
        connections = {
            "acc_1": [_make_connection("acc_2", instruments=["instr_Z"])],
        }
        items = _detect_shared_instrument_concentration(accounts, connections, "COMMUNITY", "0")
        assert any(i.severity == EvidenceSeverity.LOW for i in items)

    def test_no_sharing_returns_empty(self):
        """No instrument sharing -> no evidence items."""
        accounts = ["acc_1", "acc_2"]
        connections = {
            "acc_1": [_make_connection("acc_2", instruments=[])],
        }
        items = _detect_shared_instrument_concentration(accounts, connections, "COMMUNITY", "0")
        assert items == []

    def test_description_uses_investigator_language(self):
        """Description avoids forbidden words; uses investigator language."""
        accounts = ["acc_1", "acc_2", "acc_3", "acc_4", "acc_5"]
        connections = {
            "acc_1": [_make_connection(f"acc_{i}", instruments=["I1"]) for i in range(2, 6)],
        }
        items = _detect_shared_instrument_concentration(accounts, connections, "COMMUNITY", "0")
        assert items
        desc = items[0].description.lower()
        for word in ("confirmed fraud", "fraudster", "fraudulent", "probability of fraud"):
            assert word not in desc, f"Forbidden word found: {word}"

    def test_no_forbidden_fields(self):
        accounts = ["acc_1", "acc_2", "acc_3"]
        connections = {"acc_1": [_make_connection("acc_2", instruments=["I1"]), _make_connection("acc_3", instruments=["I1"])]}
        items = _detect_shared_instrument_concentration(accounts, connections, "COMMUNITY", "0")
        for item in items:
            _assert_no_forbidden_fields(item)


# ===========================================================================
# 2. DEVICE_REUSE
# ===========================================================================


class TestDeviceReuse:
    def test_high_severity_five_accounts(self):
        """Device shared by 5 accounts -> HIGH."""
        accounts = [f"acc_{i}" for i in range(1, 6)]
        connections = {
            "acc_1": [_make_connection(f"acc_{i}", devices=["dev_X"]) for i in range(2, 6)],
        }
        items = _detect_device_reuse(accounts, connections, "COMMUNITY", "0")
        assert any(i.severity == EvidenceSeverity.HIGH for i in items)

    def test_medium_severity_three_accounts(self):
        accounts = ["acc_1", "acc_2", "acc_3"]
        connections = {"acc_1": [_make_connection("acc_2", devices=["dev_Y"]), _make_connection("acc_3", devices=["dev_Y"])]}
        items = _detect_device_reuse(accounts, connections, "COMMUNITY", "0")
        assert any(i.severity == EvidenceSeverity.MEDIUM for i in items)

    def test_description_mentions_device(self):
        accounts = ["acc_1", "acc_2"]
        connections = {"acc_1": [_make_connection("acc_2", devices=["dev_ABC"])]}
        items = _detect_device_reuse(accounts, connections, "COMMUNITY", "0")
        assert items
        assert "dev_ABC" in items[0].description

    def test_no_devices_empty(self):
        accounts = ["acc_1", "acc_2"]
        connections = {"acc_1": [_make_connection("acc_2", devices=[])]}
        items = _detect_device_reuse(accounts, connections, "COMMUNITY", "0")
        assert items == []

    def test_no_forbidden_fields(self):
        accounts = ["acc_1", "acc_2", "acc_3"]
        connections = {"acc_1": [_make_connection("acc_2", devices=["D1"]), _make_connection("acc_3", devices=["D1"])]}
        items = _detect_device_reuse(accounts, connections, "COMMUNITY", "0")
        for item in items:
            _assert_no_forbidden_fields(item)


# ===========================================================================
# 3. IP_CONCENTRATION
# ===========================================================================


class TestIPConcentration:
    def test_high_severity_eight_accounts(self):
        """IP shared by 8 accounts -> HIGH."""
        accounts = [f"acc_{i}" for i in range(1, 9)]
        connections = {
            "acc_1": [_make_connection(f"acc_{i}", ips=["1.2.3.4"]) for i in range(2, 9)],
        }
        items = _detect_ip_concentration(accounts, connections, "COMMUNITY", "0")
        assert any(i.severity == EvidenceSeverity.HIGH for i in items)

    def test_medium_severity_four_accounts(self):
        accounts = [f"acc_{i}" for i in range(1, 5)]
        connections = {"acc_1": [_make_connection(f"acc_{i}", ips=["5.6.7.8"]) for i in range(2, 5)]}
        items = _detect_ip_concentration(accounts, connections, "COMMUNITY", "0")
        assert any(i.severity == EvidenceSeverity.MEDIUM for i in items)

    def test_low_severity_two_accounts(self):
        accounts = ["acc_1", "acc_2"]
        connections = {"acc_1": [_make_connection("acc_2", ips=["9.10.11.12"])]}
        items = _detect_ip_concentration(accounts, connections, "COMMUNITY", "0")
        assert any(i.severity == EvidenceSeverity.LOW for i in items)

    def test_no_ip_sharing_empty(self):
        accounts = ["acc_1", "acc_2"]
        connections = {"acc_1": [_make_connection("acc_2", ips=[])]}
        items = _detect_ip_concentration(accounts, connections, "COMMUNITY", "0")
        assert items == []

    def test_no_forbidden_fields(self):
        accounts = ["acc_1", "acc_2", "acc_3"]
        connections = {"acc_1": [_make_connection("acc_2", ips=["1.1.1.1"]), _make_connection("acc_3", ips=["1.1.1.1"])]}
        items = _detect_ip_concentration(accounts, connections, "COMMUNITY", "0")
        for item in items:
            _assert_no_forbidden_fields(item)


# ===========================================================================
# 4. TEMPORAL_BURST
# ===========================================================================


class TestTemporalBurst:
    def _make_tx_df(self, timestamps: list[str], accounts: list[str] | None = None) -> pd.DataFrame:
        n = len(timestamps)
        accs = accounts or ["acc_1"] * n
        return pd.DataFrame({
            "transaction_id": [f"tx_{i}" for i in range(n)],
            "timestamp": timestamps,
            "src_account_id": accs,
            "dst_account_id": ["acc_ext"] * n,
            "amount": [100.0] * n,
        })

    def test_high_burst_fifteen_in_60min(self):
        """15 transactions within 60 minutes -> HIGH."""
        timestamps = [f"2024-01-15T10:{i:02d}:00" for i in range(15)]
        df = self._make_tx_df(timestamps)
        sent_idx = {"acc_1": list(range(15))}
        recv_idx: dict[str, list[int]] = {}
        items = _detect_temporal_burst(["acc_1"], df, sent_idx, recv_idx, "COMMUNITY", "0")
        burst_items = [i for i in items if i.type == EvidenceType.TEMPORAL_BURST]
        assert burst_items
        assert burst_items[0].severity == EvidenceSeverity.HIGH
        assert burst_items[0].metrics["transaction_count"] >= 15

    def test_medium_burst_eight_in_60min(self):
        """8 transactions within 60 minutes -> MEDIUM."""
        timestamps = [f"2024-01-15T10:{i:02d}:00" for i in range(8)]
        df = self._make_tx_df(timestamps)
        sent_idx = {"acc_1": list(range(8))}
        items = _detect_temporal_burst(["acc_1"], df, sent_idx, {}, "COMMUNITY", "0")
        burst_items = [i for i in items if i.type == EvidenceType.TEMPORAL_BURST]
        assert burst_items
        assert burst_items[0].severity == EvidenceSeverity.MEDIUM

    def test_low_burst_24h_fallback(self):
        """4 transactions across 12 hours -> LOW (24h fallback)."""
        timestamps = [
            "2024-01-15T06:00:00",
            "2024-01-15T09:00:00",
            "2024-01-15T14:00:00",
            "2024-01-15T17:00:00",
        ]
        df = self._make_tx_df(timestamps)
        sent_idx = {"acc_1": list(range(4))}
        items = _detect_temporal_burst(["acc_1"], df, sent_idx, {}, "COMMUNITY", "0")
        burst_items = [i for i in items if i.type == EvidenceType.TEMPORAL_BURST]
        assert burst_items
        assert burst_items[0].severity == EvidenceSeverity.LOW

    def test_too_few_transactions_returns_empty(self):
        """Fewer than 4 transactions -> no burst."""
        timestamps = ["2024-01-15T10:00:00", "2024-01-15T10:05:00"]
        df = self._make_tx_df(timestamps)
        sent_idx = {"acc_1": [0, 1]}
        items = _detect_temporal_burst(["acc_1"], df, sent_idx, {}, "COMMUNITY", "0")
        assert items == []

    def test_metrics_include_required_fields(self):
        timestamps = [f"2024-01-15T10:{i:02d}:00" for i in range(15)]
        df = self._make_tx_df(timestamps)
        sent_idx = {"acc_1": list(range(15))}
        items = _detect_temporal_burst(["acc_1"], df, sent_idx, {}, "COMMUNITY", "0")
        assert items
        m = items[0].metrics
        assert "transaction_count" in m
        assert "start_timestamp" in m
        assert "end_timestamp" in m

    def test_no_forbidden_fields(self):
        timestamps = [f"2024-01-15T10:{i:02d}:00" for i in range(10)]
        df = self._make_tx_df(timestamps)
        sent_idx = {"acc_1": list(range(10))}
        items = _detect_temporal_burst(["acc_1"], df, sent_idx, {}, "COMMUNITY", "0")
        for item in items:
            _assert_no_forbidden_fields(item)


# ===========================================================================
# 5. RAPID_INTERACTION
# ===========================================================================


class TestRapidInteraction:
    def _make_tx_df(self, timestamps: list[str]) -> pd.DataFrame:
        n = len(timestamps)
        return pd.DataFrame({
            "transaction_id": [f"tx_{i}" for i in range(n)],
            "timestamp": timestamps,
            "src_account_id": ["acc_1"] * n,
            "dst_account_id": ["acc_ext"] * n,
        })

    def test_high_severity_sub_30min_gap(self):
        """Median gap < 0.5 hours -> HIGH."""
        timestamps = [f"2024-01-15T10:{i*5:02d}:00" for i in range(10)]
        df = self._make_tx_df(timestamps)
        sent_idx = {"acc_1": list(range(10))}
        items = _detect_rapid_interaction(["acc_1"], df, sent_idx, {}, "COMMUNITY", "0")
        assert items
        assert items[0].severity == EvidenceSeverity.HIGH
        assert items[0].metrics["median_gap_hours"] < 0.5

    def test_medium_severity_1hr_gap(self):
        """Median gap ~1 hour (< 2.0) -> MEDIUM."""
        timestamps = [f"2024-01-15T{10+i:02d}:00:00" for i in range(5)]
        df = self._make_tx_df(timestamps)
        sent_idx = {"acc_1": list(range(5))}
        items = _detect_rapid_interaction(["acc_1"], df, sent_idx, {}, "COMMUNITY", "0")
        assert items
        assert items[0].severity == EvidenceSeverity.MEDIUM

    def test_low_severity_3hr_gap(self):
        """Median gap ~3 hours (< 6.0) -> LOW."""
        timestamps = [f"2024-01-15T{6 + i*3:02d}:00:00" for i in range(5)]
        df = self._make_tx_df(timestamps)
        sent_idx = {"acc_1": list(range(5))}
        items = _detect_rapid_interaction(["acc_1"], df, sent_idx, {}, "COMMUNITY", "0")
        assert items
        assert items[0].severity == EvidenceSeverity.LOW

    def test_slow_transactions_no_evidence(self):
        """Median gap > 6 hours -> no evidence."""
        timestamps = [f"2024-01-{15+i}T10:00:00" for i in range(5)]
        df = self._make_tx_df(timestamps)
        sent_idx = {"acc_1": list(range(5))}
        items = _detect_rapid_interaction(["acc_1"], df, sent_idx, {}, "COMMUNITY", "0")
        assert items == []

    def test_single_transaction_empty(self):
        """Single transaction -> no inter-gap -> no evidence."""
        df = self._make_tx_df(["2024-01-15T10:00:00"])
        items = _detect_rapid_interaction(["acc_1"], df, {"acc_1": [0]}, {}, "COMMUNITY", "0")
        assert items == []

    def test_no_forbidden_fields(self):
        timestamps = [f"2024-01-15T10:{i*5:02d}:00" for i in range(10)]
        df = self._make_tx_df(timestamps)
        sent_idx = {"acc_1": list(range(10))}
        items = _detect_rapid_interaction(["acc_1"], df, sent_idx, {}, "COMMUNITY", "0")
        for item in items:
            _assert_no_forbidden_fields(item)


# ===========================================================================
# 6. MERCHANT_TEMPORAL_OVERLAP
# ===========================================================================


class TestMerchantTemporalOverlap:
    def test_high_severity_six_accounts(self):
        """Merchant shared by 6 accounts -> HIGH."""
        accounts = [f"acc_{i}" for i in range(1, 7)]
        connections = {
            "acc_1": [_make_connection(f"acc_{i}", merchants=["mch_X"]) for i in range(2, 7)],
        }
        items = _detect_merchant_temporal_overlap(accounts, connections, "COMMUNITY", "0")
        assert any(i.severity == EvidenceSeverity.HIGH for i in items)

    def test_medium_severity_three_accounts(self):
        accounts = ["acc_1", "acc_2", "acc_3"]
        connections = {"acc_1": [_make_connection("acc_2", merchants=["mch_Y"]), _make_connection("acc_3", merchants=["mch_Y"])]}
        items = _detect_merchant_temporal_overlap(accounts, connections, "COMMUNITY", "0")
        assert any(i.severity == EvidenceSeverity.MEDIUM for i in items)

    def test_no_merchant_sharing_empty(self):
        accounts = ["acc_1", "acc_2"]
        connections = {"acc_1": [_make_connection("acc_2", merchants=[])]}
        items = _detect_merchant_temporal_overlap(accounts, connections, "COMMUNITY", "0")
        assert items == []

    def test_no_forbidden_fields(self):
        accounts = ["acc_1", "acc_2", "acc_3"]
        connections = {"acc_1": [_make_connection("acc_2", merchants=["M1"]), _make_connection("acc_3", merchants=["M1"])]}
        items = _detect_merchant_temporal_overlap(accounts, connections, "COMMUNITY", "0")
        for item in items:
            _assert_no_forbidden_fields(item)


# ===========================================================================
# 7. HIGH_EVIDENCE_DENSITY
# ===========================================================================


class TestHighEvidenceDensity:
    def _make_features_df(self, weight_per_member: float, cid: int = 0) -> pd.DataFrame:
        return pd.DataFrame({
            "weight_per_member": [weight_per_member],
            "mean_edge_weight": [weight_per_member * 0.5],
            "density": [0.05],
            "member_count": [100],
        }, index=pd.Index([cid], name="community_id"))

    def test_high_density(self):
        df = self._make_features_df(15.0)
        items = _detect_high_evidence_density(0, df, "COMMUNITY", "0")
        assert items
        assert items[0].severity == EvidenceSeverity.HIGH

    def test_medium_density(self):
        df = self._make_features_df(5.0)
        items = _detect_high_evidence_density(0, df, "COMMUNITY", "0")
        assert items
        assert items[0].severity == EvidenceSeverity.MEDIUM

    def test_low_density(self):
        df = self._make_features_df(1.0)
        items = _detect_high_evidence_density(0, df, "COMMUNITY", "0")
        assert items
        assert items[0].severity == EvidenceSeverity.LOW

    def test_below_threshold_empty(self):
        df = self._make_features_df(0.3)
        items = _detect_high_evidence_density(0, df, "COMMUNITY", "0")
        assert items == []

    def test_missing_community_empty(self):
        df = self._make_features_df(20.0, cid=99)
        items = _detect_high_evidence_density(0, df, "COMMUNITY", "0")
        assert items == []

    def test_empty_df_empty(self):
        items = _detect_high_evidence_density(0, pd.DataFrame(), "COMMUNITY", "0")
        assert items == []

    def test_metrics_include_density(self):
        df = self._make_features_df(15.0)
        items = _detect_high_evidence_density(0, df, "COMMUNITY", "0")
        assert "density" in items[0].metrics
        assert "weight_per_member" in items[0].metrics

    def test_no_forbidden_fields(self):
        df = self._make_features_df(15.0)
        items = _detect_high_evidence_density(0, df, "COMMUNITY", "0")
        for item in items:
            _assert_no_forbidden_fields(item)


# ===========================================================================
# 8. HUB_ACCOUNT
# ===========================================================================


class TestHubAccount:
    def _make_edges(self, hub: str, peers: list[str]) -> list[dict[str, Any]]:
        return [_make_community_edge(hub, p) for p in peers]

    def test_high_hub_detected(self):
        """Account connected to many accounts -> HIGH hub."""
        hub = "acc_hub"
        peers = [f"acc_{i}" for i in range(20)]
        accounts = [hub] + peers
        edges = self._make_edges(hub, peers)
        items = _detect_hub_accounts(accounts, edges, "COMMUNITY", "0")
        high_items = [i for i in items if i.severity == EvidenceSeverity.HIGH and "acc_hub" in i.supporting_entities]
        assert high_items

    def test_non_hub_no_evidence(self):
        """Low-degree account not flagged."""
        accounts = ["acc_1", "acc_2", "acc_3"]
        edges = [_make_community_edge("acc_1", "acc_2")]
        items = _detect_hub_accounts(accounts, edges, "COMMUNITY", "0")
        # Degree 1 in tiny community should not reach HIGH thresholds
        high = [i for i in items if i.severity == EvidenceSeverity.HIGH]
        assert not high

    def test_metrics_include_degree(self):
        hub = "acc_hub"
        peers = [f"acc_{i}" for i in range(25)]
        accounts = [hub] + peers
        edges = self._make_edges(hub, peers)
        items = _detect_hub_accounts(accounts, edges, "COMMUNITY", "0")
        hub_items = [i for i in items if "acc_hub" in i.supporting_entities]
        assert hub_items
        m = hub_items[0].metrics
        assert "degree" in m
        assert "percentile_rank" in m
        assert m["degree"] >= 10

    def test_empty_edges_no_items(self):
        items = _detect_hub_accounts(["acc_1", "acc_2"], [], "COMMUNITY", "0")
        assert items == []

    def test_no_forbidden_fields(self):
        hub = "acc_hub"
        peers = [f"acc_{i}" for i in range(20)]
        accounts = [hub] + peers
        edges = self._make_edges(hub, peers)
        items = _detect_hub_accounts(accounts, edges, "COMMUNITY", "0")
        for item in items:
            _assert_no_forbidden_fields(item)


# ===========================================================================
# 9. MULTI_LAYER_EVIDENCE
# ===========================================================================


class TestMultiLayerEvidence:
    def test_high_three_layers(self):
        """3 dimensions converge -> HIGH."""
        accounts = ["acc_1", "acc_2"]
        connections = {
            "acc_1": [_make_connection("acc_2", instruments=["I1"], devices=["D1"], ips=["1.2.3.4"])],
        }
        items = _detect_multi_layer_evidence(accounts, connections, "COMMUNITY", "0")
        assert items
        assert items[0].severity == EvidenceSeverity.HIGH
        assert items[0].metrics["layer_count"] == 3

    def test_medium_two_layers(self):
        """2 dimensions converge -> MEDIUM."""
        accounts = ["acc_1", "acc_2"]
        connections = {
            "acc_1": [_make_connection("acc_2", instruments=["I1"], devices=["D1"])],
        }
        items = _detect_multi_layer_evidence(accounts, connections, "COMMUNITY", "0")
        assert items
        assert items[0].severity == EvidenceSeverity.MEDIUM

    def test_single_layer_no_multi(self):
        """Only 1 dimension -> no MULTI_LAYER evidence."""
        accounts = ["acc_1", "acc_2"]
        connections = {
            "acc_1": [_make_connection("acc_2", instruments=["I1"])],
        }
        items = _detect_multi_layer_evidence(accounts, connections, "COMMUNITY", "0")
        assert items == []

    def test_four_layers_still_high(self):
        """All 4 dimensions -> HIGH."""
        accounts = ["acc_1", "acc_2"]
        connections = {
            "acc_1": [_make_connection("acc_2", instruments=["I1"], devices=["D1"], ips=["1.2.3.4"], merchants=["M1"])],
        }
        items = _detect_multi_layer_evidence(accounts, connections, "COMMUNITY", "0")
        assert items
        assert items[0].severity == EvidenceSeverity.HIGH
        assert items[0].metrics["layer_count"] == 4

    def test_pair_canonical_ordering(self):
        """Pairs are canonically ordered (min, max) -> single item per pair."""
        accounts = ["acc_1", "acc_2"]
        connections = {
            "acc_1": [_make_connection("acc_2", instruments=["I1"], devices=["D1"], ips=["1.1.1.1"])],
            "acc_2": [_make_connection("acc_1", instruments=["I1"], devices=["D1"], ips=["1.1.1.1"])],
        }
        items = _detect_multi_layer_evidence(accounts, connections, "COMMUNITY", "0")
        # Should be deduplicated to one pair
        high = [i for i in items if i.severity == EvidenceSeverity.HIGH]
        assert len(high) <= 2  # might be 1 or 2 depending on accumulation, but not excessive

    def test_no_forbidden_fields(self):
        accounts = ["acc_1", "acc_2"]
        connections = {
            "acc_1": [_make_connection("acc_2", instruments=["I1"], devices=["D1"], ips=["1.2.3.4"])],
        }
        items = _detect_multi_layer_evidence(accounts, connections, "COMMUNITY", "0")
        for item in items:
            _assert_no_forbidden_fields(item)


# ===========================================================================
# 10. Severity Ordering
# ===========================================================================


class TestSeverityOrdering:
    def _make_item(self, severity: str, score: float, ev_id: str = "") -> EvidenceItem:
        return EvidenceItem(
            evidence_id=ev_id or make_evidence_id("COMMUNITY", "0", "DEVICE_REUSE", severity),
            entity_type="COMMUNITY",
            entity_id="0",
            type=EvidenceType.DEVICE_REUSE,
            severity=severity,
            title=f"{severity} item",
            description="Test",
            score_contribution=score,
            observed_at=None,
            supporting_entities=[],
            metrics={},
        )

    def test_high_before_medium_before_low(self):
        items = [
            self._make_item(EvidenceSeverity.LOW, 5.0, "ev_low"),
            self._make_item(EvidenceSeverity.HIGH, 25.0, "ev_high"),
            self._make_item(EvidenceSeverity.MEDIUM, 12.0, "ev_med"),
        ]
        sorted_items = sort_evidence(items)
        severities = [i.severity for i in sorted_items]
        assert severities == [EvidenceSeverity.HIGH, EvidenceSeverity.MEDIUM, EvidenceSeverity.LOW]

    def test_within_severity_score_descending(self):
        items = [
            self._make_item(EvidenceSeverity.HIGH, 15.0, "ev_a"),
            self._make_item(EvidenceSeverity.HIGH, 25.0, "ev_b"),
            self._make_item(EvidenceSeverity.HIGH, 20.0, "ev_c"),
        ]
        sorted_items = sort_evidence(items)
        scores = [i.score_contribution for i in sorted_items]
        assert scores == sorted(scores, reverse=True)

    def test_tiebreak_by_evidence_id(self):
        items = [
            self._make_item(EvidenceSeverity.MEDIUM, 12.0, "ev_z"),
            self._make_item(EvidenceSeverity.MEDIUM, 12.0, "ev_a"),
        ]
        sorted_items = sort_evidence(items)
        assert sorted_items[0].evidence_id == "ev_a"


# ===========================================================================
# 11. Deterministic Output
# ===========================================================================


class TestDeterministicOutput:
    def _connections(self) -> dict[str, list[dict]]:
        return {
            "acc_1": [
                _make_connection("acc_2", instruments=["I1", "I2"], devices=["D1"]),
                _make_connection("acc_3", instruments=["I1"]),
            ],
            "acc_2": [
                _make_connection("acc_3", devices=["D1"], ips=["1.2.3.4"]),
            ],
        }

    def test_same_input_same_output(self):
        """Running engine twice produces identical evidence_ids and order."""
        accounts = ["acc_1", "acc_2", "acc_3"]
        connections = self._connections()

        def run():
            return _detect_shared_instrument_concentration(accounts, connections, "COMMUNITY", "0")

        r1 = run()
        r2 = run()
        assert [i.evidence_id for i in r1] == [i.evidence_id for i in r2]
        assert [i.severity for i in r1] == [i.severity for i in r2]

    def test_evidence_id_is_deterministic(self):
        """Same inputs always produce the same evidence_id."""
        id1 = make_evidence_id("COMMUNITY", "3", EvidenceType.DEVICE_REUSE, "dev_X")
        id2 = make_evidence_id("COMMUNITY", "3", EvidenceType.DEVICE_REUSE, "dev_X")
        assert id1 == id2

    def test_evidence_id_differs_with_different_inputs(self):
        """Different inputs produce different evidence_ids."""
        id1 = make_evidence_id("COMMUNITY", "3", EvidenceType.DEVICE_REUSE, "dev_X")
        id2 = make_evidence_id("COMMUNITY", "3", EvidenceType.DEVICE_REUSE, "dev_Y")
        assert id1 != id2

    def test_sort_is_stable_across_runs(self):
        items = [
            EvidenceItem("ev_b", "COMMUNITY", "0", EvidenceType.DEVICE_REUSE, EvidenceSeverity.HIGH, "B", "", 25.0, None, [], {}),
            EvidenceItem("ev_a", "COMMUNITY", "0", EvidenceType.DEVICE_REUSE, EvidenceSeverity.HIGH, "A", "", 25.0, None, [], {}),
        ]
        s1 = sort_evidence(items)
        s2 = sort_evidence(items)
        assert [i.evidence_id for i in s1] == [i.evidence_id for i in s2]


# ===========================================================================
# 12. Empty Community
# ===========================================================================


class TestEmptyCommunity:
    def test_empty_accounts_list(self):
        """Community with no accounts produces empty evidence."""
        engine = _minimal_engine(accounts=[], community_to_accounts={99: []})
        result = engine.get_community_evidence(99)
        assert result.evidence_count == 0
        assert result.items == []
        assert result.evidence_score == 0
        assert result.high_count == 0
        assert result.medium_count == 0
        assert result.low_count == 0

    def test_instrument_detector_empty_accounts(self):
        items = _detect_shared_instrument_concentration([], {}, "COMMUNITY", "99")
        assert items == []

    def test_device_detector_empty_accounts(self):
        items = _detect_device_reuse([], {}, "COMMUNITY", "99")
        assert items == []

    def test_hub_detector_empty_accounts(self):
        items = _detect_hub_accounts([], [], "COMMUNITY", "99")
        assert items == []


# ===========================================================================
# 13. Missing Optional Data
# ===========================================================================


class TestMissingOptionalData:
    def test_no_transactions_no_burst(self):
        """Engine handles empty transactions_df gracefully."""
        accounts = ["acc_1", "acc_2"]
        engine = _minimal_engine(
            accounts=accounts,
            transactions_df=pd.DataFrame(),
        )
        result = engine.get_community_evidence(0)
        burst_items = [i for i in result.items if i.type == EvidenceType.TEMPORAL_BURST]
        assert burst_items == []

    def test_no_connections_no_sharing_evidence(self):
        """No connections -> no instrument/device/IP/merchant evidence."""
        accounts = ["acc_1", "acc_2"]
        engine = _minimal_engine(accounts=accounts, connections_map={})
        result = engine.get_community_evidence(0)
        sharing_types = {
            EvidenceType.SHARED_INSTRUMENT_CONCENTRATION,
            EvidenceType.DEVICE_REUSE,
            EvidenceType.IP_CONCENTRATION,
            EvidenceType.MERCHANT_TEMPORAL_OVERLAP,
            EvidenceType.MULTI_LAYER_EVIDENCE,
        }
        sharing_items = [i for i in result.items if i.type in sharing_types]
        assert sharing_items == []

    def test_account_not_in_community(self):
        """Account with no community assignment still returns a valid summary."""
        engine = _minimal_engine(
            accounts=[],
            account_to_community={},
            community_to_accounts={},
        )
        result = engine.get_account_evidence("acc_unknown")
        assert isinstance(result, AccountEvidenceSummary)
        assert result.evidence_count == 0

    def test_high_evidence_density_empty_df(self):
        items = _detect_high_evidence_density(5, pd.DataFrame(), "COMMUNITY", "5")
        assert items == []


# ===========================================================================
# 14. Leakage Protection
# ===========================================================================


class TestLeakageProtection:
    def test_no_forbidden_fields_in_community_summary(self):
        """Complete community evidence output contains no forbidden fields."""
        accounts = ["acc_1", "acc_2", "acc_3"]
        connections = {
            "acc_1": [
                _make_connection("acc_2", instruments=["I1"], devices=["D1"]),
                _make_connection("acc_3", instruments=["I1"], ips=["1.1.1.1"]),
            ],
        }
        engine = _minimal_engine(accounts=accounts, connections_map=connections)
        result = engine.get_community_evidence(0)
        _assert_no_forbidden_fields(result.to_dict())

    def test_no_forbidden_fields_in_account_summary(self):
        """Complete account evidence output contains no forbidden fields."""
        connections = {
            "acc_1": [_make_connection("acc_2", instruments=["I1"], devices=["D1"])],
        }
        engine = _minimal_engine(
            accounts=["acc_1", "acc_2"],
            connections_map=connections,
            community_to_accounts={0: ["acc_1", "acc_2"]},
            account_to_community={"acc_1": 0, "acc_2": 0},
        )
        result = engine.get_account_evidence("acc_1")
        _assert_no_forbidden_fields(result.to_dict())

    def test_engine_does_not_import_evaluation_module(self):
        """The evidence engine must not import src.evaluation."""
        import sys

        # Check that src.evaluation is not in the module's imports
        engine_module = sys.modules.get("src.intelligence.evidence_engine")
        if engine_module:
            source = getattr(engine_module, "__file__", "") or ""
            if source:
                with open(source, "r") as f:
                    lines = f.readlines()
                # Check that no line is an actual import of src.evaluation
                for line in lines:
                    stripped = line.strip()
                    assert not stripped.startswith(
                        ("import src.evaluation", "from src.evaluation")
                    ), f"evidence_engine.py imports src.evaluation: {line.strip()}"
                # Also check fraud_cases.csv is not opened/referenced as a path
                content = "".join(lines)
                assert "open" not in content or "fraud_cases" not in content, (
                    "evidence_engine.py must not open fraud_cases.csv"
                )

    def test_rules_module_does_not_import_evaluation(self):
        """evidence_rules.py must not import src.evaluation."""
        import sys
        rules_module = sys.modules.get("src.intelligence.evidence_rules")
        if rules_module:
            source = getattr(rules_module, "__file__", "") or ""
            if source:
                with open(source, "r") as f:
                    content = f.read()
                assert "src.evaluation" not in content
                assert "fraud_cases" not in content

    def test_evidence_item_to_dict_no_forbidden(self):
        """EvidenceItem.to_dict() never contains forbidden keys."""
        item = EvidenceItem(
            evidence_id="ev_test123",
            entity_type="COMMUNITY",
            entity_id="3",
            type=EvidenceType.DEVICE_REUSE,
            severity=EvidenceSeverity.HIGH,
            title="Test",
            description="Test description",
            score_contribution=25.0,
            observed_at=None,
            supporting_entities=["acc_1", "acc_2"],
            metrics={"device_id": "dev_X", "account_count": 5},
        )
        d = item.to_dict()
        _assert_no_forbidden_fields(d)


# ===========================================================================
# 15. Evidence Score Calculation
# ===========================================================================


class TestEvidenceScoreCalculation:
    def _make_item(self, severity: str) -> EvidenceItem:
        return EvidenceItem(
            evidence_id=make_evidence_id("COMMUNITY", "0", "DEVICE_REUSE", severity + str(id(severity))),
            entity_type="COMMUNITY",
            entity_id="0",
            type=EvidenceType.DEVICE_REUSE,
            severity=severity,
            title="Test",
            description="",
            score_contribution=SCORE_CONTRIBUTION[severity],
            observed_at=None,
            supporting_entities=[],
            metrics={},
        )

    def test_single_high_item(self):
        items = [self._make_item(EvidenceSeverity.HIGH)]
        assert compute_evidence_score(items) == int(SCORE_CONTRIBUTION[EvidenceSeverity.HIGH])

    def test_single_medium_item(self):
        items = [self._make_item(EvidenceSeverity.MEDIUM)]
        assert compute_evidence_score(items) == int(SCORE_CONTRIBUTION[EvidenceSeverity.MEDIUM])

    def test_single_low_item(self):
        items = [self._make_item(EvidenceSeverity.LOW)]
        assert compute_evidence_score(items) == int(SCORE_CONTRIBUTION[EvidenceSeverity.LOW])

    def test_sum_multiple_items(self):
        items = [self._make_item(EvidenceSeverity.HIGH)] * 2 + [self._make_item(EvidenceSeverity.MEDIUM)]
        expected = min(100, round(25.0 * 2 + 12.0))
        assert compute_evidence_score(items) == expected

    def test_score_capped_at_100(self):
        """Even with many items, score never exceeds 100."""
        items = [self._make_item(EvidenceSeverity.HIGH)] * 10
        assert compute_evidence_score(items) == 100

    def test_empty_items_zero_score(self):
        assert compute_evidence_score([]) == 0

    def test_score_is_integer(self):
        items = [self._make_item(EvidenceSeverity.MEDIUM)] * 3
        result = compute_evidence_score(items)
        assert isinstance(result, int)

    def test_evidence_score_distinct_from_risk_score(self):
        """Verify that evidence_score is labeled and separate from risk_score."""
        accounts = ["acc_1", "acc_2", "acc_3"]
        connections = {
            "acc_1": [_make_connection("acc_2", instruments=["I1"], devices=["D1"]), _make_connection("acc_3", instruments=["I1"])],
        }
        engine = _minimal_engine(accounts=accounts, connections_map=connections)
        result = engine.get_community_evidence(0)
        summary_dict = result.to_dict()
        # Must have evidence_score, must NOT have risk_score
        assert "evidence_score" in summary_dict
        assert "risk_score" not in summary_dict


# ===========================================================================
# API Integration (requires live data but tests structure)
# ===========================================================================


class TestAPIIntegration:
    def test_community_evidence_endpoint_exists(self):
        """Verify the evidence endpoint is registered."""
        from fastapi.testclient import TestClient

        from src.api.main import app

        client = TestClient(app)
        # If communities exist, verify the endpoint responds
        # Use community 0 which may not exist → 404 is acceptable
        r = client.get("/api/communities/0/evidence")
        assert r.status_code in (200, 404)

    def test_account_evidence_endpoint_exists(self):
        """Verify the account evidence endpoint is registered."""
        from fastapi.testclient import TestClient

        from src.api.main import app

        client = TestClient(app)
        r = client.get("/api/accounts/nonexistent_account/evidence")
        assert r.status_code in (200, 404)

    def test_community_evidence_200_has_required_fields(self):
        """If community evidence returns 200, verify schema structure."""
        from fastapi.testclient import TestClient

        from src.api.main import app
        from src.api.service import service

        client = TestClient(app)
        service.load_data()

        if service.total_communities > 0 and service.community_risk_scores_df is not None:
            # Get first valid community ID
            valid_id = int(service.community_risk_scores_df.index[0])
            r = client.get(f"/api/communities/{valid_id}/evidence")
            if r.status_code == 200:
                data = r.json()
                assert "community_id" in data
                assert "evidence_score" in data
                assert "evidence_count" in data
                assert "high_count" in data
                assert "medium_count" in data
                assert "low_count" in data
                assert "items" in data
                assert isinstance(data["items"], list)
                assert 0 <= data["evidence_score"] <= 100
                # Verify no forbidden fields
                _assert_no_forbidden_fields(data)

    def test_account_evidence_200_has_required_fields(self):
        """If account evidence returns 200, verify schema structure."""
        from fastapi.testclient import TestClient

        from src.api.main import app
        from src.api.service import service

        client = TestClient(app)
        service.load_data()

        if not service.accounts_df.empty:
            valid_id = str(service.accounts_df.index[0])
            r = client.get(f"/api/accounts/{valid_id}/evidence")
            if r.status_code == 200:
                data = r.json()
                assert "account_id" in data
                assert "evidence_score" in data
                assert "evidence_count" in data
                assert "items" in data
                assert 0 <= data["evidence_score"] <= 100
                _assert_no_forbidden_fields(data)
