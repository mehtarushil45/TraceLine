"""Evidence Intelligence Engine: observable-only rule-based evidence detectors.

Analyzes the in-memory indexed data from TraceLineService to produce
structured, explainable EvidenceItem records for communities and accounts.

The engine answers:
    "WHY is this entity worth investigating?"
not merely:
    "WHAT is its risk score?"

Architecture
------------
- All detectors operate on data already loaded in TraceLineService.
- No new I/O, no new CSV reads, no O(N²) account scans.
- Inverted-index patterns are used throughout.
- All output is deterministic: same input -> byte-identical output.

Leakage Contract
----------------
This engine NEVER imports or reads from:
  - src.evaluation
  - fraud_cases.csv
  - community_labels.csv
  - pattern_id, is_ring_member, link_type, fraud_purity,
    max_ring_coverage, primary_ring_id, is_positive

Evidence Score vs Risk Score
----------------------------
  risk_score      = ML-derived ensemble prioritization (existing system)
  evidence_score  = deterministic observable rule strength (this engine)
"""

from __future__ import annotations

import logging
import time
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

import numpy as np
import pandas as pd

from src.intelligence.evidence_rules import (
    SCORE_CONTRIBUTION,
    EvidenceItem,
    EvidenceSeverity,
    EvidenceType,
    classify_burst_severity,
    classify_density_severity,
    classify_gap_severity,
    classify_hub_severity,
    classify_ip_severity,
    classify_merchant_severity,
    classify_multilayer_severity,
    classify_sharing_severity,
    compute_evidence_score,
    make_evidence_id,
    sort_evidence,
)

logger = logging.getLogger("traceline.evidence_engine")


# ---------------------------------------------------------------------------
# Result container dataclasses
# ---------------------------------------------------------------------------


@dataclass
class CommunityEvidenceSummary:
    """Evidence analysis result for one community."""

    community_id: int
    evidence_score: int
    evidence_count: int
    high_count: int
    medium_count: int
    low_count: int
    items: List[EvidenceItem]
    runtime_ms: float

    def to_dict(self) -> Dict[str, Any]:
        return {
            "community_id": self.community_id,
            "evidence_score": self.evidence_score,
            "evidence_count": self.evidence_count,
            "high_count": self.high_count,
            "medium_count": self.medium_count,
            "low_count": self.low_count,
            "items": [item.to_dict() for item in self.items],
            "runtime_ms": round(self.runtime_ms, 2),
        }


@dataclass
class AccountEvidenceSummary:
    """Evidence analysis result for one account."""

    account_id: str
    community_id: Optional[int]
    evidence_score: int
    evidence_count: int
    high_count: int
    medium_count: int
    low_count: int
    items: List[EvidenceItem]
    runtime_ms: float

    def to_dict(self) -> Dict[str, Any]:
        return {
            "account_id": self.account_id,
            "community_id": self.community_id,
            "evidence_score": self.evidence_score,
            "evidence_count": self.evidence_count,
            "high_count": self.high_count,
            "medium_count": self.medium_count,
            "low_count": self.low_count,
            "items": [item.to_dict() for item in self.items],
            "runtime_ms": round(self.runtime_ms, 2),
        }


# ---------------------------------------------------------------------------
# Helper: build shared-entity inverted index from connection list
# ---------------------------------------------------------------------------


def _build_entity_index(
    connections: List[Dict[str, Any]],
    field: str,
    member_set: Set[str],
) -> Dict[str, Set[str]]:
    """Build entity -> set of connected account IDs from connection records.

    Args:
        connections: account_connections_map entries for one account.
        field: ``"shared_devices"``, ``"shared_payment_instruments"``,
               ``"shared_ips"``, or ``"shared_merchants"``.
        member_set: restrict participants to this set of account IDs.

    Returns:
        entity_id -> {account_id, ...} (only accounts in member_set).
    """
    index: Dict[str, Set[str]] = defaultdict(set)
    for conn in connections:
        peer = conn.get("connected_account_id", "")
        if peer not in member_set:
            continue
        for entity in conn.get(field, []):
            index[entity].add(peer)
    return index


def _build_community_entity_index(
    community_accounts: List[str],
    connections_map: Dict[str, List[Dict[str, Any]]],
    field: str,
) -> Dict[str, Set[str]]:
    """Build a community-wide entity -> accounts index.

    Iterates over all member accounts' connection lists, restricting
    to peers that are also community members.

    Returns entity_id -> set of account IDs that share it.
    """
    member_set = set(community_accounts)
    entity_to_accounts: Dict[str, Set[str]] = defaultdict(set)

    for account_id in sorted(community_accounts):  # sorted for determinism
        for conn in connections_map.get(account_id, []):
            peer = conn.get("connected_account_id", "")
            if peer not in member_set:
                continue
            for entity in conn.get(field, []):
                # Both endpoints share this entity.
                entity_to_accounts[entity].add(account_id)
                entity_to_accounts[entity].add(peer)

    return entity_to_accounts


# ---------------------------------------------------------------------------
# Individual detectors
# ---------------------------------------------------------------------------


