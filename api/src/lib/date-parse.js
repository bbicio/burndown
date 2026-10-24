const { isValidCalendarDate, isLeapYear } = require('./dates');

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
