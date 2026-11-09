window.jtownFormatDate = function(value, includeTime = true) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    ...(includeTime ? { hour: 'numeric', minute: '2-digit', hour12: true } : {})
  }).formatToParts(date);
  const get = type => parts.find(part => part.type === type)?.value || '';
  const day = `${get('weekday')}. ${get('month')} ${get('day')}, ${get('year')}`;
  return includeTime ? `${day} · ${get('hour')}:${get('minute')} ${get('dayPeriod')}` : day;
};
