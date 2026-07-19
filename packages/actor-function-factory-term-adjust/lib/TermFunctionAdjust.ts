import { TermFunctionBase } from '@comunica/bus-function-factory';
import type {
  DayTimeDurationLiteral,
  StringLiteral,
} from '@comunica/utils-expression-evaluator';
import {
  defaultedDateTimeRepresentation,
  defaultedDurationRepresentation,
  addDurationToDateTime,
  DateTimeLiteral,
  declare,
  InvalidTimezoneCall,
  TypeURL,
  DateLiteral,
  TimeLiteral,
} from '@comunica/utils-expression-evaluator';

export function adjustDateTime(
  [ dateLiteral, zoneLiteral ]: [DateTimeLiteral, DayTimeDurationLiteral],
): DateTimeLiteral {
  const dateTime = dateLiteral.typedValue;
  const zone = zoneLiteral.typedValue;
  if (dateTime.zoneHours === undefined && dateTime.zoneMinutes === undefined) {
    // If $arg does not have a timezone component and $timezone is not the empty sequence,
    //   then the result is $arg with $timezone as the timezone component.
    return new DateTimeLiteral({
      ...dateTime,
      zoneHours: zone.hours,
      zoneMinutes: zone.minutes,
    });
  }
  // If $arg has a timezone component and $timezone is not the empty sequence, then the result is the xs:dateTime value
  // that is equal to $arg and that has a timezone component equal to $timezone.

  // Adjust time: result = arg + (newTimezone - oldTimezone)
  const timeDif = defaultedDurationRepresentation({
    hours: (zone.hours ?? 0) - (dateTime.zoneHours ?? 0),
    minutes: (zone.minutes ?? 0) - (dateTime.zoneMinutes ?? 0),
  });
  const firstOp = addDurationToDateTime(dateTime, timeDif);
  return new DateTimeLiteral({
    ...firstOp,
    zoneHours: zone.hours,
    zoneMinutes: zone.minutes,
  });
}

/**
 * When the timezone argument is the empty sequence (represented in SPARQL as an empty string),
 * the result is the given value with its timezone component removed.
 * A non-empty string is not a valid timezone argument and raises an expression error.
 */
function assertEmptyTimezone(timezone: StringLiteral): void {
  if (timezone.typedValue !== '') {
    throw new InvalidTimezoneCall(timezone.typedValue);
  }
}

/**
 * https://github.com/w3c/sparql-dev/blob/main/SEP/SEP-0002/sep-0002.md
 * https://www.w3.org/TR/xpath-functions/#func-adjust-dateTime-to-timezone
 */
export class TermFunctionAdjust extends TermFunctionBase {
  public constructor() {
    super({
      arity: 2,
      operator: 'adjust',
      overloads: declare('adjust')
        .set(
          [ TypeURL.XSD_DATE_TIME, TypeURL.XSD_DAY_TIME_DURATION ],
          () => adjustDateTime,
        ).set(
          [ TypeURL.XSD_DATE, TypeURL.XSD_DAY_TIME_DURATION ],
          () => ([ date, timezone ]: [DateLiteral, DayTimeDurationLiteral]) => {
            const asDateTime = new DateTimeLiteral(defaultedDateTimeRepresentation(date.typedValue));
            const asTimedDate = adjustDateTime([ asDateTime, timezone ]);
            const tv = asTimedDate.typedValue;
            return new DateLiteral({
              day: tv.day,
              month: tv.month,
              year: tv.year,
              zoneHours: tv.zoneHours,
              zoneMinutes: tv.zoneMinutes,
            });
          },
        ).set(
          [ TypeURL.XSD_TIME, TypeURL.XSD_DAY_TIME_DURATION ],
          () => ([ time, timezone ]: [TimeLiteral, DayTimeDurationLiteral]) => {
            const asDateTime = new DateTimeLiteral({
              ...time.typedValue,
              year: 1972,
              month: 12,
              day: 31,
            });
            const asTimedDate = adjustDateTime([ asDateTime, timezone ]);
            const tv = asTimedDate.typedValue;
            return new TimeLiteral({
              hours: tv.hours,
              minutes: tv.minutes,
              seconds: tv.seconds,
              zoneHours: tv.zoneHours,
              zoneMinutes: tv.zoneMinutes,
            });
          },
        ).set(
          [ TypeURL.XSD_DATE_TIME, TypeURL.XSD_STRING ],
          () => ([ dateLiteral, timezone ]: [DateTimeLiteral, StringLiteral]) => {
            assertEmptyTimezone(timezone);
            return new DateTimeLiteral({
              ...dateLiteral.typedValue,
              zoneHours: undefined,
              zoneMinutes: undefined,
            });
          },
        ).set(
          [ TypeURL.XSD_DATE, TypeURL.XSD_STRING ],
          () => ([ date, timezone ]: [DateLiteral, StringLiteral]) => {
            assertEmptyTimezone(timezone);
            return new DateLiteral({
              ...date.typedValue,
              zoneHours: undefined,
              zoneMinutes: undefined,
            });
          },
        ).set(
          [ TypeURL.XSD_TIME, TypeURL.XSD_STRING ],
          () => ([ time, timezone ]: [TimeLiteral, StringLiteral]) => {
            assertEmptyTimezone(timezone);
            return new TimeLiteral({
              ...time.typedValue,
              zoneHours: undefined,
              zoneMinutes: undefined,
            });
          },
        ).collect(),
    });
  }
}
