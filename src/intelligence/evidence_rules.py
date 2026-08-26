"""Evidence rules: typed models, severity classification, and scoring.

Defines:
- EvidenceType: the 9 observable evidence detector names
- EvidenceSeverity: HIGH / MEDIUM / LOW tiers
- EvidenceItem: fully-typed, observable-only evidence record
- sort_evidence(): canonical deterministic sort
- compute_evidence_score(): aggregate score from item list

Leakage Contract
----------------
This module never references evaluation-only ground-truth fields.
All metric values in EvidenceItem.metrics must derive from observable
payment-network data only.

Threshold Documentation
-----------------------
All thresholds in this module are **investigator-prioritization
heuristics, not statistically calibrated fraud probabilities**.
They are tuned for operational triage with 59 Louvain communities
over 50,000 accounts.  Adjust them as the network grows.

Evidence Score
--------------
  evidence_score = min(100, sum(item.score_contribution))

This score is DISTINCT from the ML-derived risk_score:
  risk_score      = ensemble ML prioritization (logistic regression + random forest)
  evidence_score  = deterministic count of observable rule strength

Do NOT combine or conflate the two.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


# ---------------------------------------------------------------------------
# Evidence type and severity enumerations
# ---------------------------------------------------------------------------


class EvidenceType(str, Enum):
    """Observable evidence detector categories."""

    SHARED_INSTRUMENT_CONCENTRATION = "SHARED_INSTRUMENT_CONCENTRATION"
    DEVICE_REUSE = "DEVICE_REUSE"
    IP_CONCENTRATION = "IP_CONCENTRATION"
    TEMPORAL_BURST = "TEMPORAL_BURST"
    RAPID_INTERACTION = "RAPID_INTERACTION"
    MERCHANT_TEMPORAL_OVERLAP = "MERCHANT_TEMPORAL_OVERLAP"
    HIGH_EVIDENCE_DENSITY = "HIGH_EVIDENCE_DENSITY"
    HUB_ACCOUNT = "HUB_ACCOUNT"
    MULTI_LAYER_EVIDENCE = "MULTI_LAYER_EVIDENCE"


class EvidenceSeverity(str, Enum):
    """Investigation priority tier."""

    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


# Severity ordering for deterministic sort (lower number = higher priority).
_SEVERITY_ORDER: Dict[str, int] = {
    EvidenceSeverity.HIGH: 0,
    EvidenceSeverity.MEDIUM: 1,
    EvidenceSeverity.LOW: 2,
}

# Score contribution per severity level (points added to evidence_score).
# Thresholds are heuristics, not calibrated probabilities.
SCORE_CONTRIBUTION: Dict[str, float] = {
    EvidenceSeverity.HIGH: 25.0,
    EvidenceSeverity.MEDIUM: 12.0,
    EvidenceSeverity.LOW: 5.0,
}

# Maximum evidence_score cap.
EVIDENCE_SCORE_MAX: float = 100.0


# ---------------------------------------------------------------------------
# EvidenceItem: the atomic unit of observable evidence
# ---------------------------------------------------------------------------


@dataclass
class EvidenceItem:
    """A single observable evidence finding for one entity.

    All fields derive exclusively from observable payment-network data.

    Fields
    ------
    evidence_id : str
        Deterministic identifier based on entity + type + subkey.
        Computed by :func:`make_evidence_id`.
    entity_type : str
        ``"COMMUNITY"`` or ``"ACCOUNT"``.
    entity_id : str
        Community ID (as string) or account ID.
    type : str
        One of the :class:`EvidenceType` values.
    severity : str
        One of the :class:`EvidenceSeverity` values.
    title : str
        Short investigator-facing title.
    description : str
        Full natural-language explanation.  Must answer:
        WHAT happened, WHY it is notable, WHAT entities support it.
    score_contribution : float
        Points added to the aggregate evidence_score.
    observed_at : Optional[str]
        ISO 8601 timestamp of earliest related observation, or None.
    supporting_entities : List[str]
        Sorted list of observable entity IDs (device IDs, instrument IDs,
        account IDs, IP addresses) supporting this finding.
    metrics : Dict[str, Any]
        Named observable measurement values (counts, ratios, timestamps).

    Forbidden fields (must never appear)
    ------------------------------------
    pattern_id, is_ring_member, link_type, fraud_purity,
    max_ring_coverage, primary_ring_id, is_positive
    """

    evidence_id: str
    entity_type: str
    entity_id: str
    type: str
    severity: str
    title: str
    description: str
    score_contribution: float
    observed_at: Optional[str]
    supporting_entities: List[str]
    metrics: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to a plain dict (JSON-safe)."""
        return {
            "evidence_id": self.evidence_id,
            "entity_type": self.entity_type,
            "entity_id": self.entity_id,
            "type": self.type,
            "severity": self.severity,
            "title": self.title,
            "description": self.description,
            "score_contribution": self.score_contribution,
            "observed_at": self.observed_at,
            "supporting_entities": self.supporting_entities,
            "metrics": self.metrics,
        }


