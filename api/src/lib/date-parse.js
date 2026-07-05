function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function isValidCalendarDate(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1) return false;
  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

function parseFlexibleDate(a, b, year) {
  a = Number(a);
  b = Number(b);
  year = Number(year);

  let day, month;
  if (a > 12 && b <= 12) {
    day = a;
    month = b;
  } else if (b > 12 && a <= 12) {
    day = b;
    month = a;
  } else if (a <= 12 && b <= 12) {
    // Genuinely ambiguous — default to the source's known convention, MM/DD.
    month = a;
    day = b;
  } else {
    throw new Error(`neither "${a}" nor "${b}" can be a valid month (both greater than 12)`);
  }

  if (!isValidCalendarDate(year, month, day)) {
    throw new Error(`"${year}-${month}-${day}" is not a valid calendar date`);
  }

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

module.exports = { parseFlexibleDate, isValidCalendarDate, isLeapYear };
