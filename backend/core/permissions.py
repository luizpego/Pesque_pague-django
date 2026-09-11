from rest_framework import permissions


class EhStaffOperacional(permissions.BasePermission):
    """Permite acesso apenas a garçons, cozinha e gerentes."""

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and (request.user.is_staff_operacional or request.user.is_superuser)
        )


class EhGerente(permissions.BasePermission):
    """Restringe alterações administrativas a gerentes e superusuários."""

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and (user.is_superuser or user.papel == user.Papel.GERENTE)
        )


class EhAtendimentoPesca(permissions.BasePermission):
    """Permite operar a pesca a atendentes/garçons e gerentes."""

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and (
                user.is_superuser
                or user.papel in {user.Papel.GARCOM, user.Papel.GERENTE}
            )
        )


class ComandaEhDoClienteOuStaff(permissions.BasePermission):
    """Cliente só vê/edita a própria comanda; staff operacional vê todas."""

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.is_superuser or user.is_staff_operacional:
            return True
        return obj.cliente_id == user.id