def _detect_shared_instrument_concentration(
    community_accounts: List[str],
    connections_map: Dict[str, List[Dict[str, Any]]],
    entity_type: str = "COMMUNITY",
    entity_id: str = "",
) -> List[EvidenceItem]:
    """A. SHARED_INSTRUMENT_CONCENTRATION.

    Detects payment instruments reused across multiple accounts in the community.
    High instrument sharing across many unrelated customer profiles is strong
    observable evidence of shared infrastructure or coordinated account use.
    """
    items: List[EvidenceItem] = []
    idx = _build_community_entity_index(community_accounts, connections_map, "shared_payment_instruments")

    for instrument_id in sorted(idx.keys()):
        accounts = sorted(idx[instrument_id])
        count = len(accounts)
        severity = classify_sharing_severity(count)
        if severity is None:
            continue

        ev_id = make_evidence_id(entity_type, entity_id, EvidenceType.SHARED_INSTRUMENT_CONCENTRATION, instrument_id)
        items.append(
            EvidenceItem(
                evidence_id=ev_id,
                entity_type=entity_type,
                entity_id=entity_id,
                type=EvidenceType.SHARED_INSTRUMENT_CONCENTRATION,
                severity=severity,
                title=f"Payment instrument shared across {count} accounts",
                description=(
                    f"Payment instrument {instrument_id} is used by {count} accounts "
                    f"within this community. Shared payment credentials across distinct "
                    f"customer profiles represent observable infrastructure overlap. "
                    f"This pattern requires review to determine whether it reflects "
                    f"shared household infrastructure or coordinated account activity."
                ),
                score_contribution=SCORE_CONTRIBUTION[severity],
                observed_at=None,
                supporting_entities=accounts[:20],  # cap for API size
                metrics={
                    "instrument_id": instrument_id,
                    "account_count": count,
                    "accounts_sample": accounts[:10],
                },
            )
        )

    return items


def _detect_device_reuse(
    community_accounts: List[str],
    connections_map: Dict[str, List[Dict[str, Any]]],
    entity_type: str = "COMMUNITY",
    entity_id: str = "",
) -> List[EvidenceItem]:
    """B. DEVICE_REUSE.

    Detects hardware device fingerprints associated with multiple accounts.
    Device sharing across many distinct customer profiles is a strong
    indicator of shared infrastructure evidence.
    """
    items: List[EvidenceItem] = []
    idx = _build_community_entity_index(community_accounts, connections_map, "shared_devices")

    for device_id in sorted(idx.keys()):
        accounts = sorted(idx[device_id])
        count = len(accounts)
        severity = classify_sharing_severity(count)
        if severity is None:
            continue

        ev_id = make_evidence_id(entity_type, entity_id, EvidenceType.DEVICE_REUSE, device_id)
        items.append(
            EvidenceItem(
                evidence_id=ev_id,
                entity_type=entity_type,
                entity_id=entity_id,
                type=EvidenceType.DEVICE_REUSE,
                severity=severity,
                title=f"Device {device_id} shared by {count} accounts",
                description=(
                    f"Hardware device {device_id} is associated with {count} accounts "
                    f"in this community. Multiple distinct customer profiles operating "
                    f"from the same physical device constitutes shared infrastructure "
                    f"evidence requiring investigator review."
                ),
                score_contribution=SCORE_CONTRIBUTION[severity],
                observed_at=None,
                supporting_entities=accounts[:20],
                metrics={
                    "device_id": device_id,
                    "account_count": count,
                    "accounts_sample": accounts[:10],
                },
            )
        )

    return items


def _detect_ip_concentration(
    community_accounts: List[str],
    connections_map: Dict[str, List[Dict[str, Any]]],
    entity_type: str = "COMMUNITY",
    entity_id: str = "",
) -> List[EvidenceItem]:
    """C. IP_CONCENTRATION.

    Detects IP addresses associated with many accounts in the community.
    High IP reuse across many accounts indicates shared network origin
    (VPN, datacenter, or coordinated network infrastructure).
    """
    items: List[EvidenceItem] = []
    idx = _build_community_entity_index(community_accounts, connections_map, "shared_ips")

    for ip_addr in sorted(idx.keys()):
        accounts = sorted(idx[ip_addr])
        count = len(accounts)
        severity = classify_ip_severity(count)
        if severity is None:
            continue

        ev_id = make_evidence_id(entity_type, entity_id, EvidenceType.IP_CONCENTRATION, ip_addr)
        items.append(
            EvidenceItem(
                evidence_id=ev_id,
                entity_type=entity_type,
                entity_id=entity_id,
                type=EvidenceType.IP_CONCENTRATION,
                severity=severity,
                title=f"IP address associated with {count} accounts",
                description=(
                    f"IP address {ip_addr} is shared by {count} accounts in this community. "
                    f"Unusually high IP concentration across distinct profiles may indicate "
                    f"shared network origin (VPN, datacenter, or coordinated infrastructure). "
                    f"This is a weaker signal than device or instrument sharing and should be "
                    f"corroborated with other evidence vectors."
                ),
                score_contribution=SCORE_CONTRIBUTION[severity],
                observed_at=None,
                supporting_entities=accounts[:20],
                metrics={
                    "ip_address": ip_addr,
                    "account_count": count,
                    "accounts_sample": accounts[:10],
                },
            )
        )

    return items


