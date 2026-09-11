const ACCESS_KEY = "pp_access_token";
const REFRESH_KEY = "pp_refresh_token";

function migrarTokensLegados() {
  const access = localStorage.getItem(ACCESS_KEY);
  const refresh = localStorage.getItem(REFRESH_KEY);
  if (access && !sessionStorage.getItem(ACCESS_KEY)) sessionStorage.setItem(ACCESS_KEY, access);
  if (refresh && !sessionStorage.getItem(REFRESH_KEY)) sessionStorage.setItem(REFRESH_KEY, refresh);
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

migrarTokensLegados();

export const tokenStorage = {
  getAccess: () => sessionStorage.getItem(ACCESS_KEY),
  getRefresh: () => sessionStorage.getItem(REFRESH_KEY),
  setTokens(access, refresh) {
    if (access) sessionStorage.setItem(ACCESS_KEY, access);
    if (refresh) sessionStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    sessionStorage.removeItem(ACCESS_KEY);
    sessionStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};
