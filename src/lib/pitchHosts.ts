// The EstateKit people who can be put on a /pitch discovery call. The booking
// card shows these as toggles ("Who's taking this call?"); the chosen ones are
// invited to the Google Calendar event (and Meet) for that booking only — it
// never touches the lead or its automations. Keep this list in step with the
// copy in supabase/functions/booking-admin (SET_HOSTS validates against it).
export interface PitchHost {
  name: string;
  email: string;
}

// The email MUST be the Google account the person actually uses, so the pitch
// event lands on their own calendar: Kieran = ousebk@gmail.com,
// Khushil = khushilg14@gmail.com (not their @estatekit.co addresses).
export const PITCH_HOSTS: PitchHost[] = [
  { name: "Kieran", email: "ousebk@gmail.com" },
  { name: "Khushil", email: "khushilg14@gmail.com" },
];

const BY_EMAIL = new Map(PITCH_HOSTS.map((h) => [h.email.toLowerCase(), h]));

/** The display name for a host email, or the email if it isn't a known host. */
export const hostName = (email: string): string => BY_EMAIL.get(email.toLowerCase())?.name ?? email;
