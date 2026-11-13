import { useAuthStore } from "../stores/useAuthStore";

export const useAuth = () => {
  const { user, accessToken, isLoading, login, logout, updateAccessToken, refreshUser } =
    useAuthStore();

  return {
    user,
    accessToken,
    isLoading,
    login,
    logout,
    updateAccessToken,
    refreshUser,
    isAuthenticated: !!user && !!accessToken,
    role: user?.role,
  };
};
