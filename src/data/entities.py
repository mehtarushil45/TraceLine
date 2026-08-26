"""Deterministic synthetic payment-world entity generation for TraceLine.

This module builds the synthetic "payment environment" that surrounds the raw
SantanderAI account/transaction graph:

* merchant catalog
* device pool
* payment-instrument pool
* IP-address pool
* per-account stable assignments (account -> device / instrument / IP)
* per-fraud-pattern "ring profiles" whose members adopt *probabilistically*

Design rules enforced here
--------------------------
* Every choice is derived from SHA-256 hashes of stable identifiers plus a
  seed, so the same inputs + seed always produce byte-identical outputs.
* Normal accounts mostly reuse one stable device and one stable instrument.
* Shared IPs are far more common than shared devices (household/ISP effect).
* Ring accounts correlate through shared entities, but adoption is
  probabilistic and jittered per pattern, so no single feature separates
  rings from legitimate co-occurrence.
* Nothing in this module ever reads or produces fraud labels; label handling
  lives exclusively in :mod:`src.data.enrichment`.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass

import pandas as pd

# ---------------------------------------------------------------------------
# Deterministic primitives
# ---------------------------------------------------------------------------


def stable_int(key: str, salt: str = "") -> int:
    """Return a deterministic unsigned 64-bit integer for ``key``.

    Args:
        key: Stable identifier (e.g. an account id).
        salt: Domain separator so different decisions never collide.

    Returns:
        An integer in ``[0, 2**64)`` derived from SHA-256.
    """
    payload = f"{salt}|{key}".encode()
    return int.from_bytes(hashlib.sha256(payload).digest()[:8], "big")


def stable_float(key: str, salt: str = "") -> float:
    """Return a deterministic float in ``[0, 1)`` for ``key``."""
    return stable_int(key, salt) / float(2**64)


def _account_num(account_id: str) -> int:
    """Extract the trailing integer of ids like ``acc_123``; fall back to hash."""
    suffix = account_id.rsplit("_", 1)[-1]
    if suffix.isdigit():
        return int(suffix)
    return stable_int(account_id, "fallback-num") % (2**31)


# ---------------------------------------------------------------------------
# Catalog value pools
# ---------------------------------------------------------------------------

_MERCHANT_BRANDS: tuple[str, ...] = (
    "Nova", "Zenith", "Orbit", "Kavya", "Sundara", "Meridian", "Pulse",
    "Ananya", "Vertex", "Bluepeak", "Trident", "Lotus", "Quartz", "Indus",
    "Aurora", "Silverline",
)

_MERCHANT_SUFFIXES: tuple[str, ...] = (
    "Mart", "Bazaar", "Retail", "Stores", "Digital", "Services", "Trade",
    "Hub",
)

_MERCHANT_CATEGORIES: tuple[str, ...] = (
    "grocery", "electronics", "travel", "utilities", "restaurants",
    "apparel", "fuel", "pharmacy", "entertainment", "insurance",
    "education", "jewellery",
)

_DEVICE_OS: tuple[str, ...] = (
    "android-13", "android-14", "ios-16", "ios-17", "windows-11", "macos-14",
)

_ISPS: tuple[str, ...] = (
    "JioNet", "AirtelBB", "BSNL Fiber", "Vodafone-India", "ACT Fibernet",
    "Hathway", "Tata Play Fiber",
)

_INSTRUMENT_NETWORKS: tuple[str, ...] = ("visa", "mastercard", "rupay", "amex")

_INSTRUMENT_TYPES: tuple[str, ...] = (
    "card", "card", "card",  # weighted toward cards
    "upi", "upi",
    "netbanking",
    "wallet",
)


@dataclass(frozen=True)
class RingProfile:
    """Shared-entity bundle offered to the members of one fraud pattern.

    Adoption of each entity is probabilistic (see the ``p_*`` fields), which
    keeps ring behaviour correlated but never perfectly deterministic.
    """

    pattern_id: str
    device_id: str
    ip_address: str
    instrument_id: str | None
    merchant_indices: tuple[int, ...]
    p_device_use: float
    p_ip_use: float
    p_instrument_use: float
    p_merchant_use: float


@dataclass
class PaymentWorld:
    """All synthetic entities plus the deterministic per-account assignments."""

    seed: int
    accounts: pd.DataFrame
    merchants: pd.DataFrame
    devices: pd.DataFrame
    instruments: pd.DataFrame
    ips: pd.DataFrame
    account_device: dict[str, str]
    account_instrument: dict[str, str]
    account_ip: dict[str, str]
    pref_merchant: dict[str, int]
    alt_merchant: dict[str, int]
    instrument_type: dict[str, str]
    ring_profiles: dict[str, RingProfile]
    account_ring: dict[str, RingProfile]

    @property
    def n_shared_devices(self) -> int:
        """Size of the shared-device pool (ids are ``dev_s%04d``)."""
        return max(4, len(self.accounts) // 30)

    @property
    def n_shared_instruments(self) -> int:
        """Size of the shared-instrument pool (ids are ``ins_s%04d``)."""
        return max(4, len(self.accounts) // 22)


# ---------------------------------------------------------------------------
# Catalog builders
# ---------------------------------------------------------------------------


def _build_merchants(n_merchants: int, seed: int) -> pd.DataFrame:
    """Create the merchant catalog deterministically."""
    rows = []
    for i in range(n_merchants):
        brand = _MERCHANT_BRANDS[stable_int(str(i), f"{seed}|brand") % len(_MERCHANT_BRANDS)]
        suffix = _MERCHANT_SUFFIXES[stable_int(str(i), f"{seed}|suffix") % len(_MERCHANT_SUFFIXES)]
        category = _MERCHANT_CATEGORIES[
            stable_int(str(i), f"{seed}|category") % len(_MERCHANT_CATEGORIES)
        ]
        tier_u = stable_float(str(i), f"{seed}|tier")
        rows.append(
            {
                "merchant_id": f"mch_{i:05d}",
                "name": f"{brand} {suffix}",
                "category": category,
                "country": "IN",
                "risk_tier": "medium" if tier_u < 0.12 else "low",
            }
        )
    return pd.DataFrame(rows)


def _build_instruments(
    n_accounts: int, n_shared: int, ring_profiles: list[RingProfile], seed: int
) -> pd.DataFrame:
    """Create the payment-instrument catalog (cards/UPI/wallet/netbanking)."""
    rows = []

    def _instrument_row(instrument_id: str, key: str) -> dict:
        itype = _INSTRUMENT_TYPES[stable_int(key, f"{seed}-itype") % len(_INSTRUMENT_TYPES)]
        if itype == "card":
            network = _INSTRUMENT_NETWORKS[
                stable_int(key, f"{seed}-net") % len(_INSTRUMENT_NETWORKS)
            ]
        elif itype == "upi":
            network = "upi"
        elif itype == "wallet":
            network = "wallet-provider"
        else:
            network = "bank-transfer"
        last4 = f"{stable_int(key, f'{seed}-last4') % 10000:04d}"
        exp_month = 1 + stable_int(key, f"{seed}-expm") % 12
        exp_year = 2027 + stable_int(key, f"{seed}-expy") % 4
        return {
            "instrument_id": instrument_id,
            "instrument_type": itype,
            "network": network,
            "last4": last4,
            "expiry": f"{exp_month:02d}/{exp_year}",
        }

    for i in range(n_accounts):
        rows.append(_instrument_row(f"ins_{i:06d}", f"personal|{i}"))
    for k in range(n_shared):
        rows.append(_instrument_row(f"ins_s{k:04d}", f"shared|{k}"))
    for profile in ring_profiles:
        if profile.instrument_id is not None:
            rows.append(_instrument_row(profile.instrument_id, f"ring|{profile.pattern_id}"))
    return pd.DataFrame(rows)


def _ip_pool(n_ips: int, seed: int) -> list[str]:
    """Generate a pool of unique private IPs (small => heavily shared)."""
    seen = set()
    pool: list[str] = []
    attempt = 0
    while len(pool) < n_ips:
        h = stable_int(str(attempt), f"{seed}|ippool")
        cand = f"10.{(h >> 8) % 256}.{(h >> 16) % 256}.{(h >> 24) % 256}"
        if cand not in seen:
            seen.add(cand)
            pool.append(cand)
        attempt += 1
    return pool


def _build_ips(ip_pool: list[str], ring_profiles: list[RingProfile], seed: int) -> pd.DataFrame:
    """Create the IP-address table from the shared pool plus ring IPs."""
    rows = []
    for ip in ip_pool:
        rows.append(
            {
                "ip_address": ip,
                "isp": _ISPS[stable_int(ip, f"{seed}-isp") % len(_ISPS)],
                "country": "IN",
                "is_mobile_isp": stable_float(ip, f"{seed}-mob") < 0.35,
            }
        )
    for profile in ring_profiles:
        rows.append(
            {
                "ip_address": profile.ip_address,
                "isp": _ISPS[stable_int(profile.pattern_id, f"{seed}-rip") % len(_ISPS)],
                "country": "IN",
                "is_mobile_isp": False,
            }
        )
    return pd.DataFrame(rows)


def _build_devices(
    n_personal: int, n_shared: int, ring_profiles: list[RingProfile], seed: int
) -> pd.DataFrame:
    """Create the device catalog: personal, shared-pool and ring devices."""
    rows = []
    for i in range(n_personal):
        os_pick = stable_int(str(i), f"{seed}|dev-os") % len(_DEVICE_OS)
        rows.append(
            {
                "device_id": f"dev_{i:06d}",
                "os": _DEVICE_OS[os_pick],
                "device_type": (
                    "mobile"
                    if _DEVICE_OS[os_pick].startswith(("android", "ios"))
                    else "desktop"
                ),
                "first_seen": "2023-01-01",
            }
        )
    for k in range(n_shared):
        os_pick = stable_int(str(k), f"{seed}|sdev-os") % len(_DEVICE_OS)
        rows.append(
            {
                "device_id": f"dev_s{k:04d}",
                "os": _DEVICE_OS[os_pick],
                "device_type": (
                    "mobile"
                    if _DEVICE_OS[os_pick].startswith(("android", "ios"))
                    else "desktop"
                ),
                "first_seen": "2023-01-01",
            }
        )
    for profile in ring_profiles:
        rows.append(
            {
                "device_id": profile.device_id,
                "os": _DEVICE_OS[
                    stable_int(profile.pattern_id, f"{seed}|rdev-os") % len(_DEVICE_OS)
                ],
                "device_type": "mobile",
                "first_seen": "2023-06-01",
            }
        )
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# Ring profiles
# ---------------------------------------------------------------------------


def build_ring_profiles(
    fraud_cases: pd.DataFrame, n_merchants: int, seed: int
) -> dict[str, RingProfile]:
    """Build one probabilistic shared-entity bundle per fraud pattern.

    The ``p_*`` adoption probabilities are jittered per pattern so that ring
    behaviour cannot be reproduced from any single threshold on one feature.
    """
    profiles: dict[str, RingProfile] = {}
    for row in fraud_cases.itertuples(index=False):
        pid = str(row.pattern_id)
        has_instrument = stable_float(pid, f"{seed}-ring-has-inst") < 0.55
        target = 5 + stable_int(pid, f"{seed}-ring-mcount") % 4
        cluster: list[int] = []
        attempt = 0
        while len(cluster) < min(target, n_merchants):
            cand = stable_int(pid, f"{seed}-ring-m{attempt}") % n_merchants
            if cand not in cluster:
                cluster.append(cand)
            attempt += 1
        profiles[pid] = RingProfile(
            pattern_id=pid,
            device_id=f"dev_ring_{pid}",
            ip_address=(
                f"10.66.{stable_int(pid, f'{seed}-rip-oct') % 256}."
                f"{stable_int(pid, f'{seed}-rip-oct2') % 256}"
            ),
            instrument_id=f"ins_ring_{pid}" if has_instrument else None,
            merchant_indices=tuple(sorted(cluster)),
            p_device_use=0.45 + 0.25 * stable_float(pid, f"{seed}-p-dev"),
            p_ip_use=0.65 + 0.20 * stable_float(pid, f"{seed}-p-ip"),
            p_instrument_use=0.25 + 0.15 * stable_float(pid, f"{seed}-p-inst"),
            p_merchant_use=0.30 + 0.20 * stable_float(pid, f"{seed}-p-mch"),
        )
    return profiles


# ---------------------------------------------------------------------------
# World assembly
# ---------------------------------------------------------------------------


def generate_world(
    accounts: pd.DataFrame, fraud_cases: pd.DataFrame, seed: int = 42
) -> PaymentWorld:
    """Generate the full synthetic payment world around the raw accounts.

    Args:
        accounts: Raw accounts DataFrame with column ``account_id``.
        fraud_cases: Fraud-case table with columns ``pattern_id`` and
            ``involved_accounts`` (pipe-separated account ids). Used only to
            know which accounts form which pattern - never as a feature.
        seed: Reproducibility seed.

    Returns:
        A fully assigned :class:`PaymentWorld`.
    """
    account_ids: list[str] = accounts["account_id"].astype(str).tolist()
    n_accounts = len(account_ids)
    n_merchants = max(50, n_accounts // 25)

    ring_profiles = build_ring_profiles(fraud_cases, n_merchants, seed)

    # Which ring profile governs each account (an account may appear in more
    # than one pattern; pick its lexicographically-first pattern deterministically).
    pattern_memberships: dict[str, list[str]] = {}
    for row in fraud_cases.itertuples(index=False):
        pid = str(row.pattern_id)
        for acc in str(row.involved_accounts).split("|"):
            pattern_memberships.setdefault(acc, []).append(pid)
    account_ring: dict[str, RingProfile] = {
        acc: ring_profiles[min(pids)] for acc, pids in pattern_memberships.items()
    }



    # --- devices: ~88% personal & unique, rest share a small household pool ---
    n_shared_dev = max(4, n_accounts // 30)
    account_device: dict[str, str] = {}
    for acc in account_ids:
        num = _account_num(acc)
        if stable_float(acc, f"{seed}-share-dev") < 0.12:
            account_device[acc] = f"dev_s{num % n_shared_dev:04d}"
        else:
            account_device[acc] = f"dev_{num % max(n_accounts, 1):06d}"

    # Ring members adopt the ring device as their *assigned* device with the
    # pattern's probability; otherwise they keep their normal device and may
    # still use the ring device transiently at transaction time.
    for acc, profile in account_ring.items():
        if stable_float(acc, f"{seed}-adopt-dev|{profile.pattern_id}") < profile.p_device_use:
            account_device[acc] = profile.device_id

    # --- instruments: ~92% personal, rest share a family-card style pool ---
    n_shared_ins = max(4, n_accounts // 22)
    account_instrument: dict[str, str] = {}
    for acc in account_ids:
        num = _account_num(acc)
        if stable_float(acc, f"{seed}-share-ins") < 0.08:
            account_instrument[acc] = f"ins_s{num % n_shared_ins:04d}"
        else:
            account_instrument[acc] = f"ins_{num % max(n_accounts, 1):06d}"

    for acc, profile in account_ring.items():
        if (
            profile.instrument_id is not None
            and stable_float(acc, f"{seed}-adopt-inst|{profile.pattern_id}")
            < profile.p_instrument_use
        ):
            account_instrument[acc] = profile.instrument_id

    # --- IPs: pool sized at n_accounts // 2 for realistic but lower sharing ---
    # A smaller pool (// 4) created too many IP-connected account pairs, causing
    # Louvain to absorb small fraud rings into giant IP-sharing communities.
    # Doubling the pool halves average accounts-per-IP (≈4 → ≈2), making shared
    # IP a useful weak signal without dominating the whole account graph.
    ip_pool = _ip_pool(max(8, n_accounts // 2), seed)
    account_ip: dict[str, str] = {
        acc: ip_pool[stable_int(acc, f"{seed}-pick-ip") % len(ip_pool)]
        for acc in account_ids
    }
    for acc, profile in account_ring.items():
        if stable_float(acc, f"{seed}-adopt-ip|{profile.pattern_id}") < profile.p_ip_use:
            account_ip[acc] = profile.ip_address

    # --- per-account merchant preferences (Account -> Merchant via txs) ---
    pref_merchant: dict[str, int] = {}
    alt_merchant: dict[str, int] = {}
    for acc in account_ids:
        p = stable_int(acc, f"{seed}-pref-mch") % n_merchants
        a = (p + 1 + stable_int(acc, f"{seed}-alt-mch") % max(n_merchants - 1, 1)) % n_merchants
        pref_merchant[acc] = p
        alt_merchant[acc] = a

    merchants = _build_merchants(n_merchants, seed)
    devices = _build_devices(
        max(n_accounts, 1), n_shared_dev, list(ring_profiles.values()), seed
    )
    instruments = _build_instruments(
        n_accounts, n_shared_ins, list(ring_profiles.values()), seed
    )
    ips = _build_ips(ip_pool, list(ring_profiles.values()), seed)

    instrument_type = dict(
        zip(instruments["instrument_id"], instruments["instrument_type"])
    )

    return PaymentWorld(
        seed=seed,
        accounts=accounts,
        merchants=merchants,
        devices=devices,
        instruments=instruments,
        ips=ips,
        account_device=account_device,
        account_instrument=account_instrument,
        account_ip=account_ip,
        pref_merchant=pref_merchant,
        alt_merchant=alt_merchant,
        instrument_type=instrument_type,
        ring_profiles=ring_profiles,
        account_ring=account_ring,
    )


def relationship_frames(world: PaymentWorld) -> dict[str, pd.DataFrame]:
    """Materialise Account->Device / Instrument / IP relationship tables.

    Account -> Merchant edges are intentionally *not* materialised here; they
    emerge from the enriched transactions (``src_account_id`` x
    ``merchant_id``) and are derived downstream.
    """
    acc_ids = sorted(world.account_device.keys())

    def _device_link(device_id: str) -> str:
        if device_id.startswith("dev_ring_"):
            return "ring-shared"
        if device_id.startswith("dev_s"):
            return "shared-pool"
        return "primary"

    def _instrument_link(instrument_id: str) -> str:
        if instrument_id.startswith("ins_ring_"):
            return "ring-shared"
        if instrument_id.startswith("ins_s"):
            return "shared-pool"
        return "primary"

    return {
        "account_device.csv": pd.DataFrame(
            {
                "account_id": acc_ids,
                "device_id": [world.account_device[a] for a in acc_ids],
                "link_type": [_device_link(world.account_device[a]) for a in acc_ids],
            }
        ),
        "account_payment_instrument.csv": pd.DataFrame(
            {
                "account_id": acc_ids,
                "payment_instrument_id": [world.account_instrument[a] for a in acc_ids],
                "link_type": [
                    _instrument_link(world.account_instrument[a]) for a in acc_ids
                ],
            }
        ),
        "account_ip.csv": pd.DataFrame(
            {
                "account_id": acc_ids,
                "ip_address": [world.account_ip[a] for a in acc_ids],
                "link_type": [
                    "ring-shared" if world.account_ip[a].startswith("10.66.") else "primary"
                    for a in acc_ids
                ],
            }
        ),
    }

