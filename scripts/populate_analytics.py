
import os
import sys
import django
import random
from datetime import timedelta
from django.utils import timezone

# Setup Django environment
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.core.models import Tenant, UsageMetrics

def populate_analytics():
    print("Populating analytics data...")
    
    tenants = Tenant.objects.all()
    if not tenants.exists():
        print("No tenants found. creating one...")
        Tenant.objects.create(name="Demo Tenant", slug="demo", is_active=True)
        tenants = Tenant.objects.all()
        
    end_date = timezone.now().date()
    start_date = end_date - timedelta(days=90)
    
    current_date = start_date
    created_count = 0
    
    while current_date <= end_date:
        for tenant in tenants:
            # Check if metrics already exist
            if not UsageMetrics.objects.filter(tenant=tenant, date=current_date).exists():
                # Generate random data with some trends
                # Weekends have less traffic
                is_weekend = current_date.weekday() >= 5
                base_multiplier = 0.3 if is_weekend else 1.0
                
                # Trend: increasing over time
                days_from_start = (current_date - start_date).days
                trend_multiplier = 1 + (days_from_start / 90) * 2 # Triple over 90 days
                
                queries = int(random.randint(100, 1000) * base_multiplier * trend_multiplier)
                failed = int(queries * random.uniform(0.0, 0.05)) # 0-5% failure rate
                latency = random.uniform(100, 500) # 100-500ms
                tokens = queries * random.randint(50, 500) # 50-500 tokens per query
                users = int(random.randint(5, 50) * base_multiplier * trend_multiplier)
                
                UsageMetrics.objects.create(
                    tenant=tenant,
                    date=current_date,
                    queries_count=queries,
                    failed_queries_count=failed,
                    avg_response_time_ms=latency,
                    tokens_used=tokens,
                    active_users_count=users,
                    storage_used_bytes=random.randint(1000000, 1000000000) # Random storage
                )
                created_count += 1
        
        current_date += timedelta(days=1)
        
    print(f"Successfully created {created_count} UsageMetrics records.")

if __name__ == '__main__':
    populate_analytics()
