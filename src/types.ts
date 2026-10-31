export type AppRole =
  | "SUPER_ADMIN"
  | "ADMIN"
  | "ORGANIZER"
  | "SECRETARY"
  | "WEIGH_IN_OPERATOR"
  | "CHIEF_JUDGE"
  | "JUDGE"
  | "OBSERVER";

export type Tournament = {
  id: string;
  name: string;
  location: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: "draft" | "published" | "registration_closed" | "completed";
};

export type ParticipationApplication = {
  id: string;
  tournament_id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  club_name: string | null;
  body_weight: number | null;
  arm: "left" | "right" | "both";
  status: "pending" | "approved" | "rejected";
  created_at: string;
  tournaments?: { name: string } | null;
};
