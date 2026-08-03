export type TournamentStatus = 'setup' | 'in_progress' | 'done'

export interface Tournament {
  id: string
  name: string
  status: TournamentStatus
  created_at: string
}

export interface Team {
  id: string
  tournament_id: string
  name: string
  members: string | null
}

export interface Round {
  id: string
  tournament_id: string
  name: string
  order: number
  match_count: number
}

export interface Match {
  id: string
  round_id: string
  slot: number
  team_a_id: string | null
  team_b_id: string | null
  team_a_checked_in: boolean
  team_b_checked_in: boolean
  winner_id: string | null
  next_match_id: string | null
  next_match_slot: 'A' | 'B' | null
}

export interface TournamentDetail {
  tournament: Tournament
  rounds: Array<Round & { matches: Match[] }>
  teams: Team[]
}
