const OPTIONAL_PERMISSION_MAP: Record<string, string[]> = {
  management: ['management'],
  debugger: ['debugger'],
  clipboard: ['clipboardRead', 'clipboardWrite'],
};

export function getRequiredPermissions(category: string): string[] {
  return OPTIONAL_PERMISSION_MAP[category] ?? [];
}

export async function checkPermissions(perms: string[]): Promise<boolean> {
  if (!perms.length) return true;
  try {
    return await chrome.permissions.contains({ permissions: perms });
  } catch {
    return true;
  }
}

export async function requestPermissions(perms: string[]): Promise<boolean> {
  if (!perms.length) return true;
  try {
    return await chrome.permissions.request({ permissions: perms });
  } catch {
    return false;
  }
}