def _detect_temporal_burst(
    community_accounts: List[str],
    transactions_df: pd.DataFrame,
    account_sent_indices: Dict[str, List[int]],
    account_recv_indices: Dict[str, List[int]],
    entity_type: str = "COMMUNITY",
    entity_id: str = "",
) -> List[EvidenceItem]:
    """D. TEMPORAL_BURST.

    Detects unusually dense transaction activity within short time windows.
    Collects all community transactions, sorts by timestamp, and finds the
    highest-density 60-minute sliding window (HIGH/MEDIUM) and 24-hour window (LOW).
    """
    items: List[EvidenceItem] = []
    member_set = set(community_accounts)

    # Collect transaction row indices for all community members
    comm_indices: Set[int] = set()
    for acc in community_accounts:
        comm_indices.update(account_sent_indices.get(acc, []))
        comm_indices.update(account_recv_indices.get(acc, []))

    if len(comm_indices) < 4 or transactions_df.empty:
        return items

    sub_df = transactions_df.iloc[sorted(comm_indices)][["transaction_id", "timestamp"]].copy()
    sub_df["timestamp"] = pd.to_datetime(sub_df["timestamp"], errors="coerce", utc=True)
    sub_df = sub_df.dropna(subset=["timestamp"])
    sub_df = sub_df.sort_values("timestamp").reset_index(drop=True)

    if len(sub_df) < 4:
        return items

    timestamps = sub_df["timestamp"].tolist()
    tx_ids = sub_df["transaction_id"].tolist()
    n = len(timestamps)

    # --- 60-minute sliding window (HIGH / MEDIUM) ---
    best_60min_count = 0
    best_60min_start_idx = 0
    best_60min_end_idx = 0

    right = 0
    for left in range(n):
        while right < n - 1 and (timestamps[right + 1] - timestamps[left]).total_seconds() <= 3600:
            right += 1
        window_count = right - left + 1
        if window_count > best_60min_count:
            best_60min_count = window_count
            best_60min_start_idx = left
            best_60min_end_idx = right

    severity_60 = None
    if best_60min_count >= 15:
        severity_60 = EvidenceSeverity.HIGH
    elif best_60min_count >= 8:
        severity_60 = EvidenceSeverity.MEDIUM

    if severity_60 is not None:
        start_ts = timestamps[best_60min_start_idx].isoformat()
        end_ts = timestamps[best_60min_end_idx].isoformat()
        window_minutes = max(
            1,
            int(round((timestamps[best_60min_end_idx] - timestamps[best_60min_start_idx]).total_seconds() / 60)),
        )
        ev_id = make_evidence_id(entity_type, entity_id, EvidenceType.TEMPORAL_BURST, "60min")
        items.append(
            EvidenceItem(
                evidence_id=ev_id,
                entity_type=entity_type,
                entity_id=entity_id,
                type=EvidenceType.TEMPORAL_BURST,
                severity=severity_60,
                title=f"Transaction burst: {best_60min_count} transactions in {window_minutes} minutes",
                description=(
                    f"{best_60min_count} related community transactions occurred within a "
                    f"{window_minutes}-minute window starting at {start_ts[:19]}. "
                    f"This temporal compression is unusual for organic payment activity and "
                    f"may indicate coordinated or automated transaction execution within this "
                    f"cluster of accounts. Investigator review is recommended."
                ),
                score_contribution=SCORE_CONTRIBUTION[severity_60],
                observed_at=start_ts,
                supporting_entities=sorted(set(str(tx_ids[i]) for i in range(
                    best_60min_start_idx, min(best_60min_end_idx + 1, best_60min_start_idx + 20)
                ))),
                metrics={
                    "transaction_count": best_60min_count,
                    "window_minutes": window_minutes,
                    "start_timestamp": start_ts,
                    "end_timestamp": end_ts,
                    "window_type": "60_minute",
                },
            )
        )

    # --- 24-hour fallback window (LOW) ---
    # Only produce LOW burst if no HIGH/MEDIUM was already emitted and count >= 4
    if severity_60 is None:
        best_24h_count = 0
        best_24h_start_idx = 0
        best_24h_end_idx = 0

        right = 0
        for left in range(n):
            while right < n - 1 and (timestamps[right + 1] - timestamps[left]).total_seconds() <= 86400:
                right += 1
            window_count = right - left + 1
            if window_count > best_24h_count:
                best_24h_count = window_count
                best_24h_start_idx = left
                best_24h_end_idx = right

        if best_24h_count >= 4:
            start_ts = timestamps[best_24h_start_idx].isoformat()
            end_ts = timestamps[best_24h_end_idx].isoformat()
            window_hours = max(
                1,
                int(round((timestamps[best_24h_end_idx] - timestamps[best_24h_start_idx]).total_seconds() / 3600)),
            )
            ev_id = make_evidence_id(entity_type, entity_id, EvidenceType.TEMPORAL_BURST, "24h")
            items.append(
                EvidenceItem(
                    evidence_id=ev_id,
                    entity_type=entity_type,
                    entity_id=entity_id,
                    type=EvidenceType.TEMPORAL_BURST,
                    severity=EvidenceSeverity.LOW,
                    title=f"Moderate activity cluster: {best_24h_count} transactions in {window_hours} hours",
                    description=(
                        f"{best_24h_count} community transactions occurred within a {window_hours}-hour "
                        f"window starting at {start_ts[:19]}. While not an extreme burst, this "
                        f"concentration is worth noting during investigation alongside other signals."
                    ),
                    score_contribution=SCORE_CONTRIBUTION[EvidenceSeverity.LOW],
                    observed_at=start_ts,
                    supporting_entities=[],
                    metrics={
                        "transaction_count": best_24h_count,
                        "window_hours": window_hours,
                        "start_timestamp": start_ts,
                        "end_timestamp": end_ts,
                        "window_type": "24_hour",
                    },
                )
            )

    return items


