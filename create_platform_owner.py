#!/usr/bin/env python
"""
Script to create a platform owner (superuser) account.
"""
import os
import sys
import django

# Add the project directory to the Python path
sys.path.insert(0, '/Users/mohitmaurya/dev/internship')

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.core.models import User

# Create superuser
email = 'owner@kodezera.com'
password = 'owner123'
username = 'platform_owner'

# Check if user already exists
if User.objects.filter(email=email).exists():
    print(f'❌ User with email {email} already exists')
    user = User.objects.get(email=email)
    print(f'   User: {user.email}')
    print(f'   Is superuser: {user.is_superuser}')
    print(f'   Tenant: {user.tenant}')
else:
    # Create the superuser
    user = User.objects.create_superuser(
        email=email,
        password=password,
        username=username,
        first_name='Platform',
        last_name='Owner'
    )
    print(f'✅ Successfully created platform owner account!')
    print(f'   Email: {email}')
    print(f'   Password: {password}')
    print(f'   Username: {username}')
    print(f'   Is superuser: {user.is_superuser}')
    print(f'   Is staff: {user.is_staff}')
    print(f'   Tenant: {user.tenant} (None = Platform Owner)')
