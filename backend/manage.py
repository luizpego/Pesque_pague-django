#!/usr/bin/env python
"""Utilitário de linha de comando do Django para o projeto Pesque & Pague."""
import os
import sys


def main():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "pescapague.settings")
    try:
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        raise ImportError(
            "Não foi possível importar o Django. Você ativou o ambiente virtual "
            "e instalou o requirements.txt (pip install -r requirements.txt)?"
        ) from exc
    execute_from_command_line(sys.argv)


if __name__ == "__main__":
    main()