def _detect_rapid_interaction(
    community_accounts: List[str],
    transactions_df: pd.DataFrame,
    account_sent_indices: Dict[str, List[int]],
    account_recv_indices: Dict[str, List[int]],
    entity_type: str = "COMMUNITY",
    entity_id: str = "",
) -> List[EvidenceItem]:
    """E. RAPID_INTERACTION.

    Detects unusually small inter-transaction gaps within the community.
    Computes the median gap between consecutive transaction timestamps
    for all community-related transactions.
    """
    items: List[EvidenceItem] = []

    comm_indices: Set[int] = set()
    for acc in community_accounts:
        comm_indices.update(account_sent_indices.get(acc, []))
        comm_indices.update(account_recv_indices.get(acc, []))

    if len(comm_indices) < 2 or transactions_df.empty:
        return items

    sub_df = transactions_df.iloc[sorted(comm_indices)][["timestamp"]].copy()
    sub_df["timestamp"] = pd.to_datetime(sub_df["timestamp"], errors="coerce", utc=True)
    sub_df = sub_df.dropna(subset=["timestamp"])
    sub_df = sub_df.sort_values("timestamp").reset_index(drop=True)

    if len(sub_df) < 2:
        return items

    ts = sub_df["timestamp"].tolist()
    gaps_hours = [(ts[i + 1] - ts[i]).total_seconds() / 3600.0 for i in range(len(ts) - 1)]
    if not gaps_hours:
        return items

    median_gap = float(np.median(gaps_hours))
    severity = classify_gap_severity(median_gap)
    if severity is None:
        return items

    ev_id = make_evidence_id(entity_type, entity_id, EvidenceType.RAPID_INTERACTION, "gap")
    items.append(
        EvidenceItem(
            evidence_id=ev_id,
            entity_type=entity_type,
            entity_id=entity_id,
            type=EvidenceType.RAPID_INTERACTION,
            severity=severity,
            title=f"Rapid interaction: median gap {median_gap:.2f} hours between transactions",
            description=(
                f"The median time between consecutive transactions within this community is "
                f"{median_gap:.2f} hours across {len(ts)} total observed transactions. "
                f"Unusually small inter-transaction gaps may indicate automated execution, "
                f"rapid testing, or highly coordinated activity across the cluster accounts."
            ),
            score_contribution=SCORE_CONTRIBUTION[severity],
            observed_at=None,
            supporting_entities=[],
            metrics={
                "median_gap_hours": round(median_gap, 4),
                "transaction_count": len(ts),
                "min_gap_hours": round(min(gaps_hours), 4),
                "max_gap_hours": round(max(gaps_hours), 4),
            },
        )
    )

    return items


def _detect_merchant_temporal_overlap(
    community_accounts: List[str],
    connections_map: Dict[str, List[Dict[str, Any]]],
    entity_type: str = "COMMUNITY",
    entity_id: str = "",
) -> List[EvidenceItem]:
    """F. MERCHANT_TEMPORAL_OVERLAP.

    Detects merchants visited by many accounts in the same community.
    Uses the shared_merchants field from account_connections_map,
    which already incorporates the memory-safe temporal (merchant-day)
    logic from projection.py.
    """
    items: List[EvidenceItem] = []
    idx = _build_community_entity_index(community_accounts, connections_map, "shared_merchants")

    for merchant_id in sorted(idx.keys()):
        accounts = sorted(idx[merchant_id])
        count = len(accounts)
        severity = classify_merchant_severity(count)
        if severity is None:
            continue

        ev_id = make_evidence_id(entity_type, entity_id, EvidenceType.MERCHANT_TEMPORAL_OVERLAP, merchant_id)
        items.append(
            EvidenceItem(
                evidence_id=ev_id,
                entity_type=entity_type,
                entity_id=entity_id,
                type=EvidenceType.MERCHANT_TEMPORAL_OVERLAP,
                severity=severity,
                title=f"Merchant {merchant_id} accessed by {count} accounts",
                description=(
                    f"Merchant {merchant_id} was accessed by {count} accounts within this "
                    f"community on the same calendar day. Multiple accounts from the same "
                    f"cluster transacting at a single merchant on the same day may indicate "
                    f"coordinated merchant targeting or shared behavioral patterns requiring review."
                ),
                score_contribution=SCORE_CONTRIBUTION[severity],
                observed_at=None,
                supporting_entities=accounts[:20],
                metrics={
                    "merchant_id": merchant_id,
                    "account_count": count,
                    "accounts_sample": accounts[:10],
                },
            )
        )

    return items


