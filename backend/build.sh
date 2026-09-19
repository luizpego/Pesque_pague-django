#!/usr/bin/env bash
set -o errexit

pip install -r requirements.txt
python manage.py collectstatic --no-input
python manage.py migrate
# Garante admin padrão no deploy (Render) - mesma credencial do ambiente local
# Se DJANGO_SUPERUSER_* estiverem definidas no ambiente, respeita elas; senão usa fallback
python manage.py shell << 'PYEOF'
from django.contrib.auth import get_user_model
import os
U = get_user_model()
username = os.environ.get("DJANGO_SUPERUSER_USERNAME", "admin")
email = os.environ.get("DJANGO_SUPERUSER_EMAIL", "admin@pesquepague.local")
password = os.environ.get("DJANGO_SUPERUSER_PASSWORD", "Pesque2026@Admin")
u, created = U.objects.get_or_create(username=username, defaults={"email": email, "is_staff": True, "is_superuser": True, "is_active": True, "papel": "gerente"})
if not created:
    u.is_staff = True
    u.is_superuser = True
    u.is_active = True
    u.papel = "gerente"
    u.email = email
u.set_password(password)
u.save()
print(f"ADMIN ENSURED: {username} created={created}")
PYEOF
python manage.py check --deploy
