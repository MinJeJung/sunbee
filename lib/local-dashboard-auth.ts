const trustedLocalMode = "true";

export function isLocalDashboardTrusted() {
  return process.env["LOCAL_DASHBOARD_TRUSTED"] === trustedLocalMode;
}