def _detect_high_evidence_density(
    community_id: int,
    features_df: pd.DataFrame,
    entity_type: str = "COMMUNITY",
    entity_id: str = "",
) -> List[EvidenceItem]:
    """G. HIGH_EVIDENCE_DENSITY.

    Detects communities with unusually high relationship evidence concentration
    using weight_per_member, mean_edge_weight, and density from the pre-computed
    community features matrix.
    """
    items: List[EvidenceItem] = []

    if features_df.empty or community_id not in features_df.index:
        return items

    row = features_df.loc[community_id]
    weight_per_member = float(row.get("weight_per_member", 0.0))
    mean_edge_weight = float(row.get("mean_edge_weight", 0.0)) if pd.notna(row.get("mean_edge_weight")) else 0.0
    density = float(row.get("density", 0.0))
    member_count = int(row.get("member_count", 0))

    severity = classify_density_severity(weight_per_member)
    if severity is None:
        return items

    ev_id = make_evidence_id(entity_type, entity_id, EvidenceType.HIGH_EVIDENCE_DENSITY, "density")
    items.append(
        EvidenceItem(
            evidence_id=ev_id,
            entity_type=entity_type,
            entity_id=entity_id,
            type=EvidenceType.HIGH_EVIDENCE_DENSITY,
            severity=severity,
            title=f"High relationship evidence concentration (weight/member: {weight_per_member:.2f})",
            description=(
                f"This community of {member_count} accounts exhibits high observable relationship "
                f"evidence concentration. The evidence weight per member ({weight_per_member:.2f}) "
                f"indicates that accounts in this cluster are densely interconnected through "
                f"multiple shared observable entities (devices, payment instruments, IPs, merchants). "
                f"A mean edge weight of {mean_edge_weight:.2f} and internal connection density of "
                f"{density:.5f} place this cluster among the most strongly interconnected in the network."
            ),
            score_contribution=SCORE_CONTRIBUTION[severity],
            observed_at=None,
            supporting_entities=[],
            metrics={
                "weight_per_member": round(weight_per_member, 4),
                "mean_edge_weight": round(mean_edge_weight, 4),
                "density": round(density, 6),
                "member_count": member_count,
            },
        )
    )

    return items


def _detect_hub_accounts(
    community_accounts: List[str],
    community_edges: List[Dict[str, Any]],
    entity_type: str = "COMMUNITY",
    entity_id: str = "",
) -> List[EvidenceItem]:
    """H. HUB_ACCOUNT.

    Detects accounts with unusually high graph degree relative to other
    members of the same community. High-degree hub accounts are often
    focal points of shared infrastructure or transaction relay patterns.
    """
    items: List[EvidenceItem] = []

    if not community_accounts or not community_edges:
        return items

    member_set = set(community_accounts)
    degrees: Dict[str, int] = {acc: 0 for acc in community_accounts}

    for edge in community_edges:
        src = edge.get("source", "")
        dst = edge.get("target", "")
        if src in degrees:
            degrees[src] += 1
        if dst in degrees:
            degrees[dst] += 1

    degree_values = sorted(degrees.values())
    if len(degree_values) < 2:
        return items

    p50 = float(np.percentile(degree_values, 50))
    p75 = float(np.percentile(degree_values, 75))
    p95 = float(np.percentile(degree_values, 95))

    for account_id in sorted(community_accounts):
        degree = degrees[account_id]
        severity = classify_hub_severity(degree, p95, p75, p50)
        if severity is None:
            continue

        rank_pct = (sum(1 for d in degree_values if d <= degree) / len(degree_values)) * 100
        ev_id = make_evidence_id(entity_type, entity_id, EvidenceType.HUB_ACCOUNT, account_id)
        items.append(
            EvidenceItem(
                evidence_id=ev_id,
                entity_type=entity_type,
                entity_id=entity_id,
                type=EvidenceType.HUB_ACCOUNT,
                severity=severity,
                title=f"Hub account: {account_id} connected to {degree} accounts (top {100-rank_pct:.0f}%)",
                description=(
                    f"Account {account_id} is connected to {degree} other accounts within this "
                    f"community, placing it in the top {100-rank_pct:.0f}% of connectivity (95th percentile: "
                    f"{p95:.0f}, community mean: {np.mean(degree_values):.1f} connections). "
                    f"Accounts with unusually high connectivity frequently appear as focal relay "
                    f"points for shared infrastructure and are recommended for closer investigator review."
                ),
                score_contribution=SCORE_CONTRIBUTION[severity],
                observed_at=None,
                supporting_entities=[account_id],
                metrics={
                    "account_id": account_id,
                    "degree": degree,
                    "percentile_rank": round(rank_pct, 1),
                    "community_p50": round(p50, 1),
                    "community_p75": round(p75, 1),
                    "community_p95": round(p95, 1),
                    "community_size": len(community_accounts),
                },
            )
        )

    return items


