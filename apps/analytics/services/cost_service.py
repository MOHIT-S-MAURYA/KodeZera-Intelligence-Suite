"""
Cost estimation service.
Looks up CostRate for a given provider/model and estimates query cost.
"""
from decimal import Decimal
import logging

logger = logging.getLogger(__name__)

# Hard-coded fallback rates (USD per 1k tokens) for common providers
_FALLBACK_RATES: dict[str, dict[str, dict]] = {
    'openai': {
        'gpt-4':         {'in': Decimal('0.030'), 'out': Decimal('0.060')},
        'gpt-4o':        {'in': Decimal('0.005'), 'out': Decimal('0.015')},
        'gpt-3.5-turbo': {'in': Decimal('0.001'), 'out': Decimal('0.002')},
    },
    'anthropic': {
        'claude-3-opus':   {'in': Decimal('0.015'), 'out': Decimal('0.075')},
        'claude-3-sonnet': {'in': Decimal('0.003'), 'out': Decimal('0.015')},
        'claude-3-haiku':  {'in': Decimal('0.00025'), 'out': Decimal('0.00125')},
    },
    'ollama': {
        'default': {'in': Decimal('0'), 'out': Decimal('0')},
    },
}


def estimate_cost(
    provider: str,
    model: str,
    tokens_in: int,
    tokens_out: int,
) -> Decimal:
    """
    Estimate query cost in USD.
    First checks CostRate table; falls back to _FALLBACK_RATES.
    Returns 0 for local/unknown providers.
    """
    provider = (provider or 'unknown').lower()
    model_key = (model or '').lower()

    try:
        from apps.analytics.models import CostRate
        from django.utils import timezone
        today = timezone.now().date()

        rate = (
            CostRate.objects
            .filter(provider__iexact=provider, model__iexact=model_key, is_active=True)
            .filter(effective_from__lte=today)
            .filter(__import__('django').db.models.Q(effective_to__isnull=True) | __import__('django').db.models.Q(effective_to__gte=today))
            .order_by('-effective_from')
            .first()
        )
        if rate:
            in_cost  = rate.input_cost_per_1k  * Decimal(tokens_in)  / 1000
            out_cost = rate.output_cost_per_1k * Decimal(tokens_out) / 1000
            return in_cost + out_cost
    except Exception as exc:
        logger.debug("estimate_cost DB lookup failed: %s", exc)

    # Fallback
    rates = _FALLBACK_RATES.get(provider, {})
    rate_dict = rates.get(model_key) or rates.get('default')
    if rate_dict:
        in_cost  = rate_dict['in']  * Decimal(tokens_in)  / 1000
        out_cost = rate_dict['out'] * Decimal(tokens_out) / 1000
        return in_cost + out_cost

    return Decimal('0')