# ---------------------------------------------------------------------------
# Helper: deterministic evidence ID
# ---------------------------------------------------------------------------


def make_evidence_id(entity_type: str, entity_id: str, ev_type: str, subkey: str = "") -> str:
    """Generate a deterministic evidence ID using SHA-1.

    Args:
        entity_type: ``"COMMUNITY"`` or ``"ACCOUNT"``.
        entity_id:   Community ID or account ID.
        ev_type:     :class:`EvidenceType` value.
        subkey:      Optional disambiguator (e.g., device ID, instrument ID).

    Returns:
        12-character hex string, prefixed with ``"ev_"``.
    """
    raw = f"{entity_type}:{entity_id}:{ev_type}:{subkey}"
    return "ev_" + hashlib.sha1(raw.encode()).hexdigest()[:12]


# ---------------------------------------------------------------------------
# Severity classification helpers
# ---------------------------------------------------------------------------


def classify_sharing_severity(account_count: int) -> Optional[EvidenceSeverity]:
    """Classify severity for instrument/device sharing by account count.

    Thresholds (heuristic, not calibrated):
      HIGH   >= 5 accounts sharing one entity
      MEDIUM >= 3 accounts sharing one entity
      LOW    >= 2 accounts sharing one entity

    Returns None if account_count < 2 (not noteworthy).
    """
    if account_count >= 5:
        return EvidenceSeverity.HIGH
    if account_count >= 3:
        return EvidenceSeverity.MEDIUM
    if account_count >= 2:
        return EvidenceSeverity.LOW
    return None


def classify_ip_severity(account_count: int) -> Optional[EvidenceSeverity]:
    """Classify severity for IP concentration by account count.

    IP sharing is weaker evidence than instrument/device sharing, so
    thresholds are set higher to avoid low-signal noise.

    Thresholds (heuristic, not calibrated):
      HIGH   >= 8 accounts sharing one IP
      MEDIUM >= 4 accounts sharing one IP
      LOW    >= 2 accounts sharing one IP
    """
    if account_count >= 8:
        return EvidenceSeverity.HIGH
    if account_count >= 4:
        return EvidenceSeverity.MEDIUM
    if account_count >= 2:
        return EvidenceSeverity.LOW
    return None


def classify_burst_severity(tx_count: int) -> Optional[EvidenceSeverity]:
    """Classify severity for temporal burst by transaction count in window.

    Thresholds (heuristic, not calibrated):
      HIGH   >= 15 related transactions in a 60-minute window
      MEDIUM >= 8 related transactions in a 60-minute window
      LOW    >= 4 related transactions in a 24-hour window (fallback)
    """
    if tx_count >= 15:
        return EvidenceSeverity.HIGH
    if tx_count >= 8:
        return EvidenceSeverity.MEDIUM
    if tx_count >= 4:
        return EvidenceSeverity.LOW
    return None


