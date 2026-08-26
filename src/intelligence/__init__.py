"""TraceLine Evidence Intelligence Engine package.

Observable-only, deterministic evidence analysis for payment network
investigation. Produces structured, explainable evidence items for
communities and accounts — answering WHY an entity requires review,
not merely WHAT its risk score is.

Leakage Contract
----------------
This package reads only observable payment-network data. It never
imports or accesses:
  - src.evaluation
  - fraud_cases.csv
  - community_labels.csv
  - pattern_id, is_ring_member, link_type, fraud_purity,
    max_ring_coverage, primary_ring_id, is_positive
"""

from src.intelligence.evidence_engine import (
    AccountEvidenceSummary,
    CommunityEvidenceSummary,
    EvidenceEngine,
)
from src.intelligence.evidence_rules import (
    EvidenceItem,
    EvidenceSeverity,
    EvidenceType,
    compute_evidence_score,
    sort_evidence,
)

__all__ = [
    "AccountEvidenceSummary",
    "CommunityEvidenceSummary",
    "EvidenceEngine",
    "EvidenceItem",
    "EvidenceSeverity",
    "EvidenceType",
    "compute_evidence_score",
    "sort_evidence",
]
