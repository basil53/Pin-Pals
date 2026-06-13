import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

// ─── Players ──────────────────────────────────────────────────────────────────
export async function loadPlayers() {
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) { console.error(error); return []; }
  return data || []
}

export async function savePlayer(player) {
  const { error } = await supabase
    .from('players')
    .upsert({
      id: player.id,
      first_name: player.firstName,
      last_name: player.lastName,
      nickname: player.nickname,
      location: player.location || null,
      created_at: player.createdAt,
    })
  if (error) console.error(error)
}

// ─── Sessions ─────────────────────────────────────────────────────────────────
export async function loadSessions() {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) { console.error(error); return []; }
  return (data || []).map(row => ({
    id: row.id,
    playerId: row.player_id,
    frames: row.frames,
    score: row.score,
    date: row.date,
    venue: row.venue,
    source: row.source,
    createdAt: row.created_at,
  }))
}

export async function saveSession(session) {
  const { error } = await supabase
    .from('sessions')
    .upsert({
      id: session.id,
      player_id: session.playerId,
      frames: session.frames,
      score: session.score,
      date: session.date,
      venue: session.venue || null,
      source: session.source || 'live',
      created_at: session.createdAt,
    })
  if (error) console.error(error)
}
