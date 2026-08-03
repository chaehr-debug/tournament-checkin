'use client'

import { useEffect } from 'react'
import { supabaseBrowser } from '@/lib/supabase/browser'

export function useRealtimeMatches(tournamentId: string, onChange: () => void) {
  useEffect(() => {
    const channel = supabaseBrowser
      .channel(`matches-${tournamentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => {
        onChange()
      })
      .subscribe()

    return () => {
      supabaseBrowser.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId])
}
