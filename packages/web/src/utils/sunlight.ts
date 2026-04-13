// Sunrise/sunset calculation using the standard solar algorithm.
// Default coordinates: Melbourne, Australia (-37.81, 144.96).

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

function sinD(deg: number) { return Math.sin(deg * DEG); }
function cosD(deg: number) { return Math.cos(deg * DEG); }
function asinD(x: number) { return Math.asin(x) * RAD; }
function acosD(x: number) { return Math.acos(x) * RAD; }

export function getSunTimes(
  date: Date,
  lat = -37.81,
  lng = 144.96,
): { sunrise: Date; sunset: Date } {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  // Day of year
  const n1 = Math.floor(275 * month / 9);
  const n2 = Math.floor((month + 9) / 12);
  const n3 = 1 + Math.floor((year - 4 * Math.floor(year / 4) + 2) / 3);
  const N = n1 - n2 * n3 + day - 30;

  // Sun's mean anomaly
  const M = (0.9856 * N) - 3.289;

  // Sun's true longitude
  let L = M + 1.916 * sinD(M) + 0.020 * sinD(2 * M) + 282.634;
  L = ((L % 360) + 360) % 360;

  // Right ascension
  let RA = Math.atan(0.91764 * Math.tan(L * DEG)) * RAD;
  RA = ((RA % 360) + 360) % 360;

  const lQuad = Math.floor(L / 90) * 90;
  const raQuad = Math.floor(RA / 90) * 90;
  RA = RA + (lQuad - raQuad);
  RA = RA / 15; // convert to hours

  const sinDec = 0.39782 * sinD(L);
  const cosDec = Math.cos(Math.asin(sinDec));

  // Zenith for civil sunrise/sunset (official = 90.833)
  const zenith = 90.833;
  const cosH = (cosD(zenith) - sinDec * sinD(lat)) / (cosDec * cosD(lat));

  // Clamp for polar regions (shouldn't happen for Melbourne)
  const cosHClamped = Math.max(-1, Math.min(1, cosH));

  // Sunset hour angle
  const Hset = acosD(cosHClamped) / 15;
  const Hrise = (360 - acosD(cosHClamped)) / 15;

  const lngHour = lng / 15;
  const tRise = N + (6 - lngHour) / 24;
  const tSet = N + (18 - lngHour) / 24;

  function toLocalDate(T: number, H: number): Date {
    let UT = H + RA - 0.06571 * T - 6.622 - lngHour;
    UT = ((UT % 24) + 24) % 24;

    // Convert UT to local time using JS timezone offset
    const jan1 = new Date(year, 0, 1);
    const target = new Date(year, month - 1, day);
    // Use the target date's offset for DST accuracy
    const offsetHours = -target.getTimezoneOffset() / 60;
    let local = UT + offsetHours;
    local = ((local % 24) + 24) % 24;

    const hours = Math.floor(local);
    const minutes = Math.round((local - hours) * 60);

    return new Date(year, month - 1, day, hours, minutes);
  }

  return {
    sunrise: toLocalDate(tRise, Hrise),
    sunset: toLocalDate(tSet, Hset),
  };
}