def classify_gap_severity(median_gap_hours: float) -> Optional[EvidenceSeverity]:
    """Classify severity for rapid interaction by median inter-transaction gap.

    Thresholds (heuristic, not calibrated):
      HIGH   median gap < 0.5 hours  (30 minutes)
      MEDIUM median gap < 2.0 hours
      LOW    median gap < 6.0 hours
    """
    if median_gap_hours < 0.5:
        return EvidenceSeverity.HIGH
    if median_gap_hours < 2.0:
        return EvidenceSeverity.MEDIUM
    if median_gap_hours < 6.0:
        return EvidenceSeverity.LOW
    return None


def classify_merchant_severity(account_count: int) -> Optional[EvidenceSeverity]:
    """Classify severity for merchant temporal overlap by account count.

    Thresholds (heuristic, not calibrated):
      HIGH   >= 6 accounts at same merchant
      MEDIUM >= 3 accounts at same merchant
      LOW    >= 2 accounts at same merchant
    """
    if account_count >= 6:
        return EvidenceSeverity.HIGH
    if account_count >= 3:
        return EvidenceSeverity.MEDIUM
    if account_count >= 2:
        return EvidenceSeverity.LOW
    return None


def classify_density_severity(weight_per_member: float) -> Optional[EvidenceSeverity]:
    """Classify severity for evidence density by weight_per_member.

    Thresholds (heuristic, not calibrated):
      HIGH   weight_per_member > 10.0
      MEDIUM weight_per_member > 3.0
      LOW    weight_per_member > 0.5
    """
    if weight_per_member > 10.0:
        return EvidenceSeverity.HIGH
    if weight_per_member > 3.0:
        return EvidenceSeverity.MEDIUM
    if weight_per_member > 0.5:
        return EvidenceSeverity.LOW
    return None


def classify_hub_severity(degree: int, p95: float, p75: float, p50: float) -> Optional[EvidenceSeverity]:
    """Classify severity for hub account by degree percentile.

    Thresholds (heuristic, not calibrated):
      HIGH   degree >= 95th percentile AND degree >= 10
      MEDIUM degree >= 75th percentile AND degree >= 5
      LOW    degree >= 50th percentile AND degree >= 3
    """
    if degree >= p95 and degree >= 10:
        return EvidenceSeverity.HIGH
    if degree >= p75 and degree >= 5:
        return EvidenceSeverity.MEDIUM
    if degree >= p50 and degree >= 3:
        return EvidenceSeverity.LOW
    return None


def classify_multilayer_severity(layer_count: int) -> Optional[EvidenceSeverity]:
    """Classify severity for multi-layer evidence by convergent dimension count.

    Thresholds (heuristic, not calibrated):
      HIGH   >= 3 independent evidence dimensions converge
      MEDIUM == 2 independent evidence dimensions converge
    """
    if layer_count >= 3:
        return EvidenceSeverity.HIGH
    if layer_count >= 2:
        return EvidenceSeverity.MEDIUM
    return None


# ---------------------------------------------------------------------------
# Sort and scoring
# ---------------------------------------------------------------------------


def sort_evidence(items: List[EvidenceItem]) -> List[EvidenceItem]:
    """Sort evidence items deterministically.

    Order:
      1. Severity: HIGH > MEDIUM > LOW
      2. Within severity: score_contribution descending
      3. Tie-break: evidence_id alphabetical (byte-stable)
    """
    return sorted(
        items,
        key=lambda e: (
            _SEVERITY_ORDER.get(e.severity, 99),
            -e.score_contribution,
            e.evidence_id,
        ),
    )


def compute_evidence_score(items: List[EvidenceItem]) -> int:
    """Compute the aggregate evidence score from a list of items.

    This score is DISTINCT from the ML risk_score. It represents the
    total weight of deterministic observable rules firing.

    Returns an integer in [0, 100].
    """
    total = sum(item.score_contribution for item in items)
    return min(int(round(total)), int(EVIDENCE_SCORE_MAX))
