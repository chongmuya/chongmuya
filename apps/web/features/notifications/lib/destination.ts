const uuid =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
export function notificationDestination(value: string) {
  if (
    new RegExp(
      `^/events\\?event=${uuid}(?:&view=(?:reservation|settlement|record|roster|attendance))?$`,
      "i",
    ).test(value) ||
    new RegExp(`^/events\\?event=${uuid}&request=${uuid}$`, "i").test(value) ||
    new RegExp(
      `^/owner/(?:reservations\\?reservation|inquiries\\?target)=${uuid}$`,
      "i",
    ).test(value) ||
    new RegExp(`^/calendar\\?schedule=${uuid}$`, "i").test(value)
  )
    return value;
  return null;
}
