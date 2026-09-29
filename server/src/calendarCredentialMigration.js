function parseLegacyCalendar(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function migrateLegacyGoogleCalendarRows({ rows, saveConnection, scrubProfile }) {
  if (!Array.isArray(rows) || typeof saveConnection !== 'function' || typeof scrubProfile !== 'function') {
    throw new TypeError('Legacy calendar migration requires rows and persistence callbacks.');
  }
  let migrated = 0;
  for (const row of rows) {
    const legacy = parseLegacyCalendar(row.calendarJson);
    if (!legacy || legacy.provider !== 'google') continue;
    const accessToken = legacy.accessToken || legacy.access_token;
    const refreshToken = legacy.refreshToken || legacy.refresh_token;
    if (!accessToken && !refreshToken) continue;
    const saved = saveConnection(row.ownerId, {
      access_token: accessToken || null,
      refresh_token: refreshToken || null,
      token_type: legacy.tokenType || legacy.token_type || 'Bearer',
      scope: legacy.scope || '',
      calendarId: legacy.calendarId || 'primary',
      expiresAt: legacy.expiresAt || null,
      expiresAtUtc: legacy.expiresAtUtc || null
    });
    scrubProfile(row.ownerId, {
      provider: 'google',
      status: saved.status || 'connected',
      calendarId: saved.calendarId || legacy.calendarId || 'primary',
      expiresAtUtc: saved.expiresAtUtc || null,
      calendlyUrl: null
    });
    migrated += 1;
  }
  return migrated;
}