def _detect_multi_layer_evidence(
    community_accounts: List[str],
    connections_map: Dict[str, List[Dict[str, Any]]],
    entity_type: str = "COMMUNITY",
    entity_id: str = "",
) -> List[EvidenceItem]:
    """I. MULTI_LAYER_EVIDENCE.

    Detects account pairs where multiple independent observable evidence
    types converge. This is one of the strongest observable evidence
    patterns because it requires coincidental agreement across multiple
    independent data dimensions.

    Evidence dimensions counted:
      1. Shared payment instruments
      2. Shared devices
      3. Shared IP addresses
      4. Shared merchants
    """
    items: List[EvidenceItem] = []
    member_set = set(community_accounts)

    # Collect evidence counts per (a, b) pair — canonical (min, max) ordering
    pair_layers: Dict[Tuple[str, str], Dict[str, int]] = defaultdict(lambda: defaultdict(int))

    for account_id in sorted(community_accounts):
        for conn in connections_map.get(account_id, []):
            peer = conn.get("connected_account_id", "")
            if peer not in member_set:
                continue
            pair = (min(account_id, peer), max(account_id, peer))
            if conn.get("shared_payment_instruments"):
                pair_layers[pair]["instruments"] = len(conn["shared_payment_instruments"])
            if conn.get("shared_devices"):
                pair_layers[pair]["devices"] = len(conn["shared_devices"])
            if conn.get("shared_ips"):
                pair_layers[pair]["ips"] = len(conn["shared_ips"])
            if conn.get("shared_merchants"):
                pair_layers[pair]["merchants"] = len(conn["shared_merchants"])

    for pair in sorted(pair_layers.keys()):
        acc_a, acc_b = pair
        layers = pair_layers[pair]
        layer_count = sum(1 for v in layers.values() if v > 0)

        severity = classify_multilayer_severity(layer_count)
        if severity is None:
            continue

        layer_names = [k for k, v in sorted(layers.items()) if v > 0]
        ev_id = make_evidence_id(entity_type, entity_id, EvidenceType.MULTI_LAYER_EVIDENCE, f"{acc_a}:{acc_b}")
        items.append(
            EvidenceItem(
                evidence_id=ev_id,
                entity_type=entity_type,
                entity_id=entity_id,
                type=EvidenceType.MULTI_LAYER_EVIDENCE,
                severity=severity,
                title=f"Multi-layer evidence: {layer_count} independent signals converge on {acc_a} ↔ {acc_b}",
                description=(
                    f"Accounts {acc_a} and {acc_b} share {layer_count} independent observable "
                    f"evidence dimensions simultaneously: {', '.join(layer_names)}. "
                    f"When multiple distinct infrastructure signals — such as shared hardware, "
                    f"shared payment credentials, and shared network origin — all converge on "
                    f"the same account pair, this represents particularly strong observable "
                    f"relationship evidence warranting investigator review."
                ),
                score_contribution=SCORE_CONTRIBUTION[severity],
                observed_at=None,
                supporting_entities=sorted([acc_a, acc_b]),
                metrics={
                    "account_a": acc_a,
                    "account_b": acc_b,
                    "layer_count": layer_count,
                    "dimensions": {k: v for k, v in layers.items() if v > 0},
                    "layer_names": layer_names,
                },
            )
        )

    return items


# ---------------------------------------------------------------------------
# Main EvidenceEngine class
# ---------------------------------------------------------------------------


