import { useAuthStore } from "../stores/useAuthStore";

export const useAuth = () => {
  const { user, accessToken, isLoading, login, logout, updateAccessToken } =
    useAuthStore();

  return {
    user,
    accessToken,
    isLoading,
    login,
    logout,
    updateAccessToken,
    isAuthenticated: !!user && !!accessToken,
    role: user?.role,
  };
};