class EvidenceEngine:
    """Observable-only rule-based evidence engine for TraceLine.

    Accepts in-memory data structures from TraceLineService and applies
    9 deterministic detectors to produce EvidenceItem records.

    Usage
    -----
    engine = EvidenceEngine(
        transactions_df=service.transactions_df,
        community_to_accounts=service.community_to_accounts,
        account_to_community=service.account_to_community,
        account_connections_map=service.account_connections_map,
        community_edges_map=service.community_edges_map,
        community_features_df=service.community_features_df,
        account_sent_tx_indices=service.account_sent_tx_indices,
        account_recv_tx_indices=service.account_recv_tx_indices,
    )
    result = engine.get_community_evidence(3)
    """

    def __init__(
        self,
        transactions_df: pd.DataFrame,
        community_to_accounts: Dict[int, List[str]],
        account_to_community: Dict[str, int],
        account_connections_map: Dict[str, List[Dict[str, Any]]],
        community_edges_map: Dict[int, List[Dict[str, Any]]],
        community_features_df: pd.DataFrame,
        account_sent_tx_indices: Dict[str, List[int]],
        account_recv_tx_indices: Dict[str, List[int]],
    ) -> None:
        self._transactions_df = transactions_df
        self._community_to_accounts = community_to_accounts
        self._account_to_community = account_to_community
        self._connections_map = account_connections_map
        self._community_edges_map = community_edges_map
        self._features_df = community_features_df
        self._sent_idx = account_sent_tx_indices
        self._recv_idx = account_recv_tx_indices

    # -----------------------------------------------------------------------
    # Public API
    # -----------------------------------------------------------------------

    def get_community_evidence(self, community_id: int) -> CommunityEvidenceSummary:
        """Run all evidence detectors for a community and return summary.

        Args:
            community_id: Integer community ID.

        Returns:
            :class:`CommunityEvidenceSummary` with sorted, scored evidence.
        """
        t0 = time.perf_counter()

        accounts = self._community_to_accounts.get(community_id, [])
        entity_id = str(community_id)
        entity_type = "COMMUNITY"

        all_items: List[EvidenceItem] = []

        if accounts:
            # A. Shared instrument concentration
            all_items.extend(
                _detect_shared_instrument_concentration(accounts, self._connections_map, entity_type, entity_id)
            )
            # B. Device reuse
            all_items.extend(
                _detect_device_reuse(accounts, self._connections_map, entity_type, entity_id)
            )
            # C. IP concentration
            all_items.extend(
                _detect_ip_concentration(accounts, self._connections_map, entity_type, entity_id)
            )
            # D. Temporal burst
            all_items.extend(
                _detect_temporal_burst(accounts, self._transactions_df, self._sent_idx, self._recv_idx, entity_type, entity_id)
            )
            # E. Rapid interaction
            all_items.extend(
                _detect_rapid_interaction(accounts, self._transactions_df, self._sent_idx, self._recv_idx, entity_type, entity_id)
            )
            # F. Merchant temporal overlap
            all_items.extend(
                _detect_merchant_temporal_overlap(accounts, self._connections_map, entity_type, entity_id)
            )
            # I. Multi-layer evidence
            all_items.extend(
                _detect_multi_layer_evidence(accounts, self._connections_map, entity_type, entity_id)
            )

        # G. High evidence density (from features, works even with empty accounts)
        all_items.extend(
            _detect_high_evidence_density(community_id, self._features_df, entity_type, entity_id)
        )

        # H. Hub accounts
        community_edges = self._community_edges_map.get(community_id, [])
        all_items.extend(
            _detect_hub_accounts(accounts, community_edges, entity_type, entity_id)
        )

        # Deduplicate by evidence_id (deterministic)
        seen: Set[str] = set()
        unique_items: List[EvidenceItem] = []
        for item in all_items:
            if item.evidence_id not in seen:
                seen.add(item.evidence_id)
                unique_items.append(item)

        # Sort deterministically
        sorted_items = sort_evidence(unique_items)

        runtime_ms = (time.perf_counter() - t0) * 1000
        score = compute_evidence_score(sorted_items)

        return CommunityEvidenceSummary(
            community_id=community_id,
            evidence_score=score,
            evidence_count=len(sorted_items),
            high_count=sum(1 for i in sorted_items if i.severity == EvidenceSeverity.HIGH),
            medium_count=sum(1 for i in sorted_items if i.severity == EvidenceSeverity.MEDIUM),
            low_count=sum(1 for i in sorted_items if i.severity == EvidenceSeverity.LOW),
            items=sorted_items,
            runtime_ms=runtime_ms,
        )

    def get_account_evidence(self, account_id: str) -> AccountEvidenceSummary:
        """Run account-scoped evidence detectors for a single account.

        Focuses on evidence directly associated with the account:
        its graph connections, infrastructure sharing, and temporal behavior.

        Args:
            account_id: Account identifier string.

        Returns:
            :class:`AccountEvidenceSummary` with sorted, scored evidence.
        """
        t0 = time.perf_counter()

        community_id = self._account_to_community.get(account_id)
        entity_type = "ACCOUNT"
        entity_id = account_id

        all_items: List[EvidenceItem] = []

        # Use the account's community accounts as the membership context,
        # but restrict evidence to edges directly involving this account.
        community_accounts = self._community_to_accounts.get(community_id, []) if community_id is not None else [account_id]
        account_conns = self._connections_map.get(account_id, [])

        if account_conns:
            peer_set = {c["connected_account_id"] for c in account_conns} | {account_id}
            peer_list = sorted(peer_set)

            # A. Instrument sharing (account-centric: only edges involving this account)
            instr_idx: Dict[str, Set[str]] = defaultdict(set)
            for conn in account_conns:
                for instr in conn.get("shared_payment_instruments", []):
                    instr_idx[instr].add(account_id)
                    instr_idx[instr].add(conn["connected_account_id"])
            for instr_id, accounts in sorted(instr_idx.items()):
                count = len(accounts)
                sev = classify_sharing_severity(count)
                if sev is None:
                    continue
                ev_id = make_evidence_id(entity_type, entity_id, EvidenceType.SHARED_INSTRUMENT_CONCENTRATION, instr_id)
                all_items.append(
                    EvidenceItem(
                        evidence_id=ev_id,
                        entity_type=entity_type,
                        entity_id=entity_id,
                        type=EvidenceType.SHARED_INSTRUMENT_CONCENTRATION,
                        severity=sev,
                        title=f"Account shares payment instrument {instr_id} with {count - 1} other accounts",
                        description=(
                            f"Account {account_id} and {count - 1} connected account(s) share "
                            f"payment instrument {instr_id}. Shared payment credentials across "
                            f"multiple distinct customer profiles require investigator review."
                        ),
                        score_contribution=SCORE_CONTRIBUTION[sev],
                        observed_at=None,
                        supporting_entities=sorted(accounts)[:20],
                        metrics={"instrument_id": instr_id, "account_count": count},
                    )
                )

            # B. Device reuse (account-centric)
            dev_idx: Dict[str, Set[str]] = defaultdict(set)
            for conn in account_conns:
                for dev in conn.get("shared_devices", []):
                    dev_idx[dev].add(account_id)
                    dev_idx[dev].add(conn["connected_account_id"])
            for dev_id, accounts in sorted(dev_idx.items()):
                count = len(accounts)
                sev = classify_sharing_severity(count)
                if sev is None:
                    continue
                ev_id = make_evidence_id(entity_type, entity_id, EvidenceType.DEVICE_REUSE, dev_id)
                all_items.append(
                    EvidenceItem(
                        evidence_id=ev_id,
                        entity_type=entity_type,
                        entity_id=entity_id,
                        type=EvidenceType.DEVICE_REUSE,
                        severity=sev,
                        title=f"Account shares device {dev_id} with {count - 1} other accounts",
                        description=(
                            f"Account {account_id} and {count - 1} connected account(s) share "
                            f"hardware device {dev_id}. Multiple profiles operating from the same "
                            f"physical device constitutes shared infrastructure evidence."
                        ),
                        score_contribution=SCORE_CONTRIBUTION[sev],
                        observed_at=None,
                        supporting_entities=sorted(accounts)[:20],
                        metrics={"device_id": dev_id, "account_count": count},
                    )
                )

            # C. IP concentration (account-centric)
            ip_idx: Dict[str, Set[str]] = defaultdict(set)
            for conn in account_conns:
                for ip in conn.get("shared_ips", []):
                    ip_idx[ip].add(account_id)
                    ip_idx[ip].add(conn["connected_account_id"])
            for ip_addr, accounts in sorted(ip_idx.items()):
                count = len(accounts)
                sev = classify_ip_severity(count)
                if sev is None:
                    continue
                ev_id = make_evidence_id(entity_type, entity_id, EvidenceType.IP_CONCENTRATION, ip_addr)
                all_items.append(
                    EvidenceItem(
                        evidence_id=ev_id,
                        entity_type=entity_type,
                        entity_id=entity_id,
                        type=EvidenceType.IP_CONCENTRATION,
                        severity=sev,
                        title=f"IP address {ip_addr} shared with {count - 1} other accounts",
                        description=(
                            f"Account {account_id} shares IP address {ip_addr} with {count - 1} "
                            f"connected account(s). High IP sharing across many profiles may indicate "
                            f"shared network origin."
                        ),
                        score_contribution=SCORE_CONTRIBUTION[sev],
                        observed_at=None,
                        supporting_entities=sorted(accounts)[:20],
                        metrics={"ip_address": ip_addr, "account_count": count},
                    )
                )

            # I. Multi-layer evidence (account-centric)
            for conn in sorted(account_conns, key=lambda c: c.get("connected_account_id", "")):
                peer = conn.get("connected_account_id", "")
                layers: Dict[str, int] = {}
                if conn.get("shared_payment_instruments"):
                    layers["instruments"] = len(conn["shared_payment_instruments"])
                if conn.get("shared_devices"):
                    layers["devices"] = len(conn["shared_devices"])
                if conn.get("shared_ips"):
                    layers["ips"] = len(conn["shared_ips"])
                if conn.get("shared_merchants"):
                    layers["merchants"] = len(conn["shared_merchants"])
                layer_count = len(layers)
                sev = classify_multilayer_severity(layer_count)
                if sev is None:
                    continue
                pair_key = f"{min(account_id, peer)}:{max(account_id, peer)}"
                ev_id = make_evidence_id(entity_type, entity_id, EvidenceType.MULTI_LAYER_EVIDENCE, pair_key)
                layer_names = sorted(layers.keys())
                all_items.append(
                    EvidenceItem(
                        evidence_id=ev_id,
                        entity_type=entity_type,
                        entity_id=entity_id,
                        type=EvidenceType.MULTI_LAYER_EVIDENCE,
                        severity=sev,
                        title=f"Multi-layer evidence with {peer}: {layer_count} independent signals",
                        description=(
                            f"Accounts {account_id} and {peer} share {layer_count} independent "
                            f"observable evidence dimensions: {', '.join(layer_names)}. "
                            f"Convergence of multiple distinct signals on this account relationship "
                            f"represents particularly strong observable evidence."
                        ),
                        score_contribution=SCORE_CONTRIBUTION[sev],
                        observed_at=None,
                        supporting_entities=sorted([account_id, peer]),
                        metrics={
                            "peer_account": peer,
                            "layer_count": layer_count,
                            "dimensions": {k: v for k, v in layers.items()},
                            "layer_names": layer_names,
                        },
                    )
                )

        # D. Temporal burst (account-scoped: only this account's transactions)
        all_items.extend(
            _detect_temporal_burst(
                [account_id],
                self._transactions_df,
                self._sent_idx,
                self._recv_idx,
                entity_type,
                entity_id,
            )
        )

        # E. Rapid interaction (account-scoped)
        all_items.extend(
            _detect_rapid_interaction(
                [account_id],
                self._transactions_df,
                self._sent_idx,
                self._recv_idx,
                entity_type,
                entity_id,
            )
        )

        # H. Hub account (within community context)
        if community_id is not None:
            community_edges = self._community_edges_map.get(community_id, [])
            hub_items = _detect_hub_accounts(
                community_accounts,
                community_edges,
                entity_type="COMMUNITY",  # context label
                entity_id=str(community_id),
            )
            # Filter to only items about this specific account
            for item in hub_items:
                if account_id in item.supporting_entities:
                    # Re-brand to account scope
                    scoped = EvidenceItem(
                        evidence_id=make_evidence_id("ACCOUNT", account_id, EvidenceType.HUB_ACCOUNT, account_id),
                        entity_type=entity_type,
                        entity_id=entity_id,
                        type=item.type,
                        severity=item.severity,
                        title=item.title,
                        description=item.description,
                        score_contribution=item.score_contribution,
                        observed_at=item.observed_at,
                        supporting_entities=item.supporting_entities,
                        metrics=item.metrics,
                    )
                    all_items.append(scoped)

        # Deduplicate and sort
        seen: Set[str] = set()
        unique_items: List[EvidenceItem] = []
        for item in all_items:
            if item.evidence_id not in seen:
                seen.add(item.evidence_id)
                unique_items.append(item)

        sorted_items = sort_evidence(unique_items)
        runtime_ms = (time.perf_counter() - t0) * 1000
        score = compute_evidence_score(sorted_items)

        return AccountEvidenceSummary(
            account_id=account_id,
            community_id=community_id,
            evidence_score=score,
            evidence_count=len(sorted_items),
            high_count=sum(1 for i in sorted_items if i.severity == EvidenceSeverity.HIGH),
            medium_count=sum(1 for i in sorted_items if i.severity == EvidenceSeverity.MEDIUM),
            low_count=sum(1 for i in sorted_items if i.severity == EvidenceSeverity.LOW),
            items=sorted_items,
            runtime_ms=runtime_ms,
        )
